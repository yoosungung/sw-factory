<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Loads ticket fields that class-based TicketCreated/Updated events no longer carry.
 */
interface TicketLookup
{
    /**
     * @return array{ticketId?:int,assigneeUserId?:int,status?:int,actorUserId?:int}|null
     */
    public function find(int $ticketId): ?array;
}
