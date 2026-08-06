<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class HttpRunnerReadyProbe implements RunnerReadyProbe
{
    /** @var callable(string): int */
    private $httpGetStatus;

    /**
     * @param callable(string): int $httpGetStatus returns HTTP status code (0 on transport failure)
     */
    public function __construct(callable $httpGetStatus)
    {
        $this->httpGetStatus = $httpGetStatus;
    }

    public static function fromCurl(): self
    {
        return new self(static function (string $url): int {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_NOBODY => false,
                CURLOPT_TIMEOUT => 2,
                CURLOPT_CONNECTTIMEOUT => 1,
            ]);
            $ok = curl_exec($ch);
            if ($ok === false) {
                return 0;
            }

            return (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        });
    }

    public function isReady(string $runnerUrl): bool
    {
        $base = rtrim($runnerUrl, '/');
        foreach (['/readyz', '/healthz'] as $path) {
            $status = ($this->httpGetStatus)($base . $path);
            if ($status >= 200 && $status < 300) {
                return true;
            }
        }

        return false;
    }
}
