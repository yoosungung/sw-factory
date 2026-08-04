<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\LeantimeInProgressTicketProbe;
use PHPUnit\Framework\TestCase;

final class LeantimeInProgressTicketProbeTest extends TestCase
{
    public function testHasInProgressTrueWhenQueryReturnsRow(): void
    {
        $probe = new LeantimeInProgressTicketProbe(
            static fn (array $_statuses): array => [(object) ['ok' => 1]]
        );
        $this->assertTrue($probe->hasInProgress());
    }

    public function testHasInProgressFalseWhenQueryEmpty(): void
    {
        $probe = new LeantimeInProgressTicketProbe(static fn (array $_statuses): array => []);
        $this->assertFalse($probe->hasInProgress());
    }

    public function testHasInProgressFailClosedOnQueryError(): void
    {
        $probe = new LeantimeInProgressTicketProbe(static function (array $_statuses): array {
            throw new \RuntimeException('db down');
        });
        $this->assertFalse($probe->hasInProgress());
    }

    public function testHasInProgressQueriesStatusFour(): void
    {
        $seen = null;
        $probe = new LeantimeInProgressTicketProbe(static function (array $statuses) use (&$seen): array {
            $seen = $statuses;

            return [];
        });
        $probe->hasInProgress();
        $this->assertSame([4], $seen);
    }

    public function testHasFlowActiveQueriesFactoryFlowStatuses(): void
    {
        $seen = null;
        $probe = new LeantimeInProgressTicketProbe(static function (array $statuses) use (&$seen): array {
            $seen = $statuses;

            return [(object) ['ok' => 1]];
        });
        $this->assertTrue($probe->hasFlowActive());
        $this->assertSame(LeantimeInProgressTicketProbe::FLOW_ACTIVE_STATUSES, $seen);
        $this->assertSame([4, 10, 11, 12, 13], $seen);
    }

    public function testHasFlowActiveFailClosedOnQueryError(): void
    {
        $probe = new LeantimeInProgressTicketProbe(static function (array $_statuses): array {
            throw new \RuntimeException('db down');
        });
        $this->assertFalse($probe->hasFlowActive());
    }
}
