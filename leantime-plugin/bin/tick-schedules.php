#!/usr/bin/env php
<?php

declare(strict_types=1);

$appRoot = dirname(__DIR__, 4);
$candidates = [
    $appRoot . '/vendor/autoload.php',
    dirname(__DIR__) . '/vendor/autoload.php',
];

$autoload = null;
foreach ($candidates as $path) {
    if (is_file($path)) {
        $autoload = $path;
        break;
    }
}

if ($autoload === null) {
    fwrite(STDERR, "autoload not found; tried: " . implode(', ', $candidates) . "\n");
    exit(1);
}

require_once $autoload;

use Leantime\Plugins\CursorBridge\LeantimeCliBootstrap;
use Leantime\Plugins\CursorBridge\Plugin;

LeantimeCliBootstrap::boot($appRoot);

$plugin = Plugin::createDefault();
echo 'scheduled=' . $plugin->tickSchedules()
    . ' catch_up=' . $plugin->tickReadyCatchup()
    . PHP_EOL;
