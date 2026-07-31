<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Deploy monkey-patch helper: one in-app notification row per (user, ticket).
 * On later activity, bump that row back to unread instead of inserting.
 */
final class NotificationCoalesce
{
    public static function ticketIdFromUrl(string $url): int
    {
        if (preg_match('~(?:#/)?tickets/showTicket/(\d+)~', $url, $m)) {
            return (int) $m[1];
        }

        return 0;
    }

    public static function urlMatchesTicket(string $url, int $ticketId): bool
    {
        return $ticketId > 0 && self::ticketIdFromUrl($url) === $ticketId;
    }

    /**
     * @param  list<array<string, mixed>>  $incoming
     * @param  list<array<string, mixed>>  $existingRows  candidate rows (same user(s)), newest-first preferred
     * @return array{bump: list<array{id:int,row:array<string,mixed>}>, insert: list<array<string,mixed>>}
     */
    public static function partition(array $incoming, array $existingRows): array
    {
        $byUserTicket = [];
        foreach ($existingRows as $row) {
            $uid = (int) ($row['userId'] ?? 0);
            $tid = self::ticketIdFromUrl((string) ($row['url'] ?? ''));
            if ($uid <= 0 || $tid <= 0) {
                continue;
            }
            $key = $uid . ':' . $tid;
            if (! isset($byUserTicket[$key])) {
                $byUserTicket[$key] = (int) $row['id'];
            }
        }

        $bump = [];
        $insert = [];
        $claimed = [];

        foreach ($incoming as $notif) {
            $row = [
                'userId' => $notif['userId'],
                'read' => 0,
                'type' => $notif['type'],
                'module' => $notif['module'],
                'moduleId' => $notif['moduleId'],
                'message' => $notif['message'],
                'datetime' => $notif['datetime'],
                'url' => $notif['url'],
                'authorId' => $notif['authorId'],
            ];

            $uid = (int) $row['userId'];
            $tid = self::ticketIdFromUrl((string) $row['url']);
            if ($tid <= 0) {
                $insert[] = $row;

                continue;
            }

            $key = $uid . ':' . $tid;
            if (isset($claimed[$key])) {
                // Same batch already bumps/inserts this ticket for the user.
                continue;
            }

            if (isset($byUserTicket[$key])) {
                $bump[] = ['id' => $byUserTicket[$key], 'row' => $row];
                $claimed[$key] = true;

                continue;
            }

            $insert[] = $row;
            $claimed[$key] = true;
        }

        return ['bump' => $bump, 'insert' => $insert];
    }

    /**
     * One-shot DB cleanup plan for historical rows.
     * Keeps the newest row per (userId, ticketId); if any duplicate was unread,
     * the survivor is listed in markUnread. Non-ticket URLs are ignored.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return array{keep: list<int>, delete: list<int>, markUnread: list<int>}
     */
    public static function dedupeExisting(array $rows): array
    {
        $groups = [];
        foreach ($rows as $row) {
            $uid = (int) ($row['userId'] ?? 0);
            $tid = self::ticketIdFromUrl((string) ($row['url'] ?? ''));
            $id = (int) ($row['id'] ?? 0);
            if ($uid <= 0 || $tid <= 0 || $id <= 0) {
                continue;
            }
            $groups[$uid . ':' . $tid][] = $row;
        }

        $keep = [];
        $delete = [];
        $markUnread = [];

        foreach ($groups as $members) {
            usort($members, static function (array $a, array $b): int {
                $dt = strcmp((string) ($b['datetime'] ?? ''), (string) ($a['datetime'] ?? ''));
                if ($dt !== 0) {
                    return $dt;
                }

                return (int) ($b['id'] ?? 0) <=> (int) ($a['id'] ?? 0);
            });

            $winner = $members[0];
            $winnerId = (int) $winner['id'];
            $keep[] = $winnerId;

            $anyUnread = false;
            foreach ($members as $m) {
                $mid = (int) $m['id'];
                if ($mid !== $winnerId) {
                    $delete[] = $mid;
                }
                $read = $m['read'] ?? 1;
                if ($read === null || $read === '' || (int) $read === 0) {
                    $anyUnread = true;
                }
            }

            $winnerRead = $winner['read'] ?? 1;
            $winnerIsRead = ! ($winnerRead === null || $winnerRead === '' || (int) $winnerRead === 0);
            if ($anyUnread && $winnerIsRead) {
                $markUnread[] = $winnerId;
            }
        }

        return ['keep' => $keep, 'delete' => $delete, 'markUnread' => $markUnread];
    }
}
