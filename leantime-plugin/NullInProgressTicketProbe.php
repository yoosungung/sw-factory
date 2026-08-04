<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** Test/default: no active-flow tickets. */
final class NullInProgressTicketProbe implements InProgressTicketProbe
{
    public function hasInProgress(): bool
    {
        return false;
    }

    public function hasFlowActive(): bool
    {
        return false;
    }
}
