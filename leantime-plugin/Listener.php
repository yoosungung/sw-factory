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
        $router = $this->router;
        DeferredDispatch::schedule(static function () use ($router, $payload): void {
            $router->handle('ticket_created', $payload);
        });

        return [];
    }

    /** @param array<string, mixed> $payload */
    public function onTicketUpdated(array $payload): array
    {
        $event = isset($payload['previousAssigneeUserId']) ? 'assignee_changed' : 'ticket_updated';
        $router = $this->router;
        DeferredDispatch::schedule(static function () use ($router, $event, $payload): void {
            $router->handle($event, $payload);
        });

        return [];
    }

    /** @param array<string, mixed> $payload */
    public function onTicketDeleted(array $payload): void
    {
        $router = $this->router;
        DeferredDispatch::schedule(static function () use ($router, $payload): void {
            $router->handleTicketDeleted($payload);
        });
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

        $router = $this->router;
        $body = [
            'ticketId' => $ticketId,
            'commentText' => $text,
            'text' => $text,
        ];
        DeferredDispatch::schedule(static function () use ($router, $body): void {
            $router->handle('comment_added', $body);
        });

        return [];
    }

    public static function ticketIdFromNotifyUrl(string $url): int
    {
        if (preg_match('~(?:#/)?tickets/showTicket/(\d+)~', $url, $m)) {
            return (int) $m[1];
        }

        return 0;
    }
}
