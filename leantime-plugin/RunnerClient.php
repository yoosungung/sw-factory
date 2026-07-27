<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class RunnerClient implements RunnerTransport
{
    /** @var callable */
    private $httpPost;

    /** @var callable */
    private $httpDelete;

    /**
     * @param callable(string, array<string, mixed>): array<string, mixed> $httpPost
     * @param callable(string): void $httpDelete
     */
    public function __construct(callable $httpPost, callable $httpDelete)
    {
        $this->httpPost = $httpPost;
        $this->httpDelete = $httpDelete;
    }

    public static function fromCurl(): self
    {
        return new self(
            static function (string $url, array $body): array {
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                    CURLOPT_POSTFIELDS => json_encode($body),
                    CURLOPT_TIMEOUT => 120,
                ]);
                $raw = curl_exec($ch);
                $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                if ($raw === false) {
                    throw new \RuntimeException('Runner HTTP failed: ' . curl_error($ch));
                }
                $decoded = json_decode($raw, true);
                if (!is_array($decoded)) {
                    throw new \RuntimeException(
                        'Runner returned invalid JSON (HTTP ' . $status . '): ' . substr((string) $raw, 0, 200)
                    );
                }
                if ($status === 404) {
                    throw new RunnerSessionNotFoundException(
                        (string) ($decoded['detail'] ?? 'session not found')
                    );
                }
                if ($status >= 400 && $status !== 409) {
                    throw new \RuntimeException(
                        'Runner HTTP ' . $status . ': ' . substr((string) $raw, 0, 200)
                    );
                }

                return $decoded;
            },
            static function (string $url): void {
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_CUSTOMREQUEST => 'DELETE',
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 30,
                ]);
                curl_exec($ch);
            }
        );
    }

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
    ): array {
        $body = ['prompt' => $prompt];
        if ($ticketId !== null) {
            $body['ticket_id'] = $ticketId;
        }
        $body = self::withControl($body, $budget, $successChecks, $successMaxAttempts);

        $result = ($this->httpPost)(rtrim($runnerUrl, '/') . '/sessions', $body);

        if (!isset($result['agent_id'])) {
            throw new \RuntimeException('Runner createSession missing agent_id');
        }

        return ['agent_id' => (string) $result['agent_id']];
    }

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
    ): array {
        $body = [
            'prompt' => $prompt,
            'event' => $event,
            'ticket_id' => $ticketId,
        ];
        $body = self::withControl($body, $budget, $successChecks, $successMaxAttempts);

        $result = ($this->httpPost)(
            rtrim($runnerUrl, '/') . '/sessions/' . rawurlencode($agentId) . '/prompt',
            $body
        );

        return [
            'run_id' => (string) ($result['run_id'] ?? ''),
            'status' => (string) ($result['status'] ?? 'unknown'),
        ];
    }

    public function deleteSession(string $runnerUrl, string $agentId): void
    {
        ($this->httpDelete)(rtrim($runnerUrl, '/') . '/sessions/' . rawurlencode($agentId));
    }

    /**
     * @param array<string, mixed> $body
     * @param array{timeout_ms?: int}|null $budget
     * @param list<string> $successChecks
     * @return array<string, mixed>
     */
    private static function withControl(array $body, ?array $budget, array $successChecks, ?int $successMaxAttempts): array
    {
        if ($budget !== null && $budget !== []) {
            $body['budget'] = $budget;
        }
        if ($successChecks !== []) {
            $body['success_checks'] = array_values($successChecks);
        }
        if ($successMaxAttempts !== null) {
            $body['success_retry'] = ['max_attempts' => $successMaxAttempts];
        }

        return $body;
    }
}
