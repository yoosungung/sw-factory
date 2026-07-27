<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use DateTimeImmutable;
use DateTimeZone;
use Leantime\Plugins\CursorBridge\ScheduleCron;
use PHPUnit\Framework\TestCase;

final class ScheduleCronTest extends TestCase
{
    public function testMatchesWeekdayMorningUtc(): void
    {
        $now = new DateTimeImmutable('2026-07-13 09:00:00', new DateTimeZone('UTC')); // Monday
        $this->assertTrue(ScheduleCron::isDue('0 9 * * 1-5', $now));
        $this->assertFalse(ScheduleCron::isDue('0 10 * * 1-5', $now));
    }

    public function testMatchesStepAndList(): void
    {
        $now = new DateTimeImmutable('2026-07-11 00:00:00', new DateTimeZone('UTC')); // Saturday
        $this->assertTrue(ScheduleCron::isDue('*/15 * * * *', $now));
        $this->assertTrue(ScheduleCron::isDue('0 0 * * 0,6', $now));
        $this->assertFalse(ScheduleCron::isDue('0 0 * * 1-5', $now));
    }

    public function testRejectsInvalidExpression(): void
    {
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $this->assertFalse(ScheduleCron::isDue('0 9 * *', $now));
        $this->assertFalse(ScheduleCron::isDue('', $now));
    }
}
