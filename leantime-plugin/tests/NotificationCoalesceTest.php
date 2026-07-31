<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\NotificationCoalesce;
use PHPUnit\Framework\TestCase;

final class NotificationCoalesceTest extends TestCase
{
    public function testTicketIdFromUrl(): void
    {
        $this->assertSame(
            42,
            NotificationCoalesce::ticketIdFromUrl('https://lt.example/#/tickets/showTicket/42?projectId=1')
        );
        $this->assertSame(
            167,
            NotificationCoalesce::ticketIdFromUrl('/tickets/showTicket/167')
        );
        $this->assertSame(0, NotificationCoalesce::ticketIdFromUrl('https://example.com/other'));
    }

    public function testTicketIdDoesNotPrefixMatch(): void
    {
        $this->assertSame(
            421,
            NotificationCoalesce::ticketIdFromUrl('#/tickets/showTicket/421')
        );
        $this->assertFalse(
            NotificationCoalesce::urlMatchesTicket('https://lt/#/tickets/showTicket/421', 42)
        );
        $this->assertTrue(
            NotificationCoalesce::urlMatchesTicket('https://lt/#/tickets/showTicket/42?x=1', 42)
        );
    }

    public function testPartitionInsertVersusBump(): void
    {
        $existing = [
            ['id' => 9, 'userId' => 1, 'url' => 'https://lt/#/tickets/showTicket/42'],
        ];
        $incoming = [
            [
                'userId' => 1,
                'type' => 'projectUpdate',
                'module' => 'comments',
                'moduleId' => 100,
                'message' => 'new comment',
                'datetime' => '2026-07-31 12:00:00',
                'url' => 'https://lt/#/tickets/showTicket/42',
                'authorId' => 4,
            ],
            [
                'userId' => 2,
                'type' => 'mention',
                'module' => 'comments',
                'moduleId' => 101,
                'message' => 'mentioned',
                'datetime' => '2026-07-31 12:00:01',
                'url' => 'https://lt/#/tickets/showTicket/99',
                'authorId' => 4,
            ],
        ];

        $result = NotificationCoalesce::partition($incoming, $existing);

        $this->assertCount(1, $result['bump']);
        $this->assertSame(9, $result['bump'][0]['id']);
        $this->assertSame('new comment', $result['bump'][0]['row']['message']);
        $this->assertSame(0, $result['bump'][0]['row']['read']);

        $this->assertCount(1, $result['insert']);
        $this->assertSame(2, $result['insert'][0]['userId']);
        $this->assertSame(0, $result['insert'][0]['read']);
    }

    public function testNoTicketUrlAlwaysInserts(): void
    {
        $incoming = [[
            'userId' => 1,
            'type' => 'projectUpdate',
            'module' => 'projects',
            'moduleId' => 1,
            'message' => 'proj',
            'datetime' => '2026-07-31 12:00:00',
            'url' => 'https://lt/#/projects/showProject/1',
            'authorId' => 1,
        ]];

        $result = NotificationCoalesce::partition($incoming, []);
        $this->assertCount(0, $result['bump']);
        $this->assertCount(1, $result['insert']);
    }

    public function testDedupeExistingKeepsNewestAndUnreadIfAny(): void
    {
        $rows = [
            [
                'id' => 1,
                'userId' => 1,
                'read' => 1,
                'datetime' => '2026-07-01 10:00:00',
                'url' => 'https://lt/#/tickets/showTicket/42',
            ],
            [
                'id' => 2,
                'userId' => 1,
                'read' => 0,
                'datetime' => '2026-07-02 10:00:00',
                'url' => 'https://lt/dashboard/home#/tickets/showTicket/42?projectId=1',
            ],
            [
                'id' => 3,
                'userId' => 1,
                'read' => 1,
                'datetime' => '2026-07-03 10:00:00',
                'url' => 'https://lt/#/tickets/showTicket/42',
            ],
            [
                'id' => 4,
                'userId' => 1,
                'read' => 1,
                'datetime' => '2026-07-03 11:00:00',
                'url' => 'https://lt/#/projects/showProject/1',
            ],
        ];

        $plan = NotificationCoalesce::dedupeExisting($rows);

        $this->assertSame([3], $plan['keep']);
        $this->assertEqualsCanonicalizing([1, 2], $plan['delete']);
        $this->assertSame([3], $plan['markUnread']);
    }

    public function testDedupeExistingIdempotentWhenSurvivorUnread(): void
    {
        $rows = [[
            'id' => 3,
            'userId' => 1,
            'read' => 0,
            'datetime' => '2026-07-03 10:00:00',
            'url' => 'https://lt/#/tickets/showTicket/42',
        ]];
        $plan = NotificationCoalesce::dedupeExisting($rows);
        $this->assertSame([3], $plan['keep']);
        $this->assertSame([], $plan['delete']);
        $this->assertSame([], $plan['markUnread']);
    }
}

