<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Resolves assignee/status via Leantime Tickets service (runtime only).
 */
final class LeantimeTicketLookup implements TicketLookup
{
    public function find(int $ticketId): ?array
    {
        if ($ticketId <= 0 || ! function_exists('app')) {
            return null;
        }

        try {
            $svc = app()->make(\Leantime\Domain\Tickets\Services\Tickets::class);
            $ticket = $svc->getTicket($ticketId);
            if ($ticket === false || $ticket === null) {
                return null;
            }

            return [
                'ticketId' => (int) ($ticket->id ?? $ticketId),
                'assigneeUserId' => (int) ($ticket->editorId ?? 0),
                'status' => (int) ($ticket->status ?? 0),
                'actorUserId' => (int) (session('userdata.id') ?? 0),
            ];
        } catch (\Throwable) {
            return null;
        }
    }
}
