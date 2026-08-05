<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Posts ticket comments (runtime Leantime or test double).
 */
interface TicketCommentPoster
{
    public function post(int $ticketId, string $html, ?int $authorUserId = null): bool;

    /** True if any comment on the ticket already contains $needle. */
    public function hasContaining(int $ticketId, string $needle): bool;
}
