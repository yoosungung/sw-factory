<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

use PDO;

final class SessionStore
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        $this->migrate();
    }

    public static function inMemory(): self
    {
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        return new self($pdo);
    }

    public static function fromPath(string $path): self
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("Cannot create SessionStore directory: {$dir}");
        }

        $pdo = new PDO('sqlite:' . $path);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        return new self($pdo);
    }

    private function migrate(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS cursorbridge_sessions (
                ticket_id INTEGER PRIMARY KEY,
                agent_id TEXT NOT NULL,
                assignee_user_id INTEGER,
                updated_at TEXT NOT NULL
            )'
        );
        $this->migrateRetryQueue();
        $this->migrateScheduleFires();
    }

    private function migrateScheduleFires(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS cursorbridge_schedule_fires (
                schedule_id TEXT NOT NULL,
                fire_key TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (schedule_id, fire_key)
            )'
        );
    }

    private function migrateRetryQueue(): void
    {
        $columns = $this->pdo->query('PRAGMA table_info(cursorbridge_retry_queue)')->fetchAll(PDO::FETCH_ASSOC);
        $hasTicketId = false;
        foreach ($columns as $column) {
            if (($column['name'] ?? '') === 'ticket_id') {
                $hasTicketId = true;
                break;
            }
        }

        if ($columns !== [] && !$hasTicketId) {
            $this->pdo->exec('DROP TABLE cursorbridge_retry_queue');
        }

        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS cursorbridge_retry_queue (
                ticket_id INTEGER NOT NULL,
                runner_url TEXT NOT NULL,
                method TEXT NOT NULL,
                body_json TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (ticket_id, runner_url)
            )'
        );
    }

    public function getAgentId(int $ticketId): ?string
    {
        $stmt = $this->pdo->prepare('SELECT agent_id FROM cursorbridge_sessions WHERE ticket_id = ?');
        $stmt->execute([$ticketId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? (string) $row['agent_id'] : null;
    }

    public function getAssigneeUserId(int $ticketId): ?int
    {
        $stmt = $this->pdo->prepare('SELECT assignee_user_id FROM cursorbridge_sessions WHERE ticket_id = ?');
        $stmt->execute([$ticketId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false || $row['assignee_user_id'] === null) {
            return null;
        }

        return (int) $row['assignee_user_id'];
    }

    public function upsert(int $ticketId, string $agentId, ?int $assigneeUserId): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO cursorbridge_sessions (ticket_id, agent_id, assignee_user_id, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(ticket_id) DO UPDATE SET
               agent_id = excluded.agent_id,
               assignee_user_id = excluded.assignee_user_id,
               updated_at = excluded.updated_at'
        );
        $stmt->execute([
            $ticketId,
            $agentId,
            $assigneeUserId,
            (new \DateTimeImmutable())->format(DATE_ATOM),
        ]);
    }

    public function delete(int $ticketId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM cursorbridge_sessions WHERE ticket_id = ?');
        $stmt->execute([$ticketId]);
    }

    /**
     * @return list<array{ticket_id: int, agent_id: string}>
     */
    public function listByAssignee(int $assigneeUserId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ticket_id, agent_id FROM cursorbridge_sessions
             WHERE assignee_user_id = ?
             ORDER BY ticket_id ASC'
        );
        $stmt->execute([$assigneeUserId]);
        $rows = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $rows[] = [
                'ticket_id' => (int) $row['ticket_id'],
                'agent_id' => (string) $row['agent_id'],
            ];
        }

        return $rows;
    }

    /**
     * Claim a schedule fire for this minute. Returns false if already claimed.
     */
    public function claimScheduleFire(string $scheduleId, string $fireKey): bool
    {
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO cursorbridge_schedule_fires (schedule_id, fire_key, created_at)
                 VALUES (?, ?, ?)'
            );
            $stmt->execute([
                $scheduleId,
                $fireKey,
                (new \DateTimeImmutable())->format(DATE_ATOM),
            ]);

            return true;
        } catch (\PDOException) {
            return false;
        }
    }

    public function enqueueRetry(int $ticketId, string $runnerUrl, string $method, array $body): void
    {
        $now = (new \DateTimeImmutable())->format(DATE_ATOM);
        $stmt = $this->pdo->prepare(
            'INSERT INTO cursorbridge_retry_queue (ticket_id, runner_url, method, body_json, attempts, created_at, updated_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)
             ON CONFLICT(ticket_id, runner_url) DO UPDATE SET
               method = excluded.method,
               body_json = excluded.body_json,
               attempts = 0,
               updated_at = excluded.updated_at'
        );
        $stmt->execute([
            $ticketId,
            $runnerUrl,
            $method,
            json_encode($body, JSON_THROW_ON_ERROR),
            $now,
            $now,
        ]);
    }

    public function clearRetries(int $ticketId, string $runnerUrl): void
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM cursorbridge_retry_queue WHERE ticket_id = ? AND runner_url = ?'
        );
        $stmt->execute([$ticketId, $runnerUrl]);
    }

    /** @return list<array{ticket_id: int, runner_url: string, method: string, body: array<string, mixed>, attempts: int}> */
    public function pendingRetries(int $limit = 20): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ticket_id, runner_url, method, body_json, attempts
             FROM cursorbridge_retry_queue
             WHERE attempts < 5
             ORDER BY updated_at ASC
             LIMIT ?'
        );
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $body = json_decode((string) $row['body_json'], true);
            if (!is_array($body)) {
                continue;
            }
            $rows[] = [
                'ticket_id' => (int) $row['ticket_id'],
                'runner_url' => (string) $row['runner_url'],
                'method' => (string) $row['method'],
                'body' => $body,
                'attempts' => (int) $row['attempts'],
            ];
        }

        return $rows;
    }

    public function markRetryAttempt(int $ticketId, string $runnerUrl): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE cursorbridge_retry_queue
             SET attempts = attempts + 1, updated_at = ?
             WHERE ticket_id = ? AND runner_url = ?'
        );
        $stmt->execute([
            (new \DateTimeImmutable())->format(DATE_ATOM),
            $ticketId,
            $runnerUrl,
        ]);
    }

    public function deleteRetry(int $ticketId, string $runnerUrl): void
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM cursorbridge_retry_queue WHERE ticket_id = ? AND runner_url = ?'
        );
        $stmt->execute([$ticketId, $runnerUrl]);
    }
}
