<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\CreatedByMeTickets;
use PHPUnit\Framework\TestCase;

final class CreatedByMeTicketsTest extends TestCase
{
    public function testRejectsNonPositiveUserId(): void
    {
        $called = false;
        $svc = new CreatedByMeTickets(static function () use (&$called): array {
            $called = true;

            return [['id' => 1]];
        });

        $this->assertSame([], $svc->listFor(0));
        $this->assertSame([], $svc->listFor(-1));
        $this->assertFalse($called);
    }

    public function testPassesUserIdAndDoneWindowDaysToQuery(): void
    {
        $seen = null;
        $svc = new CreatedByMeTickets(static function (int $userId, int $doneWithinDays) use (&$seen): array {
            $seen = [$userId, $doneWithinDays];

            return [
                [
                    'id' => 99,
                    'headline' => 'quality.yaml',
                    'status' => 0,
                    'projectId' => 1,
                    'projectName' => 'demo-acme',
                    'editorId' => 2,
                    'editorName' => 'pm',
                    'type' => 'task',
                    'modified' => '2026-08-04 04:59:35',
                    'closedAt' => '2026-08-04 04:59:35',
                ],
            ];
        }, 5);

        $rows = $svc->listFor(1);

        $this->assertSame([1, 5], $seen);
        $this->assertCount(1, $rows);
        $this->assertSame(99, $rows[0]['id']);
        $this->assertSame(0, $rows[0]['status']);
    }

    public function testQueryFailureReturnsEmpty(): void
    {
        $svc = new CreatedByMeTickets(static function (): array {
            throw new \RuntimeException('db down');
        });

        $this->assertSame([], $svc->listFor(1));
    }

    public function testStatusGroupRankOrdersOpenThenDoneThenArchived(): void
    {
        // Open dual-loop (e.g. In Progress=4) above Done(0) above Archived(-1).
        $this->assertSame(0, CreatedByMeTickets::statusGroupRank(4));
        $this->assertSame(0, CreatedByMeTickets::statusGroupRank(3));
        $this->assertSame(1, CreatedByMeTickets::statusGroupRank(0));
        $this->assertSame(2, CreatedByMeTickets::statusGroupRank(-1));
        $this->assertLessThan(
            CreatedByMeTickets::statusGroupRank(0),
            CreatedByMeTickets::statusGroupRank(4),
        );
        $this->assertLessThan(
            CreatedByMeTickets::statusGroupRank(-1),
            CreatedByMeTickets::statusGroupRank(0),
        );
    }

    public function testDefaultQueryOrderSqlMatchesStatusGroupRank(): void
    {
        $sql = CreatedByMeTickets::STATUS_GROUP_ORDER_SQL;
        $this->assertStringContainsString('t.status = 0', $sql);
        $this->assertStringContainsString('t.status = -1', $sql);
        // Bug regression: bare (t.status = 0) ASC puts Archived above Done.
        $this->assertStringNotContainsString('(t.status = 0) ASC', $sql);
    }
}
