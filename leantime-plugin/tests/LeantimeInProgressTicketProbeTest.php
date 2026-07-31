<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\LeantimeInProgressTicketProbe;
use PHPUnit\Framework\TestCase;

final class LeantimeInProgressTicketProbeTest extends TestCase
{
    public function testHasInProgressTrueWhenQueryReturnsRow(): void
    {
        $probe = new LeantimeInProgressTicketProbe(static fn (): array => [(object) ['ok' => 1]]);
        $this->assertTrue($probe->hasInProgress());
    }

    public function testHasInProgressFalseWhenQueryEmpty(): void
    {
        $probe = new LeantimeInProgressTicketProbe(static fn (): array => []);
        $this->assertFalse($probe->hasInProgress());
    }

    public function testHasInProgressFailClosedOnQueryError(): void
    {
        $probe = new LeantimeInProgressTicketProbe(static function (): array {
            throw new \RuntimeException('db down');
        });
        $this->assertFalse($probe->hasInProgress());
    }
}
