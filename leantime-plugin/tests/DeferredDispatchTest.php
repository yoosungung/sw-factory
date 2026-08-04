<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\DeferredDispatch;
use PHPUnit\Framework\TestCase;

final class DeferredDispatchTest extends TestCase
{
    protected function tearDown(): void
    {
        DeferredDispatch::resetForTests();
        parent::tearDown();
    }

    protected function setUp(): void
    {
        parent::setUp();
        DeferredDispatch::resetForTests();
        DeferredDispatch::setFinisherForTests(static function (): void {
        });
    }

    public function testScheduleDoesNotRunInline(): void
    {
        $ran = false;
        DeferredDispatch::schedule(static function () use (&$ran): void {
            $ran = true;
        });

        $this->assertFalse($ran);
        $this->assertSame(1, DeferredDispatch::pendingCount());
    }

    public function testFlushRunsPendingJobs(): void
    {
        $order = [];
        DeferredDispatch::schedule(static function () use (&$order): void {
            $order[] = 'a';
        });
        DeferredDispatch::schedule(static function () use (&$order): void {
            $order[] = 'b';
        });

        DeferredDispatch::flush();

        $this->assertSame(['a', 'b'], $order);
        $this->assertSame(0, DeferredDispatch::pendingCount());
    }

    public function testFlushSwallowsJobExceptions(): void
    {
        DeferredDispatch::schedule(static function (): void {
            throw new \RuntimeException('boom');
        });
        $ran = false;
        DeferredDispatch::schedule(static function () use (&$ran): void {
            $ran = true;
        });

        DeferredDispatch::flush();

        $this->assertTrue($ran);
    }
}
