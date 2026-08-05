<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** In-memory poster for Router unit tests. */
final class RecordingTicketCommentPoster implements TicketCommentPoster
{
    /** @var array<int, list<string>> */
    private array $byTicket = [];

    public function post(int $ticketId, string $html, ?int $authorUserId = null): bool
    {
        if ($ticketId <= 0 || $html === '') {
            return false;
        }
        $this->byTicket[$ticketId][] = $html;

        return true;
    }

    public function hasContaining(int $ticketId, string $needle): bool
    {
        foreach ($this->byTicket[$ticketId] ?? [] as $html) {
            if (str_contains($html, $needle)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    public function postsFor(int $ticketId): array
    {
        return $this->byTicket[$ticketId] ?? [];
    }
}
