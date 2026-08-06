<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\HttpRunnerReadyProbe;
use PHPUnit\Framework\TestCase;

final class HttpRunnerReadyProbeTest extends TestCase
{
    public function testPrefersReadyzThenHealthz(): void
    {
        $hits = [];
        $probe = new HttpRunnerReadyProbe(function (string $url) use (&$hits): int {
            $hits[] = $url;
            if (str_ends_with($url, '/readyz')) {
                return 503;
            }

            return 200;
        });

        $this->assertTrue($probe->isReady('http://runner:8080'));
        $this->assertSame(
            ['http://runner:8080/readyz', 'http://runner:8080/healthz'],
            $hits
        );
    }

    public function testBothFailMeansNotReady(): void
    {
        $probe = new HttpRunnerReadyProbe(static fn (string $url): int => 0);
        $this->assertFalse($probe->isReady('http://runner:8080/'));
    }
}
