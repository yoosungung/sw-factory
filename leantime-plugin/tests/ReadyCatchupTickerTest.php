<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use DateTimeImmutable;
use DateTimeZone;
use Leantime\Plugins\CursorBridge\BridgeConfig;
use Leantime\Plugins\CursorBridge\ReadyCatchupTicker;
use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\RunnerReadyProbe;
use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class ReadyCatchupTickerTest extends TestCase
{
    public function testFalseToTrueCreatesTicketlessCatchUpOnce(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = [];
        $runner = new ResilientRunnerClient(
            new RunnerClient(
                function (string $url, array $body) use (&$calls): array {
                    $calls[] = ['url' => $url, 'body' => $body];

                    return ['agent_id' => 'agent-' . count($calls)];
                },
                static function (string $url): void {
                }
            ),
            $sessions
        );
        $readyState = new \stdClass();
        $readyState->map = [
            'http://cursor-agent-path.sw-factory.svc:8080' => false,
        ];
        $probe = new class ($readyState) implements RunnerReadyProbe {
            public function __construct(private \stdClass $state)
            {
            }

            public function isReady(string $runnerUrl): bool
            {
                return (bool) ($this->state->map[$runnerUrl] ?? false);
            }

            public function setReady(string $runnerUrl, bool $ready): void
            {
                $this->state->map[$runnerUrl] = $ready;
            }
        };

        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'eric',
                    'type' => 'human',
                    'runner_url' => '',
                ],
                [
                    'name' => 'path',
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-path.sw-factory.svc:8080',
                ],
            ],
            'prompts' => [
                'catch_up' => 'Catch up since {lookback_since}. Use agent-catch-up skill.',
            ],
            'budget' => ['timeout_ms' => 600000],
            'success_retry' => ['max_attempts' => 2],
        ]);

        $ticker = new ReadyCatchupTicker($config, $sessions, $runner, $probe);
        $t0 = new DateTimeImmutable('2026-08-06 01:00:00', new DateTimeZone('UTC'));

        $this->assertSame(0, $ticker->tick($t0));
        $this->assertCount(0, $calls);

        $probe->setReady('http://cursor-agent-path.sw-factory.svc:8080', true);
        $t1 = new DateTimeImmutable('2026-08-06 01:01:00', new DateTimeZone('UTC'));
        $this->assertSame(1, $ticker->tick($t1));
        $this->assertCount(1, $calls);
        $this->assertStringEndsWith('/sessions', $calls[0]['url']);
        $this->assertArrayNotHasKey('ticket_id', $calls[0]['body']);
        $prompt = (string) ($calls[0]['body']['prompt'] ?? '');
        $this->assertStringContainsString('Catch up since', $prompt);
        $this->assertStringNotContainsString('Active ticket_id', $prompt);
        // first commute: lookback = now - 48h
        $this->assertStringContainsString('2026-08-04T01:01:00+00:00', $prompt);

        $this->assertSame(0, $ticker->tick($t1));
        $this->assertCount(1, $calls);
    }

    public function testReadyDropThenRiseFiresAgainWithPriorLookback(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = [];
        $runner = new ResilientRunnerClient(
            new RunnerClient(
                function (string $url, array $body) use (&$calls): array {
                    $calls[] = ['url' => $url, 'body' => $body];

                    return ['agent_id' => 'agent-' . count($calls)];
                },
                static function (string $url): void {
                }
            ),
            $sessions
        );
        $readyState = new \stdClass();
        $readyState->ready = true;
        $probe = new class ($readyState) implements RunnerReadyProbe {
            public function __construct(private \stdClass $state)
            {
            }

            public function isReady(string $runnerUrl): bool
            {
                return (bool) $this->state->ready;
            }

            public function set(bool $ready): void
            {
                $this->state->ready = $ready;
            }
        };

        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'km',
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-km.sw-factory.svc:8080',
                ],
            ],
            'prompts' => [
                'catch_up' => 'since={lookback_since}',
            ],
        ]);
        $ticker = new ReadyCatchupTicker($config, $sessions, $runner, $probe);
        $url = 'http://cursor-agent-km.sw-factory.svc:8080';

        $this->assertSame(
            1,
            $ticker->tick(new DateTimeImmutable('2026-08-06 02:00:00', new DateTimeZone('UTC')))
        );
        $firstLookback = (string) ($calls[0]['body']['prompt'] ?? '');

        $probe->set(false);
        $this->assertSame(
            0,
            $ticker->tick(new DateTimeImmutable('2026-08-06 02:05:00', new DateTimeZone('UTC')))
        );
        $this->assertFalse($sessions->getRunnerReady($url)['is_ready']);

        $probe->set(true);
        $this->assertSame(
            1,
            $ticker->tick(new DateTimeImmutable('2026-08-06 02:10:00', new DateTimeZone('UTC')))
        );
        $this->assertCount(2, $calls);
        $second = (string) ($calls[1]['body']['prompt'] ?? '');
        $this->assertStringContainsString('since=2026-08-06T02:00:00+00:00', $second);
        $this->assertNotSame($firstLookback, $second);
    }

    public function testSkipsHumanAndEmptyRunnerUrl(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = [];
        $runner = new ResilientRunnerClient(
            new RunnerClient(
                function (string $url, array $body) use (&$calls): array {
                    $calls[] = $url;

                    return ['agent_id' => 'x'];
                },
                static function (string $url): void {
                }
            ),
            $sessions
        );
        $probe = new class implements RunnerReadyProbe {
            public function isReady(string $runnerUrl): bool
            {
                return true;
            }
        };
        $config = new BridgeConfig([
            'agents' => [
                ['name' => 'eric', 'type' => 'human', 'runner_url' => ''],
                ['name' => 'broken', 'type' => 'sessions', 'runner_url' => ''],
            ],
            'prompts' => ['catch_up' => 'go'],
        ]);
        $ticker = new ReadyCatchupTicker($config, $sessions, $runner, $probe);
        $this->assertSame(0, $ticker->tick());
        $this->assertCount(0, $calls);
    }
}
