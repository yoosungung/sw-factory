<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

use DateTimeInterface;

/**
 * Minimal 5-field cron matcher (minute hour dom month dow). Values are UTC wall-clock.
 */
final class ScheduleCron
{
    public static function isDue(string $expression, DateTimeInterface $now): bool
    {
        $parts = preg_split('/\s+/', trim($expression)) ?: [];
        if (count($parts) !== 5) {
            return false;
        }

        [$minute, $hour, $dom, $month, $dow] = $parts;

        return self::fieldMatches($minute, (int) $now->format('i'), 0, 59)
            && self::fieldMatches($hour, (int) $now->format('G'), 0, 23)
            && self::fieldMatches($dom, (int) $now->format('j'), 1, 31)
            && self::fieldMatches($month, (int) $now->format('n'), 1, 12)
            && self::dowMatches($dow, (int) $now->format('w'));
    }

    private static function dowMatches(string $field, int $dow): bool
    {
        // Cron often allows 7 as Sunday; normalize to 0.
        if ($field === '*') {
            return true;
        }

        $normalized = [];
        foreach (self::expandField($field, 0, 7) as $value) {
            $normalized[$value === 7 ? 0 : $value] = true;
        }

        return isset($normalized[$dow]);
    }

    private static function fieldMatches(string $field, int $value, int $min, int $max): bool
    {
        if ($field === '*') {
            return true;
        }

        return in_array($value, self::expandField($field, $min, $max), true);
    }

    /** @return list<int> */
    private static function expandField(string $field, int $min, int $max): array
    {
        $values = [];
        foreach (explode(',', $field) as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }

            $step = 1;
            if (str_contains($part, '/')) {
                [$part, $stepRaw] = explode('/', $part, 2);
                $step = max(1, (int) $stepRaw);
            }

            if ($part === '*') {
                for ($i = $min; $i <= $max; $i += $step) {
                    $values[] = $i;
                }
                continue;
            }

            if (str_contains($part, '-')) {
                [$startRaw, $endRaw] = explode('-', $part, 2);
                $start = (int) $startRaw;
                $end = (int) $endRaw;
                for ($i = $start; $i <= $end; $i += $step) {
                    if ($i >= $min && $i <= $max) {
                        $values[] = $i;
                    }
                }
                continue;
            }

            $n = (int) $part;
            if ($n >= $min && $n <= $max && ($step === 1 || ($n - $min) % $step === 0)) {
                $values[] = $n;
            }
        }

        return array_values(array_unique($values));
    }
}
