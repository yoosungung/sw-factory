<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\BridgeConfig;
use Leantime\Plugins\CursorBridge\Listener;
use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\Router;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\RunnerSessionNotFoundException;
use Leantime\Plugins\CursorBridge\SessionStore;
use Leantime\Plugins\CursorBridge\TicketLookup;
use PHPUnit\Framework\TestCase;

final class LeantimeEventTest extends TestCase
{
    /** @var list<array{op: string, url: string, body?: array<string, mixed>}> */
    private array $calls = [];

    private function listenerWithSession(?string $agentId = null): Listener
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        if ($agentId !== null) {
            $sessions->upsert(167, $agentId, 6);
        }

        $lookup = new class implements TicketLookup {
            public function find(int $ticketId): ?array
            {
                return $ticketId === 167 ? LeantimeEventFixtures::ticketLookup167() : null;
            }
        };

        $inner = new RunnerClient(
            function (string $url, array $body): array {
                $op = str_ends_with($url, '/sessions') ? 'create' : 'prompt';
                $this->calls[] = ['op' => $op, 'url' => $url, 'body' => $body];
                if ($op === 'create') {
                    return ['agent_id' => 'agent-live-167'];
                }

                return ['run_id' => 'run-1', 'status' => 'running'];
            },
            static function (string $url): void {
            }
        );

        return new Listener(
            new Router(
                $config,
                $sessions,
                new ResilientRunnerClient($inner, $sessions),
                $lookup
            )
        );
    }

    public function testTicketUpdatedOnlyTicketIdPromptsExistingSession(): void
    {
        $listener = $this->listenerWithSession('agent-stale-167');
        $results = $listener->onTicketUpdated(LeantimeEventFixtures::ticketUpdated167());

        $this->assertCount(1, $results);
        $this->assertSame('agent-stale-167', $results[0]['agent_id']);
        $this->assertSame('running', $results[0]['status']);
        $this->assertCount(1, $this->calls);
        $this->assertSame('prompt', $this->calls[0]['op']);
        $this->assertStringContainsString('agent-stale-167', $this->calls[0]['url']);
        $this->assertSame('ticket_updated', $this->calls[0]['body']['event'] ?? null);
    }

    public function testTicketUpdatedOnlyTicketIdCreatesWhenNoSession(): void
    {
        $listener = $this->listenerWithSession();
        $results = $listener->onTicketUpdated(LeantimeEventFixtures::ticketUpdated167());

        $this->assertCount(1, $results);
        $this->assertSame('created', $results[0]['status']);
        $this->assertSame('create', $this->calls[0]['op']);
    }

    public function testCommentNotifyDispatchesCommentAddedForTicket167(): void
    {
        $listener = $this->listenerWithSession('agent-live-167');
        $results = $listener->onNotifyProjectUsers(LeantimeEventFixtures::commentNotifyOnTicket167());

        $this->assertCount(1, $results);
        $this->assertSame('prompt', $this->calls[0]['op']);
        $this->assertSame('comment_added', $this->calls[0]['body']['event'] ?? null);
        $this->assertSame(167, $this->calls[0]['body']['ticket_id'] ?? null);
    }

    public function testActiveRunReturnsSkippedWithoutRecreatingSession(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        $sessions->upsert(167, 'agent-busy-167', 6);
        $lookup = new class implements TicketLookup {
            public function find(int $ticketId): ?array
            {
                return LeantimeEventFixtures::ticketLookup167();
            }
        };
        $createCount = 0;
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$createCount): array {
                if (str_ends_with($url, '/sessions')) {
                    ++$createCount;

                    return ['agent_id' => 'agent-new'];
                }

                return ['run_id' => '', 'status' => 'skipped_active_run'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions), $lookup);
        $results = $router->handle('ticket_updated', LeantimeEventFixtures::ticketUpdated167());

        $this->assertCount(1, $results);
        $this->assertSame('skipped_active_run', $results[0]['status']);
        $this->assertSame('agent-busy-167', $sessions->getAgentId(167));
        $this->assertSame(0, $createCount);
    }

    public function testSessionNotFoundRecreatesOnce(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        $sessions->upsert(167, 'agent-gone-167', 6);
        $lookup = new class implements TicketLookup {
            public function find(int $ticketId): ?array
            {
                return LeantimeEventFixtures::ticketLookup167();
            }
        };
        $inner = new RunnerClient(
            function (string $url, array $body): array {
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-recreated-167'];
                }

                throw new RunnerSessionNotFoundException('session not found');
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions), $lookup);
        $results = $router->handle('ticket_updated', LeantimeEventFixtures::ticketUpdated167());

        $this->assertCount(1, $results);
        $this->assertSame('recreated', $results[0]['status']);
        $this->assertSame('agent-recreated-167', $sessions->getAgentId(167));
    }
}
