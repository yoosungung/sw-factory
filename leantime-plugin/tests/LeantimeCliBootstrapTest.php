<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\LeantimeCliBootstrap;
use PHPUnit\Framework\TestCase;

final class LeantimeCliBootstrapTest extends TestCase
{
    public function testBootReturnsFalseWhenBootstrapMissing(): void
    {
        $root = sys_get_temp_dir() . '/cursorbridge-cli-missing-' . uniqid('', true);
        mkdir($root, 0777, true);
        try {
            $this->assertFalse(LeantimeCliBootstrap::boot($root));
        } finally {
            rmdir($root);
        }
    }

    public function testBootBootstrapsConsoleKernel(): void
    {
        $root = sys_get_temp_dir() . '/cursorbridge-cli-boot-' . uniqid('', true);
        mkdir($root . '/bootstrap', 0777, true);

        $booted = false;
        $kernel = new class ($booted) {
            public function __construct(private bool &$booted)
            {
            }

            public function bootstrap(): void
            {
                $this->booted = true;
            }
        };
        $app = new class ($kernel) {
            public function __construct(private object $kernel)
            {
            }

            public function make(string $abstract): object
            {
                if ($abstract === LeantimeCliBootstrap::CONSOLE_KERNEL) {
                    return $this->kernel;
                }

                throw new \RuntimeException('unexpected: ' . $abstract);
            }
        };

        file_put_contents(
            $root . '/bootstrap/app.php',
            '<?php return $GLOBALS["__cursorbridge_test_app"];'
        );
        $GLOBALS['__cursorbridge_test_app'] = $app;

        try {
            $this->assertTrue(LeantimeCliBootstrap::boot($root));
            $this->assertTrue($booted);
            $this->assertTrue(defined('LEAN_CLI'));
            $this->assertTrue(defined('ARTISAN_BINARY'));
        } finally {
            unset($GLOBALS['__cursorbridge_test_app']);
            unlink($root . '/bootstrap/app.php');
            rmdir($root . '/bootstrap');
            rmdir($root);
        }
    }
}
