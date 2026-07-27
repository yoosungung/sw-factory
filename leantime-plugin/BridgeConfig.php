<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class BridgeConfig
{
    /** @var array<string, mixed> */
    private array $data;

  /**
   * @param array<string, mixed> $data
   */
    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public static function fromFile(string $path): self
    {
        if (!is_readable($path)) {
            throw new \RuntimeException("bridge.json not readable: {$path}");
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('bridge.json must be a JSON object');
        }

        return new self($decoded);
    }

    public function debounceMs(): int
    {
        return (int) ($this->data['debounce_ms'] ?? 3000);
    }

    public function mentionRoutingEnabled(): bool
    {
        return (bool) ($this->data['mention_routing'] ?? false);
    }

    /** @return list<array<string, mixed>> */
    public function agents(): array
    {
        return array_values($this->data['agents'] ?? []);
    }

    public function promptFor(string $event, array $vars = []): string
    {
        $prompts = $this->data['prompts'] ?? [];

        $text = (string) ($prompts[$event] ?? 'Process Leantime ticket event.');
        foreach ($vars as $key => $value) {
            $text = str_replace('{' . $key . '}', (string) $value, $text);
        }

        return $text;
    }

    public function promptForStatus(?int $statusId): ?string
    {
        if ($statusId === null) {
            return null;
        }

        $statusPrompts = $this->data['status_prompts'] ?? [];
        if (!array_key_exists((string) $statusId, $statusPrompts)) {
            return null;
        }

        return (string) $statusPrompts[(string) $statusId];
    }

    public function runnerForUserId(int $userId): ?array
    {
        foreach ($this->agents() as $agent) {
            if ((int) ($agent['leantime_user_id'] ?? 0) === $userId) {
                return $agent;
            }
        }

        return null;
    }

    public function runnerForEmail(string $email): ?array
    {
        $needle = strtolower(trim($email));
        foreach ($this->agents() as $agent) {
            if (strtolower((string) ($agent['email'] ?? '')) === $needle) {
                return $agent;
            }
        }

        return null;
    }

    public function isAgentAccount(int $userId): bool
    {
        $agent = $this->runnerForUserId($userId);

        return $agent !== null && $this->agentType($agent) !== 'human';
    }

    /** @param array<string, mixed>|null $agent */
    public function agentType(?array $agent): string
    {
        if ($agent === null) {
            return 'human';
        }

        $type = strtolower(trim((string) ($agent['type'] ?? '')));
        if ($type === 'sessions' || $type === 'openai' || $type === 'human') {
            return $type;
        }

        return 'human';
    }

    public function typeForRunnerUrl(string $runnerUrl): string
    {
        $needle = rtrim($runnerUrl, '/');
        foreach ($this->agents() as $agent) {
            if (rtrim((string) ($agent['runner_url'] ?? ''), '/') === $needle) {
                return $this->agentType($agent);
            }
        }

        return 'sessions';
    }

    /** @deprecated use isAgentAccount() */
    public function isBotUserId(int $userId): bool
    {
        return $this->isAgentAccount($userId);
    }

    /** @return list<array<string, mixed>> */
    public function schedules(): array
    {
        $raw = $this->data['schedules'] ?? [];
        if (!is_array($raw)) {
            return [];
        }

        return array_values($raw);
    }

    /**
     * Optional completion criteria phrases for event prompts (soft; agent-enforced).
     *
     * @return list<string>
     */
    public function successChecks(): array
    {
        return $this->normalizeChecks($this->data['success_checks'] ?? []);
    }

    /**
     * @param array<string, mixed> $schedule
     * @return list<string>
     */
    public function successChecksForSchedule(array $schedule): array
    {
        $checks = $this->normalizeChecks($schedule['success_checks'] ?? []);
        if ($checks !== []) {
            return $checks;
        }

        return $this->successChecks();
    }

    /**
     * Optional schedule gates (AND). Omitted or empty = no gates (always fire).
     *
     * @param array<string, mixed> $schedule
     * @return list<string>
     */
    public function gatesForSchedule(array $schedule): array
    {
        return $this->normalizeChecks($schedule['gates'] ?? []);
    }

    /**
     * @param list<string> $checks
     */
    public function formatSuccessChecksPrompt(array $checks): string
    {
        if ($checks === []) {
            return '';
        }

        $lines = ['Success checks (verify before finishing; if any fail, fix or comment blocker):'];
        foreach ($checks as $index => $check) {
            $lines[] = ($index + 1) . '. ' . $check;
        }

        return implode("\n", $lines);
    }

    /**
     * @return list<string>
     */
    private function normalizeChecks(mixed $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $out = [];
        foreach ($raw as $item) {
            if (!is_string($item)) {
                continue;
            }
            $text = trim($item);
            if ($text !== '') {
                $out[] = $text;
            }
        }

        return $out;
    }

    /**
     * Optional soft run budget forwarded to the runner (prompt preamble + logs).
     *
     * @return array{timeout_ms?: int}|null
     */
    public function budget(): ?array
    {
        $raw = $this->data['budget'] ?? null;
        if (!is_array($raw)) {
            return null;
        }

        $out = [];
        if (isset($raw['timeout_ms']) && is_numeric($raw['timeout_ms'])) {
            $out['timeout_ms'] = (int) $raw['timeout_ms'];
        }

        return $out === [] ? null : $out;
    }

    /** Verified-run corrective re-send cap (Phase 2). Null when unset. */
    public function successRetryMaxAttempts(): ?int
    {
        $raw = $this->data['success_retry']['max_attempts'] ?? null;
        if (!is_int($raw) || $raw < 0) {
            return null;
        }

        return $raw;
    }

    public function agentByName(string $name): ?array
    {
        $needle = strtolower(trim($name));
        if ($needle === '') {
            return null;
        }

        foreach ($this->agents() as $agent) {
            $agentName = strtolower(trim((string) ($agent['name'] ?? '')));
            $persona = strtolower(trim((string) ($agent['persona'] ?? '')));
            if ($agentName === $needle || $persona === $needle) {
                return $agent;
            }
        }

        return null;
    }
}
