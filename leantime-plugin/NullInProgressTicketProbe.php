<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** Test/default: no In Progress tickets. */
final class NullInProgressTicketProbe implements InProgressTicketProbe
{
    public function hasInProgress(): bool
    {
        return false;
    }
}
