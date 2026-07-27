<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class DefaultScheduleGates implements ScheduleGates
{
    private InProgressTicketProbe $inProgress;

    public function __construct(InProgressTicketProbe $inProgress)
    {
        $this->inProgress = $inProgress;
    }

    public function passes(array $gates): bool
    {
        if ($gates === []) {
            return true;
        }

        foreach ($gates as $gate) {
            if ($gate === 'in_progress') {
                if (!$this->inProgress->hasInProgress()) {
                    return false;
                }
                continue;
            }

            // Unknown gate: fail-closed (do not fire).
            return false;
        }

        return true;
    }
}
