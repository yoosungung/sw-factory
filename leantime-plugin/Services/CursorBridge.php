<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Services;

/**
 * Leantime plugin service entry — required for My Apps install/enable.
 */
final class CursorBridge
{
    public function install(): void
    {
        $dataDir = dirname(__DIR__) . '/data';
        if (! is_dir($dataDir)) {
            mkdir($dataDir, 0755, true);
        }
    }

    public function uninstall(): void
    {
        // Session DB retained; delete manually if needed.
    }
}
