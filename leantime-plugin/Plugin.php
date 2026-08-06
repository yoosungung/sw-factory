<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

final class Plugin
{
    public static function bridgePath(): string
    {
        return __DIR__ . '/bridge.json';
    }

    public static function dbPath(): string
    {
        $env = getenv('CURSORBRIDGE_DB');
        if (is_string($env) && $env !== '') {
            return $env;
        }

        return __DIR__ . '/data/cursorbridge.sqlite';
    }

    public static function createDefault(): self
    {
        $sessions = SessionStore::fromPath(self::dbPath());
        $config = BridgeConfig::fromFile(self::bridgePath());
        $runner = new ResilientRunnerClient(
            new DelegatingRunnerClient(
                $config,
                RunnerClient::fromCurl(),
                OpenAIRunnerClient::fromCurl()
            ),
            $sessions
        );

        return new self(
            $config,
            $sessions,
            $runner,
            new LeantimeTicketLookup(),
            new LeantimeCommentLookup(),
            new LeantimeTicketCommentPoster()
        );
    }

    private BridgeConfig $config;
    private SessionStore $sessions;
    private ResilientRunnerClient $runner;
    private TicketLookup $tickets;
    private CommentLookup $comments;
    private TicketCommentPoster $ticketComments;

    public function __construct(
        BridgeConfig $config,
        SessionStore $sessions,
        ResilientRunnerClient $runner,
        ?TicketLookup $tickets = null,
        ?CommentLookup $comments = null,
        ?TicketCommentPoster $ticketComments = null
    ) {
        $this->config = $config;
        $this->sessions = $sessions;
        $this->runner = $runner;
        $this->tickets = $tickets ?? new NullTicketLookup();
        $this->comments = $comments ?? new NullCommentLookup();
        $this->ticketComments = $ticketComments ?? new NullTicketCommentPoster();
    }

    public function listener(): Listener
    {
        return new Listener(
            new Router(
                $this->config,
                $this->sessions,
                $this->runner,
                $this->tickets,
                $this->ticketComments
            ),
            $this->comments
        );
    }

    public function flushRetries(): int
    {
        return $this->runner->flushRetries();
    }

    public function tickSchedules(): int
    {
        return (new ScheduleTicker(
            $this->config,
            $this->sessions,
            $this->runner,
            new DefaultScheduleGates(new LeantimeInProgressTicketProbe())
        ))->tick();
    }

    public function tickReadyCatchup(): int
    {
        return (new ReadyCatchupTicker(
            $this->config,
            $this->sessions,
            $this->runner,
            HttpRunnerReadyProbe::fromCurl()
        ))->tick();
    }
}
