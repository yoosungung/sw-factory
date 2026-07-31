<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Boots Leantime like bin/leantime so CLI scripts can use app()/DB.
 */
final class LeantimeCliBootstrap
{
    public const CONSOLE_KERNEL = 'Illuminate\Contracts\Console\Kernel';

    /**
     * @return bool true when ConsoleKernel::bootstrap() ran
     */
    public static function boot(string $appRoot): bool
    {
        $bootstrap = rtrim($appRoot, DIRECTORY_SEPARATOR) . '/bootstrap/app.php';
        if (! is_file($bootstrap)) {
            return false;
        }

        if (! defined('LEAN_CLI')) {
            define('LEAN_CLI', true);
        }
        if (! defined('ARTISAN_BINARY')) {
            define('ARTISAN_BINARY', 'bin/leantime');
        }

        $app = require $bootstrap;
        if (! is_object($app) || ! method_exists($app, 'make')) {
            return false;
        }

        $kernel = $app->make(self::CONSOLE_KERNEL);
        if (! is_object($kernel) || ! method_exists($kernel, 'bootstrap')) {
            return false;
        }

        $kernel->bootstrap();

        return true;
    }
}
