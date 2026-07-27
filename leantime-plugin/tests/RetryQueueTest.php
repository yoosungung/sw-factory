<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class RetryQueueTest extends TestCase
{
    public function testUpsertReplacesEarlierFailureForSameTicketAndRunner(): void
    {
        $store = SessionStore::inMemory();
        $store->enqueueRetry(42, 'http://runner-a', 'prompt', [
            'ticket_id' => 42,
            'prompt' => 'old',
            'event' => 'ticket_updated',
        ]);
        $store->enqueueRetry(42, 'http://runner-a', 'prompt', [
            'ticket_id' => 42,
            'prompt' => 'latest',
            'event' => 'comment_added',
        ]);

        $pending = $store->pendingRetries();
        $this->assertCount(1, $pending);
        $this->assertSame('latest', $pending[0]['body']['prompt']);
        $this->assertSame('comment_added', $pending[0]['body']['event']);
    }

    public function testDifferentRunnersForSameTicketAreSeparate(): void
    {
        $store = SessionStore::inMemory();
        $store->enqueueRetry(7, 'http://runner-assignee', 'prompt', ['ticket_id' => 7, 'prompt' => 'a']);
        $store->enqueueRetry(7, 'http://runner-mention', 'prompt', ['ticket_id' => 7, 'prompt' => 'b']);

        $this->assertCount(2, $store->pendingRetries());
    }

    public function testClearRetriesRemovesPendingForTicketRunner(): void
    {
        $store = SessionStore::inMemory();
        $store->enqueueRetry(99, 'http://runner', 'prompt', ['ticket_id' => 99]);
        $store->clearRetries(99, 'http://runner');

        $this->assertSame([], $store->pendingRetries());
    }

    public function testSuccessfulPromptClearsPendingRetryForTicket(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = 0;
        $inner = new RunnerClient(
            static function (string $url, array $body) use (&$calls): array {
                ++$calls;

                return ['run_id' => 'run-1', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        $sessions->enqueueRetry(167, 'http://runner:8080', 'prompt', [
            'ticket_id' => 167,
            'agent_id' => 'agent-1',
            'prompt' => 'stale',
            'event' => 'ticket_updated',
        ]);

        $result = $client->prompt('http://runner:8080', 'agent-1', 'fresh', 'comment_added', 167);

        $this->assertSame('completed', $result['status']);
        $this->assertSame([], $sessions->pendingRetries());
    }

    public function testFlushResendsPreservedSuccessChecksAndRetry(): void
    {
        $sessions = SessionStore::inMemory();
        $bodies = [];
        $attempt = 0;
        $inner = new RunnerClient(
            static function (string $url, array $body) use (&$bodies, &$attempt): array {
                ++$attempt;
                if ($attempt === 1) {
                    throw new \RuntimeException('Runner HTTP 503');
                }
                $bodies[] = $body;

                return ['run_id' => 'run-1', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        $client->prompt(
            'http://runner:8080',
            'agent-1',
            'do work',
            'ticket_updated',
            77,
            ['timeout_ms' => 600000],
            ['Leave add_comment'],
            2
        );
        $this->assertCount(1, $sessions->pendingRetries());

        $flushed = $client->flushRetries();
        $this->assertSame(1, $flushed);
        $this->assertSame(['Leave add_comment'], $bodies[0]['success_checks'] ?? null);
        $this->assertSame(['max_attempts' => 2], $bodies[0]['success_retry'] ?? null);
        $this->assertSame(['timeout_ms' => 600000], $bodies[0]['budget'] ?? null);
    }

    public function testFlushSkipsTicketAfterLaterSuccess(): void
    {
        $sessions = SessionStore::inMemory();
        $prompts = [];
        $attempt = 0;
        $inner = new RunnerClient(
            static function (string $url, array $body) use (&$prompts, &$attempt): array {
                ++$attempt;
                if ($attempt === 1) {
                    throw new \RuntimeException('Runner HTTP 503');
                }
                $prompts[] = $body['prompt'] ?? '';

                return ['run_id' => 'run-1', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        $client->prompt('http://runner:8080', 'agent-1', 'first', 'ticket_updated', 55);
        $this->assertCount(1, $sessions->pendingRetries());
        $this->assertSame('first', $sessions->pendingRetries()[0]['body']['prompt']);

        $client->prompt('http://runner:8080', 'agent-1', 'second', 'comment_added', 55);
        $this->assertSame([], $sessions->pendingRetries());

        $flushed = $client->flushRetries();
        $this->assertSame(0, $flushed);
        $this->assertSame(['second'], $prompts);
    }
}
