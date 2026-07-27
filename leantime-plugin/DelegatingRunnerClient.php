<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** Routes to sessions or openai transport by agents[].type for the runner_url. */
final class DelegatingRunnerClient implements RunnerTransport
{
    private BridgeConfig $config;
    private RunnerClient $sessions;
    private OpenAIRunnerClient $openai;

    public function __construct(
        BridgeConfig $config,
        RunnerClient $sessions,
        OpenAIRunnerClient $openai
    ) {
        $this->config = $config;
        $this->sessions = $sessions;
        $this->openai = $openai;
    }

    public function createSession(
        string $runnerUrl,
        string $prompt,
        ?int $ticketId = null,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): array {
        return $this->transport($runnerUrl)->createSession(
            $runnerUrl,
            $prompt,
            $ticketId,
            $budget,
            $successChecks,
            $successMaxAttempts
        );
    }

    public function prompt(
        string $runnerUrl,
        string $agentId,
        string $prompt,
        string $event,
        int $ticketId,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): array {
        return $this->transport($runnerUrl)->prompt(
            $runnerUrl,
            $agentId,
            $prompt,
            $event,
            $ticketId,
            $budget,
            $successChecks,
            $successMaxAttempts
        );
    }

    public function deleteSession(string $runnerUrl, string $agentId): void
    {
        $this->transport($runnerUrl)->deleteSession($runnerUrl, $agentId);
    }

    private function transport(string $runnerUrl): RunnerTransport
    {
        if ($this->config->typeForRunnerUrl($runnerUrl) === 'openai') {
            return $this->openai;
        }

        return $this->sessions;
    }
}
