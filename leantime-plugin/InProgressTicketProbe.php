<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

interface InProgressTicketProbe
{
    /** True when any top-level or subtask ticket has status=4 (In Progress). */
    public function hasInProgress(): bool;

    /**
     * True when any ticket/subtask is on the dual-loop active flow:
     * In Progress(4), Review(10), Deploying Test(11), QA(12), Deploying Prod(13)
     * using factory default status ids (ARCHITECTURE §2.6 / settings.status_board).
     */
    public function hasFlowActive(): bool;
}
