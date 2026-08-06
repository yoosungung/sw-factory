<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;

final class ReadyCatchupTicker
{
    private BridgeConfig $config;
    private SessionStore $sessions;
    private ResilientRunnerClient $runner;
    private RunnerReadyProbe $probe;

    public function __construct(
        BridgeConfig $config,
        SessionStore $sessions,
        ResilientRunnerClient $runner,
        RunnerReadyProbe $probe
    ) {
        $this->config = $config;
        $this->sessions = $sessions;
        $this->runner = $runner;
        $this->probe = $probe;
    }

    public function tick(?DateTimeInterface $now = null): int
    {
        $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
        if ($now->getTimezone()->getName() !== 'UTC') {
            $now = DateTimeImmutable::createFromInterface($now)->setTimezone(new DateTimeZone('UTC'));
        }

        $dispatched = 0;
        foreach ($this->catchUpAgents() as $agent) {
            $runnerUrl = rtrim(trim((string) ($agent['runner_url'] ?? '')), '/');
            if ($runnerUrl === '') {
                continue;
            }

            $ready = $this->probe->isReady($runnerUrl);
            $prev = $this->sessions->getRunnerReady($runnerUrl);

            if (!$ready) {
                $this->sessions->setRunnerReady($runnerUrl, false);
                continue;
            }

            $wasReady = $prev !== null && $prev['is_ready'];
            if ($wasReady) {
                $this->sessions->setRunnerReady($runnerUrl, true);
                continue;
            }

            $epoch = $now->format(DATE_ATOM);
            if (!$this->sessions->claimCatchUp($runnerUrl, $epoch)) {
                $this->sessions->setRunnerReady($runnerUrl, true, $epoch);
                continue;
            }

            $lookback = $prev['last_catch_up_at']
                ?? $now->modify('-48 hours')->format(DATE_ATOM);
            $prompt = $this->config->promptFor('catch_up', [
                'lookback_since' => $lookback,
            ]);
            $checks = $this->config->successChecks();
            $checksPrompt = $this->config->formatSuccessChecksPrompt($checks);
            if ($checksPrompt !== '') {
                $prompt .= "\n" . $checksPrompt;
            }

            $created = $this->runner->createSession(
                $runnerUrl,
                $prompt,
                null,
                $this->config->budget(),
                $checks,
                $this->config->successRetryMaxAttempts()
            );
            $catchUpAt = $now->format(DATE_ATOM);
            $this->sessions->setRunnerReady($runnerUrl, true, $epoch, $catchUpAt);
            if ($created !== null) {
                $dispatched++;
            }
        }

        return $dispatched;
    }

    /** @return list<array<string, mixed>> */
    private function catchUpAgents(): array
    {
        return array_values(array_filter(
            $this->config->agents(),
            function (array $agent): bool {
                return $this->config->agentType($agent) !== 'human'
                    && trim((string) ($agent['runner_url'] ?? '')) !== '';
            }
        ));
    }
}
