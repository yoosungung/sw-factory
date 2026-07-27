<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class Router
{
    private BridgeConfig $config;
    private SessionStore $sessions;
    private ResilientRunnerClient $runner;
    private TicketLookup $tickets;

    /** @var array<int, true> */
    private array $ticketLocks = [];

    /** @var array<int, float> */
    private array $lastEventAt = [];

    public function __construct(
        BridgeConfig $config,
        SessionStore $sessions,
        ResilientRunnerClient $runner,
        ?TicketLookup $tickets = null
    ) {
        $this->config = $config;
        $this->sessions = $sessions;
        $this->runner = $runner;
        $this->tickets = $tickets ?? new NullTicketLookup();
    }

    /**
     * @param array<string, mixed> $payload
     * @return list<array{runner_url: string, agent_id: string, run_id: string, status: string}>
     */
    public function handle(string $event, array $payload): array
    {
        $ticketId = (int) ($payload['ticketId'] ?? $payload['ticket_id'] ?? 0);
        if ($ticketId <= 0) {
            return [];
        }

        $payload = $this->enrichPayload($payload, $ticketId);

        if ($this->isDebounced($ticketId)) {
            return [];
        }

        if (!$this->acquireTicketLock($ticketId)) {
            return [];
        }

        try {
            return $this->dispatch($event, $payload, $ticketId);
        } finally {
            $this->releaseTicketLock($ticketId);
        }
    }

    /**
     * TicketCreated/Updated class events only ship ticketId — load assignee from DB.
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function enrichPayload(array $payload, int $ticketId): array
    {
        $assignee = (int) (
            $payload['assigneeUserId']
            ?? $payload['assignee_user_id']
            ?? $payload['editorId']
            ?? 0
        );
        if ($assignee > 0 && isset($payload['status'])) {
            return $payload;
        }

        $found = $this->tickets->find($ticketId);
        if ($found === null) {
            return $payload;
        }

        return array_merge($found, $payload);
    }

    /**
     * @param array<string, mixed> $payload
     * @return list<array{runner_url: string, agent_id: string, run_id: string, status: string}>
     */
    private function dispatch(string $event, array $payload, int $ticketId): array
    {
        $assigneeId = $this->resolveAssigneeId($payload);
        $actorId = $this->resolveActorId($payload);
        $results = [];

        if (!$this->isSelfEcho($actorId, $assigneeId)) {
            $runner = $this->config->runnerForUserId($assigneeId);
            $runnerUrl = $runner !== null ? trim((string) ($runner['runner_url'] ?? '')) : '';
            if ($runner !== null && $runnerUrl !== '') {
                $prompt = $this->buildPrompt($event, $payload);
                $agentId = $this->sessions->getAgentId($ticketId);
                if ($agentId === null) {
                    $created = $this->runner->createSession($runnerUrl, $prompt, $ticketId, $this->config->budget(), $this->config->successChecks(), $this->config->successRetryMaxAttempts());
                    if ($created === null) {
                        return $results;
                    }
                    $agentId = $created['agent_id'];
                    $this->sessions->upsert($ticketId, $agentId, $assigneeId);
                    $results[] = [
                        'runner_url' => $runnerUrl,
                        'agent_id' => $agentId,
                        'run_id' => 'create',
                        'status' => 'created',
                    ];
                } else {
                    $run = $this->runner->prompt($runnerUrl, $agentId, $prompt, $event, $ticketId, $this->config->budget(), $this->config->successChecks(), $this->config->successRetryMaxAttempts());
                    if ($run === null) {
                        $this->sessions->delete($ticketId);
                        $created = $this->runner->createSession($runnerUrl, $prompt, $ticketId, $this->config->budget(), $this->config->successChecks(), $this->config->successRetryMaxAttempts());
                        if ($created === null) {
                            return $results;
                        }
                        $agentId = $created['agent_id'];
                        $this->sessions->upsert($ticketId, $agentId, $assigneeId);
                        $results[] = [
                            'runner_url' => $runnerUrl,
                            'agent_id' => $agentId,
                            'run_id' => 'create',
                            'status' => 'recreated',
                        ];
                    } else {
                        $this->sessions->upsert($ticketId, $agentId, $assigneeId);
                        $results[] = array_merge(['runner_url' => $runnerUrl, 'agent_id' => $agentId], $run);
                    }
                }
            }
        }

        if ($event === 'comment_added' && $this->config->mentionRoutingEnabled()) {
            $results = array_merge($results, $this->routeMentions($payload, $ticketId, $assigneeId));
        }

        if ($event === 'assignee_changed') {
            $results = array_merge($results, $this->notifyHandoff($payload, $ticketId, $assigneeId));
        }

        return $results;
    }

    private function acquireTicketLock(int $ticketId): bool
    {
        if (isset($this->ticketLocks[$ticketId])) {
            return false;
        }
        $this->ticketLocks[$ticketId] = true;

        return true;
    }

    private function releaseTicketLock(int $ticketId): void
    {
        unset($this->ticketLocks[$ticketId]);
    }

    public function handleTicketDeleted(array $payload): void
    {
        $ticketId = (int) ($payload['ticketId'] ?? $payload['ticket_id'] ?? 0);
        if ($ticketId <= 0) {
            return;
        }

        $agentId = $this->sessions->getAgentId($ticketId);
        if ($agentId === null) {
            return;
        }

        $assigneeId = $this->resolveAssigneeId($payload);
        $runner = $this->config->runnerForUserId($assigneeId);
        if ($runner !== null) {
            $this->runner->deleteSession((string) $runner['runner_url'], $agentId, $ticketId);
        }

        $this->sessions->delete($ticketId);
    }

    /** @param array<string, mixed> $payload */
    private function resolveActorId(array $payload): int
    {
        return (int) ($payload['actorUserId'] ?? $payload['userId'] ?? $payload['user_id'] ?? 0);
    }

    private function isSelfEcho(int $actorId, int $assigneeId): bool
    {
        if ($actorId <= 0 || $assigneeId <= 0 || $actorId !== $assigneeId) {
            return false;
        }

        return $this->config->isAgentAccount($assigneeId);
    }

    private function isDebounced(int $ticketId): bool
    {
        $now = microtime(true);
        $last = $this->lastEventAt[$ticketId] ?? 0.0;
        $this->lastEventAt[$ticketId] = $now;

        return ($now - $last) * 1000 < $this->config->debounceMs();
    }

    /** @param array<string, mixed> $payload */
    private function resolveAssigneeId(array $payload): int
    {
        return (int) (
            $payload['assigneeUserId']
            ?? $payload['assignee_user_id']
            ?? $payload['editorId']
            ?? $payload['userId']
            ?? 0
        );
    }

    /** @param array<string, mixed> $payload */
    private function buildPrompt(string $event, array $payload): string
    {
        $ticketId = (int) ($payload['ticketId'] ?? $payload['ticket_id'] ?? 0);
        $parts = [
            $this->config->promptFor($event, [
                'ticket_id' => (string) $ticketId,
            ]),
        ];

        $statusId = isset($payload['status']) ? (int) $payload['status'] : null;
        $statusPrompt = $this->config->promptForStatus($statusId);
        if ($statusPrompt !== null) {
            $parts[] = $statusPrompt;
        }

        if ($event === 'assignee_changed') {
            $parts[] = 'Previous assignee: ' . (string) ($payload['previousAssigneeUserId'] ?? 'unknown');
            $parts[] = 'New assignee: ' . (string) ($payload['assigneeUserId'] ?? 'unknown');
            $parts[] = $this->delegationLine(
                (string) ($payload['previousAssigneeUserId'] ?? 'unknown'),
                (string) ($payload['assigneeUserId'] ?? 'unknown'),
                'assignee_changed'
            );
        }

        if ($event === 'comment_added' && isset($payload['commentText'])) {
            $parts[] = 'Comment: ' . (string) $payload['commentText'];
        }

        $summary = $this->contextSummaryFromPayload($payload, $ticketId);
        if ($summary !== null) {
            $parts[] = $summary;
        }

        $checks = $this->config->formatSuccessChecksPrompt($this->config->successChecks());
        if ($checks !== '') {
            $parts[] = $checks;
        }

        if ($ticketId > 0) {
            $parts[] = $this->ticketScopeInstruction($ticketId);
        }

        return implode("\n", $parts);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function contextSummaryFromPayload(array $payload, int $ticketId): ?string
    {
        $headline = trim((string) ($payload['headline'] ?? $payload['title'] ?? ''));
        $status = $payload['status'] ?? null;
        if ($headline === '' && $status === null && $ticketId <= 0) {
            return null;
        }

        $bits = [];
        if ($ticketId > 0) {
            $bits[] = 'ticket_id=' . $ticketId;
        }
        if ($headline !== '') {
            $bits[] = 'title=' . $headline;
        }
        if ($status !== null && $status !== '') {
            $bits[] = 'status=' . (string) $status;
        }

        return 'Context summary (do not treat as audit log replacement): ' . implode('; ', $bits);
    }

    private function delegationLine(string $from, string $to, string $purpose): string
    {
        return 'Delegation lineage: delegated_from=' . $from
            . ', delegated_to=' . $to
            . ', purpose=' . $purpose
            . '. Record outcome on the Active ticket with add_comment.';
    }

    private function ticketScopeInstruction(int $ticketId): string
    {
        return 'Active ticket_id=' . $ticketId
            . '. Call get_ticket(' . $ticketId . ') and get_comments(module=ticket, module_id=' . $ticketId . ').'
            . ' All writes (add_comment module_id=' . $ticketId . ', update_ticket ticket_id=' . $ticketId . ')'
            . ' MUST target this ticket only. Do not comment on other tickets unless the user explicitly names another id.';
    }

    /**
     * @param array<string, mixed> $payload
     * @return list<array{runner_url: string, agent_id: string, run_id: string, status: string}>
     */
    private function routeMentions(array $payload, int $ticketId, int $primaryAssigneeId): array
    {
        $text = (string) ($payload['commentText'] ?? '');
        if ($text === '') {
            return [];
        }

        $results = [];

        foreach ($this->extractMentionedUserIds($text) as $userId) {
            if ($userId === $primaryAssigneeId) {
                continue;
            }

            $runner = $this->config->runnerForUserId($userId);
            if ($runner === null) {
                continue;
            }

            $runnerUrl = trim((string) ($runner['runner_url'] ?? ''));
            if ($runnerUrl === '') {
                continue;
            }

            $mentionPrompt = $this->config->promptFor('mention', ['ticket_id' => (string) $ticketId]);
            $mentionPrompt .= "\n" . $this->delegationLine(
                (string) ($payload['actorUserId'] ?? $payload['userId'] ?? 'unknown'),
                (string) $userId,
                'mention'
            );
            $mentionPrompt .= "\n" . $this->ticketScopeInstruction($ticketId);
            $storedAssigneeId = $this->sessions->getAssigneeUserId($ticketId);
            $agentId = $storedAssigneeId === $userId ? $this->sessions->getAgentId($ticketId) : null;

            if ($agentId === null) {
                $created = $this->runner->createSession($runnerUrl, $mentionPrompt, $ticketId, $this->config->budget());
                if ($created === null) {
                    continue;
                }
                $agentId = $created['agent_id'];
                if ($storedAssigneeId === null || $storedAssigneeId === $userId) {
                    $this->sessions->upsert($ticketId, $agentId, $userId);
                }
                $results[] = [
                    'runner_url' => $runnerUrl,
                    'agent_id' => $agentId,
                    'run_id' => 'create',
                    'status' => 'mentioned',
                ];
            } else {
                $run = $this->runner->prompt($runnerUrl, $agentId, $mentionPrompt, 'mention', $ticketId, $this->config->budget());
                if ($run === null) {
                    continue;
                }
                $results[] = array_merge(['runner_url' => $runnerUrl, 'agent_id' => $agentId], $run);
            }
        }

        return $results;
    }

    /**
     * @return list<int>
     */
    private function extractMentionedUserIds(string $text): array
    {
        $userIds = [];

        preg_match_all('/data-tagged-user-id=["\'](\d+)["\']/i', $text, $tagMatches);
        foreach ($tagMatches[1] ?? [] as $rawId) {
            $userIds[] = (int) $rawId;
        }

        preg_match_all('/@([\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,})/', $text, $emailMatches);
        foreach (array_unique($emailMatches[1] ?? []) as $email) {
            $runner = $this->config->runnerForEmail($email);
            if ($runner === null) {
                continue;
            }
            $userIds[] = (int) ($runner['leantime_user_id'] ?? 0);
        }

        $unique = [];
        foreach ($userIds as $userId) {
            if ($userId > 0) {
                $unique[$userId] = true;
            }
        }

        return array_map('intval', array_keys($unique));
    }

    /**
     * @param array<string, mixed> $payload
     * @return list<array{runner_url: string, agent_id: string, run_id: string, status: string}>
     */
    private function notifyHandoff(array $payload, int $ticketId, int $newAssigneeId): array
    {
        $previousId = (int) ($payload['previousAssigneeUserId'] ?? 0);
        if ($previousId <= 0 || $previousId === $newAssigneeId) {
            return [];
        }

        $previousRunner = $this->config->runnerForUserId($previousId);
        if ($previousRunner === null) {
            return [];
        }

        $runnerUrl = trim((string) ($previousRunner['runner_url'] ?? ''));
        if ($runnerUrl === '') {
            return [];
        }

        $agentId = $this->sessions->getAgentId($ticketId);
        if ($agentId === null) {
            return [];
        }

        $prompt = $this->config->promptFor('handoff');
        $prompt .= "\n" . $this->delegationLine(
            (string) $previousId,
            (string) $newAssigneeId,
            'handoff'
        );
        $prompt .= "\n" . $this->ticketScopeInstruction($ticketId);
        $run = $this->runner->prompt($runnerUrl, $agentId, $prompt, 'handoff', $ticketId, $this->config->budget());
        if ($run === null) {
            return [];
        }

        return [array_merge(['runner_url' => $runnerUrl, 'agent_id' => $agentId], $run)];
    }
}
