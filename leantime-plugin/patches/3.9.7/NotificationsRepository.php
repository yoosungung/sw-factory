<?php

/**
 * Deploy-only monkey patch for Leantime 3.9.7.
 * Source: stock Repositories/Notifications.php + ticket coalesce via CursorBridge.
 *
 * One in-app row per (userId, ticketId from url). Later activity bumps read→0.
 */

namespace Leantime\Domain\Notifications\Repositories;

use Illuminate\Database\ConnectionInterface;
use Leantime\Core\Db\Db as DbCore;
use Leantime\Plugins\CursorBridge\NotificationCoalesce;

class Notifications
{
    private ConnectionInterface $db;

    /**
     * __construct - get database connection
     */
    public function __construct(DbCore $db)
    {
        $this->db = $db->getConnection();
    }

    public function getAllNotifications(int $userId, bool $showNewOnly = false, int $limitStart = 0, int $limitEnd = 100, array $filterOptions = []): false|array
    {
        $query = $this->db->table('zp_notifications')
            ->select(
                'zp_notifications.id',
                'userId',
                'read',
                'type',
                'module',
                'moduleId',
                'datetime',
                'url',
                'message',
                'authorId',
                'zp_user.firstname',
                'zp_user.lastname'
            )
            ->leftJoin('zp_user', 'zp_notifications.authorId', '=', 'zp_user.id')
            ->where('userId', $userId)
            ->where('zp_notifications.type', '!=', 'ainotification');

        if ($showNewOnly === true) {
            $query->where('read', 0);
        }

        if (is_array($filterOptions) && count($filterOptions) > 0) {
            foreach ($filterOptions as $key => $value) {
                $query->where($key, $value);
            }
        }

        $results = $query->orderBy('datetime', 'desc')
            ->offset($limitStart)
            ->limit($limitEnd)
            ->get();

        return array_map(fn ($item) => (array) $item, $results->toArray());
    }

    /**
     * @return bool|void
     */
    public function addNotifications(array $notifications)
    {
        if (count($notifications) === 0) {
            return;
        }

        if (! class_exists(NotificationCoalesce::class)) {
            $helper = '/var/www/html/app/Plugins/CursorBridge/NotificationCoalesce.php';
            if (is_file($helper)) {
                require_once $helper;
            }
        }

        if (! class_exists(NotificationCoalesce::class)) {
            return $this->insertStock($notifications);
        }

        $existing = $this->loadExistingTicketRows($notifications);
        $parts = NotificationCoalesce::partition($notifications, $existing);

        foreach ($parts['bump'] as $item) {
            $row = $item['row'];
            $this->db->table('zp_notifications')
                ->where('id', $item['id'])
                ->where('userId', $row['userId'])
                ->update([
                    'read' => 0,
                    'type' => $row['type'],
                    'module' => $row['module'],
                    'moduleId' => $row['moduleId'],
                    'message' => $row['message'],
                    'datetime' => $row['datetime'],
                    'url' => $row['url'],
                    'authorId' => $row['authorId'],
                ]);
        }

        if (count($parts['insert']) === 0) {
            return true;
        }

        return $this->db->table('zp_notifications')->insert($parts['insert']);
    }

    /**
     * @param  list<array<string, mixed>>  $notifications
     * @return list<array<string, mixed>>
     */
    private function loadExistingTicketRows(array $notifications): array
    {
        $userIds = [];
        $ticketIds = [];
        foreach ($notifications as $notif) {
            $uid = (int) ($notif['userId'] ?? 0);
            $tid = NotificationCoalesce::ticketIdFromUrl((string) ($notif['url'] ?? ''));
            if ($uid > 0) {
                $userIds[$uid] = true;
            }
            if ($tid > 0) {
                $ticketIds[$tid] = true;
            }
        }

        if ($userIds === [] || $ticketIds === []) {
            return [];
        }

        $rows = $this->db->table('zp_notifications')
            ->select('id', 'userId', 'url')
            ->whereIn('userId', array_keys($userIds))
            ->where('type', '!=', 'ainotification')
            ->where(function ($q) use ($ticketIds) {
                foreach (array_keys($ticketIds) as $i => $tid) {
                    $like = '%tickets/showTicket/'.$tid.'%';
                    if ($i === 0) {
                        $q->where('url', 'like', $like);
                    } else {
                        $q->orWhere('url', 'like', $like);
                    }
                }
            })
            ->orderBy('datetime', 'desc')
            ->limit(500)
            ->get();

        $out = [];
        foreach ($rows as $item) {
            $row = (array) $item;
            $tid = NotificationCoalesce::ticketIdFromUrl((string) ($row['url'] ?? ''));
            if ($tid > 0 && isset($ticketIds[$tid])) {
                $out[] = $row;
            }
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $notifications
     * @return bool
     */
    private function insertStock(array $notifications): bool
    {
        $insertData = [];
        foreach ($notifications as $notif) {
            $insertData[] = [
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
        }

        return (bool) $this->db->table('zp_notifications')->insert($insertData);
    }

    public function markNotificationRead(int $id, int $userId): bool
    {
        return $this->db->table('zp_notifications')
            ->where('id', $id)
            ->where('userId', $userId)
            ->update(['read' => 1]) > 0;
    }

    public function markNotificationUnread(int $id, int $userId): bool
    {
        return $this->db->table('zp_notifications')
            ->where('id', $id)
            ->where('userId', $userId)
            ->update(['read' => 0]) > 0;
    }

    public function markAllNotificationRead(int $userId): bool
    {
        return $this->db->table('zp_notifications')
            ->where('userId', $userId)
            ->update(['read' => 1]) >= 0;
    }

    /**
     * Unread notification count for the given user. Excludes the
     * legacy ainotification type to match the inbox query's scope —
     * counts and inbox rows should be the same set. Uses the
     * (userId, read) composite index, so single fast lookup.
     */
    public function getUnreadCount(int $userId): int
    {
        return (int) $this->db->table('zp_notifications')
            ->where('userId', $userId)
            ->where('type', '!=', 'ainotification')
            ->where(function ($q) {
                $q->where('read', 0)->orWhereNull('read');
            })
            ->count();
    }
}
