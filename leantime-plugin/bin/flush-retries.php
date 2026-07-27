#!/usr/bin/env php
<?php

declare(strict_types=1);

$candidates = [
    dirname(__DIR__, 4) . '/vendor/autoload.php',
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

use Leantime\Plugins\CursorBridge\Plugin;

echo 'flushed=' . Plugin::createDefault()->flushRetries() . PHP_EOL;
