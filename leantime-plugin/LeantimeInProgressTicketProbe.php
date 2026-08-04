<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Runtime probe for schedule gates via DB (not Tickets service) so CLI ticks
 * work without a web session. Fail-closed on missing DB / errors.
 *
 * Status ids match factory defaults (ARCHITECTURE §2.6 / settings.status_board).
 */
final class LeantimeInProgressTicketProbe implements InProgressTicketProbe
{
    /** @var list<int> */
    public const FLOW_ACTIVE_STATUSES = [4, 10, 11, 12, 13];

    /** @var null|callable(list<int>): mixed */
    private $query;

    /**
     * @param  null|callable(list<int>): mixed  $query  injectable for unit tests
     */
    public function __construct(?callable $query = null)
    {
        $this->query = $query;
    }

    public function hasInProgress(): bool
    {
        return $this->exists([4]);
    }

    public function hasFlowActive(): bool
    {
        return $this->exists(self::FLOW_ACTIVE_STATUSES);
    }

    /**
     * @param  list<int>  $statuses
     */
    private function exists(array $statuses): bool
    {
        if ($statuses === []) {
            return false;
        }

        try {
            $rows = ($this->query ?? self::defaultQuery(...))($statuses);

            return is_array($rows) && $rows !== [];
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @param  list<int>  $statuses
     * @return list<object>
     */
    private static function defaultQuery(array $statuses): array
    {
        if (! class_exists(\Illuminate\Support\Facades\DB::class)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($statuses), '?'));

        /** @var list<object> $rows */
        $rows = \Illuminate\Support\Facades\DB::select(
            "SELECT 1 AS ok FROM zp_tickets WHERE status IN ($placeholders) LIMIT 1",
            $statuses
        );

        return $rows;
    }
}
