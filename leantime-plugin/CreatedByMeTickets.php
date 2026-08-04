<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Tickets authored by a user: open, or Done within N days (tickethistory close).
 */
final class CreatedByMeTickets
{
    public const DEFAULT_DONE_WITHIN_DAYS = 5;

    /** @var null|callable(int, int): list<array<string, mixed>> */
    private $query;

    private int $doneWithinDays;

    /**
     * @param  null|callable(int, int): list<array<string, mixed>>  $query
     */
    public function __construct(?callable $query = null, int $doneWithinDays = self::DEFAULT_DONE_WITHIN_DAYS)
    {
        $this->query = $query;
        $this->doneWithinDays = max(0, $doneWithinDays);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listFor(int $userId): array
    {
        if ($userId <= 0) {
            return [];
        }

        try {
            $rows = ($this->query ?? self::defaultQuery(...))($userId, $this->doneWithinDays);

            return is_array($rows) ? array_values($rows) : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function defaultQuery(int $userId, int $doneWithinDays): array
    {
        if (! class_exists(\Illuminate\Support\Facades\DB::class)) {
            return [];
        }

        $sql = <<<'SQL'
SELECT
    t.id,
    t.headline,
    t.status,
    t.projectId,
    t.type,
    t.modified,
    t.editorId,
    p.name AS projectName,
    TRIM(CONCAT(IFNULL(u.firstname, ''), ' ', IFNULL(u.lastname, ''))) AS editorName,
    COALESCE(c.closed_at, t.modified) AS closedAt
FROM zp_tickets t
LEFT JOIN zp_projects p ON p.id = t.projectId
LEFT JOIN zp_user u ON CAST(u.id AS CHAR) = CAST(t.editorId AS CHAR)
LEFT JOIN (
    SELECT ticketId, MAX(dateModified) AS closed_at
    FROM zp_tickethistory
    WHERE changeType = 'status' AND changeValue = '0'
    GROUP BY ticketId
) c ON c.ticketId = t.id
WHERE t.userId = ?
  AND LOWER(IFNULL(t.type, '')) NOT IN ('milestone', 'subtask')
  AND (
        t.status <> 0
        OR (
            t.status = 0
            AND COALESCE(c.closed_at, t.modified) >= (NOW() - INTERVAL ? DAY)
        )
  )
ORDER BY (t.status = 0) ASC, COALESCE(c.closed_at, t.modified) DESC
LIMIT 100
SQL;

        $rows = \Illuminate\Support\Facades\DB::select($sql, [$userId, $doneWithinDays]);
        $out = [];
        foreach ($rows as $row) {
            $arr = (array) $row;
            $out[] = [
                'id' => (int) ($arr['id'] ?? 0),
                'headline' => (string) ($arr['headline'] ?? ''),
                'status' => (int) ($arr['status'] ?? 0),
                'projectId' => (int) ($arr['projectId'] ?? 0),
                'projectName' => (string) ($arr['projectName'] ?? ''),
                'editorId' => (int) ($arr['editorId'] ?? 0),
                'editorName' => trim((string) ($arr['editorName'] ?? '')),
                'type' => (string) ($arr['type'] ?? ''),
                'modified' => (string) ($arr['modified'] ?? ''),
                'closedAt' => (string) ($arr['closedAt'] ?? ''),
            ];
        }

        return $out;
    }
}
