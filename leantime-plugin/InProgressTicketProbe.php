<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

interface InProgressTicketProbe
{
    /** True when any top-level or subtask ticket has status=4 (In Progress). */
    public function hasInProgress(): bool;
}
