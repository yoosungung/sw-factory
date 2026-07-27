<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

interface RunnerTransport
{
    /**
     * @param array{timeout_ms?: int}|null $budget
     * @param list<string> $successChecks
     * @return array{agent_id: string}
     */
    public function createSession(
        string $runnerUrl,
        string $prompt,
        ?int $ticketId = null,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): array;

    /**
     * @param array{timeout_ms?: int}|null $budget
     * @param list<string> $successChecks
     * @return array{run_id: string, status: string}
     */
    public function prompt(
        string $runnerUrl,
        string $agentId,
        string $prompt,
        string $event,
        int $ticketId,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): array;

    public function deleteSession(string $runnerUrl, string $agentId): void;
}
