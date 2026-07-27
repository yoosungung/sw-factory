<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class Listener
{
    /** Lowercase: Leantime 3.9 legacyHooks are case-sensitive. */
    public const HOOK_TICKET_CREATED = 'leantime.domain.tickets.services.tickets.*.ticket_created';
    public const HOOK_TICKET_UPDATED = 'leantime.domain.tickets.services.tickets.*.ticket_updated';
    public const HOOK_TICKET_DELETED = 'leantime.domain.tickets.services.tickets.*.ticket_deleted';
    /** Comments have no domain event — use project notification fan-out. */
    public const HOOK_NOTIFY_PROJECT_USERS = 'leantime.domain.projects.services.projects.notifyProjectUsers.notifyProjectUsers';

    private Router $router;
    private CommentLookup $comments;

    public function __construct(Router $router, ?CommentLookup $comments = null)
    {
        $this->router = $router;
        $this->comments = $comments ?? new NullCommentLookup();
    }

    /** @return list<string> */
    public static function hookPatterns(): array
    {
        return [
            self::HOOK_TICKET_CREATED,
            self::HOOK_TICKET_UPDATED,
            self::HOOK_TICKET_DELETED,
            self::HOOK_NOTIFY_PROJECT_USERS,
        ];
    }

    /** @param array<string, mixed> $payload */
    public function onTicketCreated(array $payload): array
    {
        return $this->router->handle('ticket_created', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function onTicketUpdated(array $payload): array
    {
        $event = isset($payload['previousAssigneeUserId']) ? 'assignee_changed' : 'ticket_updated';

        return $this->router->handle($event, $payload);
    }

    /** @param array<string, mixed> $payload */
    public function onTicketDeleted(array $payload): void
    {
        $this->router->handleTicketDeleted($payload);
    }

    /**
     * notifyProjectUsers — comment adds use module=comments, moduleId=comment id;
     * ticket id is parsed from url when present.
     *
     * @param array<string, mixed> $payload
     */
    public function onNotifyProjectUsers(array $payload): array
    {
        if (($payload['module'] ?? '') !== 'comments') {
            return [];
        }

        $ticketId = self::ticketIdFromNotifyUrl((string) ($payload['url'] ?? ''));
        if ($ticketId <= 0) {
            return [];
        }

        $text = (string) ($payload['message'] ?? '');
        $commentId = (int) ($payload['moduleId'] ?? 0);
        $rawText = $this->comments->textForId($commentId);
        if ($rawText !== null) {
            $text = $rawText;
        }

        return $this->router->handle('comment_added', [
            'ticketId' => $ticketId,
            'commentText' => $text,
            'text' => $text,
        ]);
    }

    public static function ticketIdFromNotifyUrl(string $url): int
    {
        if (preg_match('~(?:#/)?tickets/showTicket/(\d+)~', $url, $m)) {
            return (int) $m[1];
        }

        return 0;
    }
}
