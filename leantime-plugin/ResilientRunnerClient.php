<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class ResilientRunnerClient
{
    private RunnerTransport $inner;
    private SessionStore $sessions;

    public function __construct(RunnerTransport $inner, SessionStore $sessions)
    {
        $this->inner = $inner;
        $this->sessions = $sessions;
    }

    /**
     * @param array{timeout_ms?: int}|null $budget
     * @param list<string> $successChecks
     * @return array{agent_id: string}|null
     */
    public function createSession(
        string $runnerUrl,
        string $prompt,
        ?int $ticketId = null,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): ?array {
        $meta = ['prompt' => $prompt];
        if ($ticketId !== null) {
            $meta['ticket_id'] = $ticketId;
        }
        $meta = $this->controlMeta($meta, $budget, $successChecks, $successMaxAttempts);

        return $this->call(
            'create',
            $runnerUrl,
            $ticketId ?? 0,
            $meta,
            fn (): array => $this->inner->createSession(
                $runnerUrl,
                $prompt,
                $ticketId,
                $budget,
                $successChecks,
                $successMaxAttempts
            )
        );
    }

    /**
     * @param array{timeout_ms?: int}|null $budget
     * @param list<string> $successChecks
     * @return array{run_id: string, status: string}|null
     */
    public function prompt(
        string $runnerUrl,
        string $agentId,
        string $prompt,
        string $event,
        int $ticketId,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): ?array {
        $meta = [
            'agent_id' => $agentId,
            'prompt' => $prompt,
            'event' => $event,
            'ticket_id' => $ticketId,
        ];
        $meta = $this->controlMeta($meta, $budget, $successChecks, $successMaxAttempts);
        try {
            $result = $this->inner->prompt(
                $runnerUrl,
                $agentId,
                $prompt,
                $event,
                $ticketId,
                $budget,
                $successChecks,
                $successMaxAttempts
            );
            $this->sessions->clearRetries($ticketId, $runnerUrl);

            return $result;
        } catch (RunnerSessionNotFoundException) {
            $this->sessions->enqueueRetry($ticketId, $runnerUrl, 'prompt', $meta);

            return null;
        } catch (\Throwable) {
            $this->sessions->enqueueRetry($ticketId, $runnerUrl, 'prompt', $meta);

            return ['run_id' => '', 'status' => 'deferred'];
        }
    }

    public function deleteSession(string $runnerUrl, string $agentId, int $ticketId): void
    {
        $this->call('delete', $runnerUrl, $ticketId, ['agent_id' => $agentId], function () use ($runnerUrl, $agentId): ?array {
            $this->inner->deleteSession($runnerUrl, $agentId);

            return ['ok' => true];
        });
    }

    public function flushRetries(): int
    {
        $processed = 0;
        foreach ($this->sessions->pendingRetries() as $item) {
            try {
                if ($item['method'] === 'create') {
                    $ticketId = array_key_exists('ticket_id', $item['body'])
                        ? (int) $item['body']['ticket_id']
                        : null;
                    $this->inner->createSession(
                        $item['runner_url'],
                        (string) $item['body']['prompt'],
                        $ticketId,
                        $this->budgetFromBody($item['body']),
                        $this->checksFromBody($item['body']),
                        $this->maxAttemptsFromBody($item['body'])
                    );
                } elseif ($item['method'] === 'prompt') {
                    $this->inner->prompt(
                        $item['runner_url'],
                        (string) $item['body']['agent_id'],
                        (string) $item['body']['prompt'],
                        (string) $item['body']['event'],
                        (int) $item['body']['ticket_id'],
                        $this->budgetFromBody($item['body']),
                        $this->checksFromBody($item['body']),
                        $this->maxAttemptsFromBody($item['body'])
                    );
                } elseif ($item['method'] === 'delete') {
                    $this->inner->deleteSession(
                        $item['runner_url'],
                        (string) $item['body']['agent_id']
                    );
                }
                $this->sessions->deleteRetry($item['ticket_id'], $item['runner_url']);
                ++$processed;
            } catch (\Throwable) {
                $this->sessions->markRetryAttempt($item['ticket_id'], $item['runner_url']);
            }
        }

        return $processed;
    }

    /**
     * @param array<string, mixed> $body
     * @return array{timeout_ms?: int}|null
     */
    private function budgetFromBody(array $body): ?array
    {
        $budget = $body['budget'] ?? null;

        return is_array($budget) && $budget !== [] ? $budget : null;
    }

    /**
     * @param array<string, mixed> $body
     * @return list<string>
     */
    private function checksFromBody(array $body): array
    {
        $checks = $body['success_checks'] ?? [];

        return is_array($checks) ? array_values(array_filter($checks, 'is_string')) : [];
    }

    /**
     * @param array<string, mixed> $body
     */
    private function maxAttemptsFromBody(array $body): ?int
    {
        $max = $body['success_retry']['max_attempts'] ?? null;

        return is_int($max) ? $max : null;
    }

    /**
     * @param array<string, mixed> $meta
     * @param array{timeout_ms?: int}|null $budget
     * @param list<string> $successChecks
     * @return array<string, mixed>
     */
    private function controlMeta(array $meta, ?array $budget, array $successChecks, ?int $successMaxAttempts): array
    {
        if ($budget !== null && $budget !== []) {
            $meta['budget'] = $budget;
        }
        if ($successChecks !== []) {
            $meta['success_checks'] = array_values($successChecks);
        }
        if ($successMaxAttempts !== null) {
            $meta['success_retry'] = ['max_attempts' => $successMaxAttempts];
        }

        return $meta;
    }

    /**
     * Runner failures must not break the Leantime request that fired the event.
     *
     * @param array<string, mixed> $meta
     * @param callable(): array<string, mixed> $action
     * @return array<string, mixed>|null
     */
    private function call(string $method, string $runnerUrl, int $ticketId, array $meta, callable $action): ?array
    {
        try {
            $result = $action();
            $this->sessions->clearRetries($ticketId, $runnerUrl);

            return $result;
        } catch (\Throwable) {
            $this->sessions->enqueueRetry($ticketId, $runnerUrl, $method, $meta);

            return null;
        }
    }
}
