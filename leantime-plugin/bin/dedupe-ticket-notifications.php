#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * One-shot: coalesce historical zp_notifications to one row per (user, ticket).
 *
 * Usage:
 *   php bin/dedupe-ticket-notifications.php           # apply
 *   php bin/dedupe-ticket-notifications.php --dry-run
 */

$helper = dirname(__DIR__) . '/NotificationCoalesce.php';
if (! is_file($helper)) {
    fwrite(STDERR, "NotificationCoalesce.php not found at {$helper}\n");
    exit(1);
}
require_once $helper;

use Leantime\Plugins\CursorBridge\NotificationCoalesce;

$dryRun = in_array('--dry-run', $argv, true);

$host = getenv('LEAN_DB_HOST') ?: '127.0.0.1';
$user = getenv('LEAN_DB_USER') ?: '';
$pass = getenv('LEAN_DB_PASSWORD') ?: '';
$dbName = getenv('LEAN_DB_DATABASE') ?: '';

if ($user === '' || $dbName === '') {
    fwrite(STDERR, "LEAN_DB_USER / LEAN_DB_DATABASE required\n");
    exit(1);
}

$mysqli = @new mysqli($host, $user, $pass, $dbName);
if ($mysqli->connect_errno) {
    fwrite(STDERR, 'DB connect failed: ' . $mysqli->connect_error . PHP_EOL);
    exit(1);
}
$mysqli->set_charset('utf8mb4');

$result = $mysqli->query(
    "SELECT id, userId, `read`, datetime, url
     FROM zp_notifications
     WHERE type != 'ainotification'
       AND url LIKE '%tickets/showTicket/%'
     ORDER BY datetime DESC, id DESC"
);
if ($result === false) {
    fwrite(STDERR, 'query failed: ' . $mysqli->error . PHP_EOL);
    exit(1);
}

$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}
$result->free();

$plan = NotificationCoalesce::dedupeExisting($rows);
$deleteCount = count($plan['delete']);
$unreadCount = count($plan['markUnread']);

echo 'groups_keep=' . count($plan['keep'])
    . ' delete=' . $deleteCount
    . ' mark_unread=' . $unreadCount
    . ($dryRun ? ' dry_run=1' : '')
    . PHP_EOL;

if ($dryRun || ($deleteCount === 0 && $unreadCount === 0)) {
    exit(0);
}

$mysqli->begin_transaction();
try {
    if ($unreadCount > 0) {
        $ids = implode(',', array_map('intval', $plan['markUnread']));
        if ($mysqli->query("UPDATE zp_notifications SET `read` = 0 WHERE id IN ({$ids})") === false) {
            throw new RuntimeException($mysqli->error);
        }
    }
    if ($deleteCount > 0) {
        // Chunk deletes for large IN lists.
        foreach (array_chunk($plan['delete'], 500) as $chunk) {
            $ids = implode(',', array_map('intval', $chunk));
            if ($mysqli->query("DELETE FROM zp_notifications WHERE id IN ({$ids})") === false) {
                throw new RuntimeException($mysqli->error);
            }
        }
    }
    $mysqli->commit();
} catch (Throwable $e) {
    $mysqli->rollback();
    fwrite(STDERR, 'dedupe failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

echo "done\n";
