<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

interface RunnerReadyProbe
{
    public function isReady(string $runnerUrl): bool;
}
