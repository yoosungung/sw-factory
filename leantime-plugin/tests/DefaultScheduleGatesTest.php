<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\DefaultScheduleGates;
use Leantime\Plugins\CursorBridge\InProgressTicketProbe;
use PHPUnit\Framework\TestCase;

final class DefaultScheduleGatesTest extends TestCase
{
    public function testEmptyGatesAlwaysPass(): void
    {
        $probe = new class implements InProgressTicketProbe {
            public bool $called = false;

            public function hasInProgress(): bool
            {
                $this->called = true;

                return false;
            }

            public function hasFlowActive(): bool
            {
                $this->called = true;

                return false;
            }
        };
        $gates = new DefaultScheduleGates($probe);
        $this->assertTrue($gates->passes([]));
        $this->assertFalse($probe->called);
    }

    public function testInProgressRequiresProbeTrue(): void
    {
        $falseProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return false;
            }

            public function hasFlowActive(): bool
            {
                return false;
            }
        };
        $trueProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return true;
            }

            public function hasFlowActive(): bool
            {
                return false;
            }
        };

        $this->assertFalse((new DefaultScheduleGates($falseProbe))->passes(['in_progress']));
        $this->assertTrue((new DefaultScheduleGates($trueProbe))->passes(['in_progress']));
    }

    public function testFlowActiveRequiresProbeTrue(): void
    {
        $falseProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return false;
            }

            public function hasFlowActive(): bool
            {
                return false;
            }
        };
        $trueProbe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return false;
            }

            public function hasFlowActive(): bool
            {
                return true;
            }
        };

        $this->assertFalse((new DefaultScheduleGates($falseProbe))->passes(['flow_active']));
        $this->assertTrue((new DefaultScheduleGates($trueProbe))->passes(['flow_active']));
    }

    public function testUnknownGateFailsClosed(): void
    {
        $probe = new class implements InProgressTicketProbe {
            public function hasInProgress(): bool
            {
                return true;
            }

            public function hasFlowActive(): bool
            {
                return true;
            }
        };
        $this->assertFalse((new DefaultScheduleGates($probe))->passes(['in_progress', 'later']));
        $this->assertFalse((new DefaultScheduleGates($probe))->passes(['flow_active', 'later']));
    }
}
