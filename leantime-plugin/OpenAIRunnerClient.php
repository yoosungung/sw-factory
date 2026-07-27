<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * OpenAI-compatible runner (Hermes API Server /v1/responses).
 * Fire-and-forget: does not wait for the agent run to finish.
 */
final class OpenAIRunnerClient implements RunnerTransport
{
    /** @var callable */
    private $httpPost;

    private string $apiKey;

    /**
     * @param callable(string, array<string, mixed>): mixed $httpPost
     */
    public function __construct(callable $httpPost, string $apiKey)
    {
        $this->httpPost = $httpPost;
        $this->apiKey = $apiKey;
    }

    public static function fromCurl(?string $apiKey = null): self
    {
        $key = $apiKey ?? (string) (getenv('CURSORBRIDGE_OPENAI_API_KEY') ?: '');

        return new self(
            static function (string $url, array $body) use ($key): array {
                if ($key === '') {
                    throw new \RuntimeException(
                        'CURSORBRIDGE_OPENAI_API_KEY is required for type=openai runners'
                    );
                }

                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/json',
                        'Authorization: Bearer ' . $key,
                    ],
                    CURLOPT_POSTFIELDS => json_encode($body),
                    CURLOPT_CONNECTTIMEOUT => 5,
                    // Accept after send; do not wait for full agent completion.
                    CURLOPT_TIMEOUT => 2,
                ]);
                $raw = curl_exec($ch);
                $errno = curl_errno($ch);
                $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $error = curl_error($ch);

                if (
                    $errno === CURLE_OPERATION_TIMEDOUT
                    || $errno === 28 /* CURLE_OPERATION_TIMEDOUT alias */
                ) {
                    return ['_accepted' => true];
                }
                if ($raw === false) {
                    throw new \RuntimeException('OpenAI runner HTTP failed: ' . $error);
                }
                if ($status >= 400) {
                    throw new \RuntimeException(
                        'OpenAI runner HTTP ' . $status . ': ' . substr((string) $raw, 0, 200)
                    );
                }

                $decoded = json_decode((string) $raw, true);

                return is_array($decoded) ? $decoded : ['_accepted' => true];
            },
            $key
        );
    }

    public static function conversationForTicket(int $ticketId): string
    {
        return 'leantime-ticket-' . $ticketId;
    }

    public static function newConversationId(): string
    {
        return 'leantime-session-' . bin2hex(random_bytes(8));
    }

    public function createSession(
        string $runnerUrl,
        string $prompt,
        ?int $ticketId = null,
        ?array $budget = null,
        array $successChecks = [],
        ?int $successMaxAttempts = null
    ): array {
        $conversation = $ticketId !== null
            ? self::conversationForTicket($ticketId)
            : self::newConversationId();

        $this->postResponses($runnerUrl, $prompt, $conversation);

        return ['agent_id' => $conversation];
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
        $conversation = $agentId !== '' ? $agentId : self::conversationForTicket($ticketId);
        $this->postResponses($runnerUrl, $prompt, $conversation);

        return ['run_id' => $conversation, 'status' => 'accepted'];
    }

    public function deleteSession(string $runnerUrl, string $agentId): void
    {
        // Named conversations are not deleted via the OpenAI Responses API.
    }

    private function postResponses(string $runnerUrl, string $prompt, string $conversation): void
    {
        ($this->httpPost)(
            rtrim($runnerUrl, '/') . '/v1/responses',
            [
                'input' => $prompt,
                'conversation' => $conversation,
                'store' => true,
            ]
        );
    }
}
