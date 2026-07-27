<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * No-op lookup for unit tests — payload already carries fields.
 */
final class NullTicketLookup implements TicketLookup
{
    public function find(int $ticketId): ?array
    {
        return null;
    }
}
