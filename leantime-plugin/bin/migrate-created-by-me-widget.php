#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Replace Calendar with Created-by-me in saved My Work grids (mysqli; no full app boot).
 *
 * Usage:
 *   php bin/migrate-created-by-me-widget.php [--dry-run] [--user=1]
 */

$pluginRoot = dirname(__DIR__);
require_once $pluginRoot . '/WidgetDefaults.php';

use Leantime\Plugins\CursorBridge\WidgetDefaults;

$dryRun = in_array('--dry-run', $argv, true);
$userFilter = null;
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--user=')) {
        $userFilter = (int) substr($arg, 7);
    }
}

$host = getenv('LEAN_DB_HOST') ?: '127.0.0.1';
$user = getenv('LEAN_DB_USER') ?: '';
$pass = getenv('LEAN_DB_PASSWORD') ?: '';
$dbName = getenv('LEAN_DB_DATABASE') ?: '';
$appUrl = rtrim((string) (getenv('LEAN_APP_URL') ?: ''), '/');

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

$res = $mysqli->query(
    "SELECT `key`, `value` FROM zp_settings WHERE `key` LIKE 'usersettings.%.dashboardGrid'"
);
if ($res === false) {
    fwrite(STDERR, 'query failed: ' . $mysqli->error . PHP_EOL);
    exit(1);
}

$updated = 0;
while ($row = $res->fetch_assoc()) {
    $key = (string) $row['key'];
    if ($userFilter !== null) {
        $parts = explode('.', $key);
        $uid = isset($parts[1]) ? (int) $parts[1] : 0;
        if ($uid !== $userFilter) {
            continue;
        }
    }

    $grid = @unserialize((string) $row['value'], ['allowed_classes' => false]);
    if (! is_array($grid)) {
        fwrite(STDERR, "skip corrupt: {$key}\n");
        continue;
    }

    $hasCalendar = false;
    $widgetUrl = ($appUrl !== '' ? $appUrl : '') . '/cursorBridge/createdByMe/get';
    foreach ($grid as $item) {
        if (! is_array($item) || ($item['id'] ?? '') !== 'calendar') {
            continue;
        }
        $hasCalendar = true;
        $existing = (string) ($item['widgetUrl'] ?? '');
        if ($existing !== '' && preg_match('#^(https?://[^/]+)#', $existing, $m)) {
            $widgetUrl = $m[1] . '/cursorBridge/createdByMe/get';
        }
        break;
    }
    if (! $hasCalendar) {
        continue;
    }

    $next = WidgetDefaults::swapCalendarInDashboardGrid(
        $grid,
        $widgetUrl,
        WidgetDefaults::NAME_KEY
    );
    $serialized = serialize($next);

    if ($dryRun) {
        echo "[dry-run] would update {$key}\n";
        $updated++;
        continue;
    }

    $stmt = $mysqli->prepare('UPDATE zp_settings SET `value` = ? WHERE `key` = ?');
    if ($stmt === false) {
        fwrite(STDERR, 'prepare failed: ' . $mysqli->error . PHP_EOL);
        exit(1);
    }
    $stmt->bind_param('ss', $serialized, $key);
    if (! $stmt->execute()) {
        fwrite(STDERR, "update failed {$key}: " . $stmt->error . PHP_EOL);
        exit(1);
    }
    $stmt->close();
    echo "updated {$key}\n";
    $updated++;
}

$mysqli->close();
echo ($dryRun ? 'dry-run ' : '') . "done: {$updated} grid(s)\n";
