<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Runtime probe: any ticket/subtask with status=4 (In Progress).
 * Fail-closed on missing Leantime / errors (skip schedule fire).
 */
final class LeantimeInProgressTicketProbe implements InProgressTicketProbe
{
    public function hasInProgress(): bool
    {
        if (!function_exists('app')) {
            return false;
        }

        try {
            $svc = app()->make(\Leantime\Domain\Tickets\Services\Tickets::class);
            foreach ([['status' => 4], ['status' => '4'], ['statusType' => 'INPROGRESS']] as $criteria) {
                $tickets = $svc->getAll($criteria);
                if (!is_array($tickets) || $tickets === []) {
                    continue;
                }
                if ($criteria === ['statusType' => 'INPROGRESS']) {
                    return true;
                }
                foreach ($tickets as $ticket) {
                    $status = is_array($ticket)
                        ? ($ticket['status'] ?? null)
                        : ($ticket->status ?? null);
                    if ((int) $status === 4) {
                        return true;
                    }
                }
            }
        } catch (\Throwable) {
            return false;
        }

        return false;
    }
}
