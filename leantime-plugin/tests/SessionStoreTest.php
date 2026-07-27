<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class SessionStoreTest extends TestCase
{
    public function testUpsertAndDelete(): void
    {
        $store = SessionStore::inMemory();
        $this->assertNull($store->getAgentId(42));
        $store->upsert(42, 'agent-abc', 1);
        $this->assertSame('agent-abc', $store->getAgentId(42));
        $store->delete(42);
        $this->assertNull($store->getAgentId(42));
    }

    public function testListByAssigneeAndScheduleFireClaim(): void
    {
        $store = SessionStore::inMemory();
        $store->upsert(10, 'a-path', 6);
        $store->upsert(11, 'a-finder', 9);
        $store->upsert(12, 'a-path-2', 6);
        $this->assertSame(
            [
                ['ticket_id' => 10, 'agent_id' => 'a-path'],
                ['ticket_id' => 12, 'agent_id' => 'a-path-2'],
            ],
            $store->listByAssignee(6)
        );
        $this->assertTrue($store->claimScheduleFire('weekday-check', '2026-07-13T09:00'));
        $this->assertFalse($store->claimScheduleFire('weekday-check', '2026-07-13T09:00'));
    }

    public function testRetryQueue(): void
    {
        $store = SessionStore::inMemory();
        $store->enqueueRetry(1, 'http://runner', 'prompt', ['ticket_id' => 1]);
        $pending = $store->pendingRetries();
        $this->assertCount(1, $pending);
        $store->deleteRetry($pending[0]['ticket_id'], $pending[0]['runner_url']);
        $this->assertSame([], $store->pendingRetries());
    }
}
