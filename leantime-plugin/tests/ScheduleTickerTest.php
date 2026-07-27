<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use DateTimeImmutable;
use DateTimeZone;
use Leantime\Plugins\CursorBridge\BridgeConfig;
use Leantime\Plugins\CursorBridge\DefaultScheduleGates;
use Leantime\Plugins\CursorBridge\InProgressTicketProbe;
use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\ScheduleTicker;
use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class ScheduleTickerTest extends TestCase
{
    public function testCommonScheduleCreatesNewSessionPerBot(): void
    {
        $sessions = SessionStore::inMemory();

        $calls = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$calls): array {
                $calls[] = ['url' => $url, 'body' => $body];

                return ['agent_id' => 'agent-' . count($calls)];
            },
            static function (string $url): void {
            }
        );
        $runner = new ResilientRunnerClient($inner, $sessions);
        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'eric',
                    'leantime_user_id' => 1,
                    'type' => 'human',
                    'runner_url' => '',
                ],
                [
                    'name' => 'path',
                    'leantime_user_id' => 6,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-path.leantime.svc:8080',
                ],
                [
                    'name' => 'finder',
                    'leantime_user_id' => 9,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-finder.leantime.svc:8080',
                ],
            ],
            'budget' => ['timeout_ms' => 600000],
            'success_retry' => ['max_attempts' => 2],
            'schedules' => [
                [
                    'id' => 'weekday-check',
                    'cron' => '0 9 * * 1-5',
                    'prompt' => 'check open tickets',
                    'success_checks' => ['Report blockers with add_comment'],
                ],
            ],
        ]);

        $ticker = new ScheduleTicker($config, $sessions, $runner);
        $now = new DateTimeImmutable('2026-07-13 09:00:00', new DateTimeZone('UTC'));
        $this->assertSame(2, $ticker->tick($now));
        $this->assertCount(2, $calls);
        $this->assertStringEndsWith('/sessions', $calls[0]['url']);
        $prompt = (string) ($calls[0]['body']['prompt'] ?? '');
        $this->assertStringContainsString('check open tickets', $prompt);
        $this->assertStringContainsString('Success checks', $prompt);
        $this->assertStringContainsString('Report blockers with add_comment', $prompt);
        $this->assertArrayNotHasKey('ticket_id', $calls[0]['body']);
        $this->assertSame(['timeout_ms' => 600000], $calls[0]['body']['budget'] ?? null);
        $this->assertSame(['Report blockers with add_comment'], $calls[0]['body']['success_checks'] ?? null);
        $this->assertSame(['max_attempts' => 2], $calls[0]['body']['success_retry'] ?? null);

        $this->assertSame(0, $ticker->tick($now));
    }

    public function testPerAgentScheduleCreatesOnlyForListedBots(): void
    {
        $sessions = SessionStore::inMemory();

        $urls = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$urls): array {
                $urls[] = $url;

                return ['agent_id' => 'agent-finder'];
            },
            static function (string $url): void {
            }
        );
        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'path',
                    'leantime_user_id' => 6,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-path.leantime.svc:8080',
                ],
                [
                    'name' => 'finder',
                    'leantime_user_id' => 9,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-finder.leantime.svc:8080',
                ],
            ],
            'schedules' => [
                [
                    'id' => 'finder-wiki',
                    'cron' => '0 10 * * 1',
                    'agents' => ['finder'],
                    'prompt' => 'wiki check',
                ],
            ],
        ]);
        $ticker = new ScheduleTicker($config, $sessions, new ResilientRunnerClient($inner, $sessions));
        $now = new DateTimeImmutable('2026-07-13 10:00:00', new DateTimeZone('UTC'));
        $this->assertSame(1, $ticker->tick($now));
        $this->assertCount(1, $urls);
        $this->assertStringContainsString('cursor-agent-finder', $urls[0]);
        $this->assertStringEndsWith('/sessions', $urls[0]);
    }

    public function testSkipsWhenCronNotDue(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = 0;
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$calls): array {
                $calls++;

                return ['agent_id' => 'agent-path'];
            },
            static function (string $url): void {
            }
        );
        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'path',
                    'leantime_user_id' => 6,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-path.leantime.svc:8080',
                ],
            ],
            'schedules' => [
                [
                    'id' => 'weekday-check',
                    'cron' => '0 9 * * 1-5',
                    'prompt' => 'check',
                ],
            ],
        ]);
        $ticker = new ScheduleTicker($config, $sessions, new ResilientRunnerClient($inner, $sessions));
        $now = new DateTimeImmutable('2026-07-13 08:00:00', new DateTimeZone('UTC'));
        $this->assertSame(0, $ticker->tick($now));
        $this->assertSame(0, $calls);
    }

    public function testOmittingGatesStillFires(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = 0;
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$calls): array {
                $calls++;

                return ['agent_id' => 'agent-candy'];
            },
            static function (string $url): void {
            }
        );
        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'candy',
                    'leantime_user_id' => 4,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-candy.leantime.svc:8080',
                ],
            ],
            'schedules' => [
                [
                    'id' => 'no-gates',
                    'cron' => '5 * * * *',
                    'agents' => ['candy'],
                    'prompt' => 'always',
                ],
            ],
        ]);
        $falseProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return false;
            }
        };
        $ticker = new ScheduleTicker(
            $config,
            $sessions,
            new ResilientRunnerClient($inner, $sessions),
            new DefaultScheduleGates($falseProbe)
        );
        $now = new DateTimeImmutable('2026-07-13 09:05:00', new DateTimeZone('UTC'));
        $this->assertSame(1, $ticker->tick($now));
        $this->assertSame(1, $calls);
    }

    public function testInProgressGateSkipsWhenNoneActive(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = 0;
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$calls): array {
                $calls++;

                return ['agent_id' => 'agent-candy'];
            },
            static function (string $url): void {
            }
        );
        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'candy',
                    'leantime_user_id' => 4,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-candy.leantime.svc:8080',
                ],
            ],
            'schedules' => [
                [
                    'id' => 'candy-pm-checkpoint',
                    'cron' => '5 * * * *',
                    'agents' => ['candy'],
                    'gates' => ['in_progress'],
                    'prompt' => 'checkpoint',
                ],
            ],
        ]);
        $falseProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return false;
            }
        };
        $ticker = new ScheduleTicker(
            $config,
            $sessions,
            new ResilientRunnerClient($inner, $sessions),
            new DefaultScheduleGates($falseProbe)
        );
        $now = new DateTimeImmutable('2026-07-13 09:05:00', new DateTimeZone('UTC'));
        $this->assertSame(0, $ticker->tick($now));
        $this->assertSame(0, $calls);
    }

    public function testInProgressGateFiresWhenActive(): void
    {
        $sessions = SessionStore::inMemory();
        $calls = 0;
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$calls): array {
                $calls++;

                return ['agent_id' => 'agent-candy'];
            },
            static function (string $url): void {
            }
        );
        $config = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'candy',
                    'leantime_user_id' => 4,
                    'type' => 'sessions',
                    'runner_url' => 'http://cursor-agent-candy.leantime.svc:8080',
                ],
            ],
            'schedules' => [
                [
                    'id' => 'candy-pm-checkpoint',
                    'cron' => '5 * * * *',
                    'agents' => ['candy'],
                    'gates' => ['in_progress'],
                    'prompt' => 'checkpoint',
                ],
            ],
        ]);
        $trueProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return true;
            }
        };
        $ticker = new ScheduleTicker(
            $config,
            $sessions,
            new ResilientRunnerClient($inner, $sessions),
            new DefaultScheduleGates($trueProbe)
        );
        $now = new DateTimeImmutable('2026-07-13 09:05:00', new DateTimeZone('UTC'));
        $this->assertSame(1, $ticker->tick($now));
        $this->assertSame(1, $calls);
    }
}
