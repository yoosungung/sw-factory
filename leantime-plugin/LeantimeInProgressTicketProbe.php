<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Runtime probe: any ticket/subtask with status=4 (In Progress).
 * Uses DB (not Tickets service) so CLI ticks work without a web session.
 * Fail-closed on missing DB / errors (skip schedule fire).
 */
final class LeantimeInProgressTicketProbe implements InProgressTicketProbe
{
    /** @var null|callable(): mixed */
    private $query;

    /**
     * @param  null|callable(): mixed  $query  injectable for unit tests
     */
    public function __construct(?callable $query = null)
    {
        $this->query = $query;
    }

    public function hasInProgress(): bool
    {
        try {
            $rows = ($this->query ?? self::defaultQuery(...))();
            return is_array($rows) && $rows !== [];
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @return list<object>
     */
    private static function defaultQuery(): array
    {
        if (! class_exists(\Illuminate\Support\Facades\DB::class)) {
            return [];
        }

        /** @var list<object> $rows */
        $rows = \Illuminate\Support\Facades\DB::select(
            'SELECT 1 AS ok FROM zp_tickets WHERE status = 4 LIMIT 1'
        );

        return $rows;
    }
}
