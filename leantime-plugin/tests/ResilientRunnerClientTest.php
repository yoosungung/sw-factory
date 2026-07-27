<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class ResilientRunnerClientTest extends TestCase
{
    public function testPromptFailureEnqueuesRetryWithoutThrowing(): void
    {
        $sessions = SessionStore::inMemory();
        $inner = new RunnerClient(
            static function (string $url, array $body): array {
                throw new \RuntimeException('Runner returned invalid JSON');
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        $result = $client->prompt('http://runner:8080', 'agent-1', 'hi', 'ticket_updated', 167);

        $this->assertSame(['run_id' => '', 'status' => 'deferred'], $result);
        $this->assertCount(1, $sessions->pendingRetries());
    }

    public function testPromptGenericFailureReturnsDeferred(): void
    {
        $sessions = SessionStore::inMemory();
        $inner = new RunnerClient(
            static function (string $url, array $body): array {
                throw new \RuntimeException('Runner HTTP 500');
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        $result = $client->prompt('http://runner:8080', 'agent-1', 'hi', 'ticket_updated', 167);

        $this->assertSame(['run_id' => '', 'status' => 'deferred'], $result);
        $this->assertCount(1, $sessions->pendingRetries());
    }

    public function testCreateFailureEnqueuesRetryWithoutThrowing(): void
    {
        $sessions = SessionStore::inMemory();
        $inner = new RunnerClient(
            static function (string $url, array $body): array {
                throw new \RuntimeException('Runner HTTP failed');
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        $result = $client->createSession('http://runner:8080', 'hello', 167);

        $this->assertNull($result);
        $this->assertCount(1, $sessions->pendingRetries());
    }
}
