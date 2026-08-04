<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Run CursorBridge runner I/O after the HTTP response so ticket/comment
 * saves are not blocked on agent-runner latency.
 */
final class DeferredDispatch
{
    /** @var list<callable(): void> */
    private static array $jobs = [];

    private static bool $registered = false;

    /** @var null|callable(): void */
    private static $finisher = null;

    public static function schedule(callable $job): void
    {
        self::$jobs[] = $job;
        if (self::$registered) {
            return;
        }
        self::$registered = true;
        register_shutdown_function(static function (): void {
            self::flush();
        });
    }

    public static function flush(): void
    {
        $jobs = self::$jobs;
        self::$jobs = [];
        self::$registered = false;

        if ($jobs === []) {
            return;
        }

        if (function_exists('ignore_user_abort')) {
            ignore_user_abort(true);
        }

        $finish = self::$finisher ?? static function (): void {
            if (function_exists('fastcgi_finish_request')) {
                @fastcgi_finish_request();
            }
        };
        $finish();

        foreach ($jobs as $job) {
            try {
                $job();
            } catch (\Throwable) {
                // Never break the originating Leantime request lifecycle.
            }
        }
    }

    public static function pendingCount(): int
    {
        return count(self::$jobs);
    }

    /** @param null|callable(): void $finisher */
    public static function setFinisherForTests(?callable $finisher): void
    {
        self::$finisher = $finisher;
    }

    public static function resetForTests(): void
    {
        self::$jobs = [];
        self::$registered = false;
        self::$finisher = null;
    }
}
