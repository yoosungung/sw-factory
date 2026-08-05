<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** No-op poster for unit tests that do not exercise unassigned triage. */
final class NullTicketCommentPoster implements TicketCommentPoster
{
    public function post(int $ticketId, string $html): bool
    {
        return false;
    }

    public function hasContaining(int $ticketId, string $needle): bool
    {
        return false;
    }
}
