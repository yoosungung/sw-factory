<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

interface ScheduleGates
{
    /**
     * @param list<string> $gates empty = allow (gates omitted)
     */
    public function passes(array $gates): bool;
}
