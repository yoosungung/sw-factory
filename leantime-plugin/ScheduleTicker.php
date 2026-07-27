<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;

final class ScheduleTicker
{
    private BridgeConfig $config;
    private SessionStore $sessions;
    private ResilientRunnerClient $runner;
    private ScheduleGates $gates;

    public function __construct(
        BridgeConfig $config,
        SessionStore $sessions,
        ResilientRunnerClient $runner,
        ?ScheduleGates $gates = null
    ) {
        $this->config = $config;
        $this->sessions = $sessions;
        $this->runner = $runner;
        $this->gates = $gates ?? new DefaultScheduleGates(new NullInProgressTicketProbe());
    }

    public function tick(?DateTimeInterface $now = null): int
    {
        $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
        if ($now->getTimezone()->getName() !== 'UTC') {
            $now = DateTimeImmutable::createFromInterface($now)->setTimezone(new DateTimeZone('UTC'));
        }

        $fireKey = $now->format('Y-m-d\TH:i');
        $dispatched = 0;

        foreach ($this->config->schedules() as $schedule) {
            $scheduleId = (string) ($schedule['id'] ?? '');
            $cron = (string) ($schedule['cron'] ?? '');
            $prompt = (string) ($schedule['prompt'] ?? '');
            if ($scheduleId === '' || $cron === '' || $prompt === '') {
                continue;
            }
            if (!ScheduleCron::isDue($cron, $now)) {
                continue;
            }
            if (!$this->sessions->claimScheduleFire($scheduleId, $fireKey)) {
                continue;
            }
            if (!$this->gates->passes($this->config->gatesForSchedule($schedule))) {
                continue;
            }

            foreach ($this->resolveAgents($schedule) as $agent) {
                $runnerUrl = trim((string) ($agent['runner_url'] ?? ''));
                if ($runnerUrl === '') {
                    continue;
                }

                $runPrompt = $prompt;
                $scheduleChecks = $this->config->successChecksForSchedule($schedule);
                $checks = $this->config->formatSuccessChecksPrompt($scheduleChecks);
                if ($checks !== '') {
                    $runPrompt .= "\n" . $checks;
                }

                // Ticket-less standup session: agent uses MCP to find open work.
                $created = $this->runner->createSession(
                    $runnerUrl,
                    $runPrompt,
                    null,
                    $this->config->budget(),
                    $scheduleChecks,
                    $this->config->successRetryMaxAttempts()
                );
                if ($created !== null) {
                    $dispatched++;
                }
            }
        }

        return $dispatched;
    }

    /**
     * @param array<string, mixed> $schedule
     * @return list<array<string, mixed>>
     */
    private function resolveAgents(array $schedule): array
    {
        $names = $schedule['agents'] ?? null;
        if (!is_array($names) || $names === []) {
            return array_values(array_filter(
                $this->config->agents(),
                function (array $agent): bool {
                    return $this->config->agentType($agent) !== 'human'
                        && trim((string) ($agent['runner_url'] ?? '')) !== '';
                }
            ));
        }

        $out = [];
        foreach ($names as $name) {
            $agent = $this->config->agentByName((string) $name);
            if ($agent === null) {
                continue;
            }
            if ($this->config->agentType($agent) === 'human') {
                continue;
            }
            if (trim((string) ($agent['runner_url'] ?? '')) === '') {
                continue;
            }
            $out[] = $agent;
        }

        return $out;
    }
}
