<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\BridgeConfig;
use Leantime\Plugins\CursorBridge\DelegatingRunnerClient;
use Leantime\Plugins\CursorBridge\NullTicketLookup;
use Leantime\Plugins\CursorBridge\OpenAIRunnerClient;
use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\Router;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\SessionStore;
use Leantime\Plugins\CursorBridge\TicketLookup;
use PHPUnit\Framework\TestCase;

final class RouterTest extends TestCase
{
    /** @var list<array<string, mixed>> */
    private array $posts = [];

    protected function setUp(): void
    {
        $this->posts = [];
    }

    private function pathUserId(): int
    {
        return 6;
    }

    private function router(?TicketLookup $lookup = null): Router
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        $inner = new RunnerClient(
            function (string $url, array $body): array {
                $this->posts[] = ['url' => $url, 'body' => $body];
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-test-1'];
                }

                return ['run_id' => 'run-1', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $client = new ResilientRunnerClient($inner, $sessions);

        return new Router($config, $sessions, $client, $lookup ?? new NullTicketLookup());
    }

    public function testPromptIncludesActiveTicketScope(): void
    {
        $router = $this->router();
        $router->handle('ticket_created', [
            'ticketId' => 223,
            'assigneeUserId' => $this->pathUserId(),
            'actorUserId' => 99,
            'status' => 3,
            'headline' => 'Fix login',
        ]);

        $this->assertNotEmpty($this->posts);
        $prompt = (string) ($this->posts[0]['body']['prompt'] ?? '');
        $this->assertStringContainsString('Active ticket_id=223', $prompt);
        $this->assertStringContainsString('module_id=223', $prompt);
        $this->assertStringContainsString('Do not comment on other tickets', $prompt);
        $this->assertStringContainsString('Context summary', $prompt);
        $this->assertStringContainsString('title=Fix login', $prompt);
        $this->assertStringContainsString('Success checks', $prompt);
        $this->assertNotEmpty($this->posts[0]['body']['success_checks'] ?? []);
        $this->assertSame(3, $this->posts[0]['body']['success_retry']['max_attempts'] ?? null);
    }

    public function testAssigneeChangedIncludesDelegationLineage(): void
    {
        $sessions = SessionStore::inMemory();
        $sessions->upsert(50, 'agent-test-1', $this->pathUserId());
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $inner = new RunnerClient(
            function (string $url, array $body): array {
                $this->posts[] = ['url' => $url, 'body' => $body];
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-test-1'];
                }
                if (str_ends_with($url, '/v1/responses')) {
                    return ['_accepted' => true];
                }

                return ['run_id' => 'run-1', 'status' => 'accepted'];
            },
            static function (string $url): void {
            }
        );
        $openai = new OpenAIRunnerClient(
            function (string $url, array $body): array {
                $this->posts[] = ['url' => $url, 'body' => $body];

                return ['_accepted' => true];
            },
            'test-key'
        );
        $router = new Router(
            $config,
            $sessions,
            new ResilientRunnerClient(
                new DelegatingRunnerClient($config, $inner, $openai),
                $sessions
            )
        );
        $router->handle('assignee_changed', [
            'ticketId' => 50,
            'assigneeUserId' => 4,
            'previousAssigneeUserId' => $this->pathUserId(),
            'actorUserId' => 99,
            'status' => 4,
        ]);

        $prompts = array_map(
            static function (array $post): string {
                $body = $post['body'] ?? [];

                return (string) ($body['prompt'] ?? $body['input'] ?? '');
            },
            $this->posts
        );
        $joined = implode("\n", $prompts);
        $this->assertStringContainsString('delegated_from=', $joined);
        $this->assertStringContainsString('delegated_to=', $joined);
        $this->assertStringContainsString('purpose=handoff', $joined);
    }

    public function testCreatesSessionOnTicketCreated(): void
    {
        $router = $this->router();
        $results = $router->handle('ticket_created', [
            'ticketId' => 100,
            'assigneeUserId' => $this->pathUserId(),
            'actorUserId' => 99,
            'status' => 3,
        ]);

        $this->assertCount(1, $results);
        $this->assertSame('agent-test-1', $results[0]['agent_id']);
        $this->assertStringEndsWith('/sessions', $this->posts[0]['url']);
        $this->assertStringContainsString('cursor-agent-path', $this->posts[0]['url']);
    }

    public function testEnrichesAssigneeFromTicketLookup(): void
    {
        $lookup = new class ($this->pathUserId()) implements TicketLookup {
            public function __construct(private int $uid)
            {
            }

            public function find(int $ticketId): ?array
            {
                return [
                    'ticketId' => $ticketId,
                    'assigneeUserId' => $this->uid,
                    'status' => 3,
                    'actorUserId' => 99,
                ];
            }
        };

        $router = $this->router($lookup);
        $results = $router->handle('ticket_created', ['ticketId' => 55]);

        $this->assertCount(1, $results);
        $this->assertStringContainsString('cursor-agent-path', $this->posts[0]['url']);
    }

    public function testIgnoresSelfEchoWhenAssigneeAgentActsOnOwnTicket(): void
    {
        $router = $this->router();
        $results = $router->handle('ticket_updated', [
            'ticketId' => 100,
            'assigneeUserId' => $this->pathUserId(),
            'actorUserId' => $this->pathUserId(),
            'status' => 3,
        ]);

        $this->assertSame([], $results);
        $this->assertSame([], $this->posts);
    }

    public function testSkipsHumanAssigneeWithoutRunner(): void
    {
        $router = $this->router();
        $results = $router->handle('ticket_created', [
            'ticketId' => 101,
            'assigneeUserId' => 1,
            'actorUserId' => 99,
            'status' => 3,
        ]);

        $this->assertSame([], $results);
        $this->assertSame([], $this->posts);
    }

    public function testDispatchesWhenDifferentAgentComments(): void
    {
        $data = json_decode((string) file_get_contents(dirname(__DIR__) . '/bridge.json'), true);
        $data['agents'][] = [
            'leantime_user_id' => 99,
            'email' => 'reviewer@didim.io',
            'runner_url' => 'http://runner-2:8080',
            'git_repo_url' => 'https://github.com/didim/reviewer.git',
            'persona' => 'reviewer',
            'type' => 'sessions',
        ];
        $config = new BridgeConfig($data);
        $sessions = SessionStore::inMemory();
        $posts = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = $url;
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-path'];
                }

                return ['run_id' => 'run-2', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions));

        $results = $router->handle('comment_added', [
            'ticketId' => 101,
            'assigneeUserId' => 6,
            'actorUserId' => 99,
            'commentText' => 'Please review this change.',
            'status' => 3,
        ]);

        $this->assertCount(1, $results);
        $this->assertNotEmpty($posts);
    }

    public function testRunnerFailureDoesNotThrow(): void
    {
        $sessions = SessionStore::inMemory();
        $sessions->upsert(167, 'agent-stale', $this->pathUserId());
        $inner = new RunnerClient(
            static function (string $url, array $body): array {
                throw new \RuntimeException('Runner returned invalid JSON');
            },
            static function (string $url): void {
            }
        );
        $router = new Router(
            BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json'),
            $sessions,
            new ResilientRunnerClient($inner, $sessions)
        );

        $results = $router->handle('ticket_updated', [
            'ticketId' => 167,
            'assigneeUserId' => $this->pathUserId(),
            'actorUserId' => 1,
            'status' => 4,
        ]);

        $this->assertCount(1, $results);
        $this->assertSame('deferred', $results[0]['status']);
        $this->assertCount(1, $sessions->pendingRetries());
    }

    public function testMentionUsesBridgePrompt(): void
    {
        $data = json_decode((string) file_get_contents(dirname(__DIR__) . '/bridge.json'), true);
        $data['agents'][] = [
            'leantime_user_id' => 99,
            'email' => 'reviewer@didim.io',
            'runner_url' => 'http://runner-2:8080',
            'git_repo_url' => 'https://github.com/didim/reviewer.git',
            'persona' => 'reviewer',
            'type' => 'sessions',
        ];
        $config = new BridgeConfig($data);
        $sessions = SessionStore::inMemory();
        $posts = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = $body;
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-reviewer'];
                }

                return ['run_id' => 'run-mention', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions));

        $router->handle('comment_added', [
            'ticketId' => 301,
            'assigneeUserId' => 6,
            'actorUserId' => 1,
            'commentText' => 'Hey @reviewer@didim.io please check',
            'status' => 3,
        ]);

        $mentionPost = null;
        foreach ($posts as $body) {
            if (isset($body['event']) && $body['event'] === 'mention') {
                $mentionPost = $body;
                break;
            }
            if (str_contains((string) ($body['prompt'] ?? ''), '@mentioned')) {
                $mentionPost = $body;
                break;
            }
        }
        $this->assertNotNull($mentionPost);
        $this->assertStringContainsString('301', (string) $mentionPost['prompt']);
        $this->assertStringContainsString('@mentioned', (string) $mentionPost['prompt']);
        $this->assertStringContainsString('delegated_from=1', (string) $mentionPost['prompt']);
        $this->assertStringContainsString('delegated_to=99', (string) $mentionPost['prompt']);
        $this->assertStringContainsString('purpose=mention', (string) $mentionPost['prompt']);
    }

    public function testMentionRoutesTiptapHtmlTaggedUserId(): void
    {
        $data = json_decode((string) file_get_contents(dirname(__DIR__) . '/bridge.json'), true);
        $data['agents'][] = [
            'leantime_user_id' => 99,
            'email' => 'reviewer@didim.io',
            'runner_url' => 'http://runner-2:8080',
            'git_repo_url' => 'https://github.com/didim/reviewer.git',
            'persona' => 'reviewer',
            'type' => 'sessions',
        ];
        $config = new BridgeConfig($data);
        $sessions = SessionStore::inMemory();
        $posts = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = $body;
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-reviewer'];
                }

                return ['run_id' => 'run-mention', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions));

        $router->handle('comment_added', [
            'ticketId' => 302,
            'assigneeUserId' => 6,
            'actorUserId' => 1,
            'commentText' => 'Hey <a class="tiptap-mention" data-tagged-user-id="99">@reviewer</a> please check',
            'status' => 3,
        ]);

        $mentionPost = null;
        foreach ($posts as $body) {
            if (isset($body['event']) && $body['event'] === 'mention') {
                $mentionPost = $body;
                break;
            }
            if (str_contains((string) ($body['prompt'] ?? ''), '@mentioned')) {
                $mentionPost = $body;
                break;
            }
        }
        $this->assertNotNull($mentionPost);
        $this->assertStringContainsString('302', (string) $mentionPost['prompt']);
    }

    public function testMentionSkipsPrimaryAssigneeEvenWithHtmlTag(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        $posts = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = $body;
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-path'];
                }

                return ['run_id' => 'run-mention', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions));

        $router->handle('comment_added', [
            'ticketId' => 303,
            'assigneeUserId' => 6,
            'actorUserId' => 1,
            'commentText' => '<a class="tiptap-mention" data-tagged-user-id="6">@path</a> only you',
            'status' => 3,
        ]);

        $mentionPosts = array_values(array_filter(
            $posts,
            static fn (array $body): bool => ($body['event'] ?? '') === 'mention'
        ));
        $this->assertSame([], $mentionPosts);
    }

    public function testMentionUsesEphemeralSessionWhenAssigneeBotDiffers(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        $sessions->upsert(400, 'agent-path', 6);

        $posts = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = ['url' => $url, 'body' => $body];
                if (str_ends_with($url, '/sessions')) {
                    return ['agent_id' => 'agent-asky-ephemeral'];
                }

                return ['run_id' => 'run-mention', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions));

        $router->handle('comment_added', [
            'ticketId' => 400,
            'assigneeUserId' => 6,
            'actorUserId' => 1,
            'commentText' => '<a class="tiptap-mention" data-tagged-user-id="5">@asky</a> help',
            'status' => 3,
        ]);

        $askyCreate = null;
        foreach ($posts as $post) {
            if (str_contains($post['url'], 'cursor-agent-asky') && str_ends_with($post['url'], '/sessions')) {
                $askyCreate = $post;
                break;
            }
        }
        $this->assertNotNull($askyCreate);
        $this->assertSame('agent-path', $sessions->getAgentId(400));
        $this->assertSame(6, $sessions->getAssigneeUserId(400));
    }

    public function testAssigneeHandoffNotifiesPreviousBotRunner(): void
    {
        $data = json_decode((string) file_get_contents(dirname(__DIR__) . '/bridge.json'), true);
        $config = new BridgeConfig($data);
        $sessions = SessionStore::inMemory();
        $sessions->upsert(200, 'agent-existing', 6);

        $posts = [];
        $inner = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = ['url' => $url, 'body' => $body];

                return ['run_id' => 'run-handoff', 'status' => 'completed'];
            },
            static function (string $url): void {
            }
        );
        $router = new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions));

        $results = $router->handle('assignee_changed', [
            'ticketId' => 200,
            'assigneeUserId' => 5,
            'previousAssigneeUserId' => 6,
            'actorUserId' => 1,
            'status' => 3,
        ]);

        $this->assertNotEmpty($results);
        $this->assertTrue(
            (bool) array_filter($posts, static fn ($p) => str_contains($p['url'], 'cursor-agent-path'))
        );
        $handoffPost = null;
        foreach ($posts as $post) {
            if (($post['body']['event'] ?? '') === 'handoff') {
                $handoffPost = $post['body'];
                break;
            }
        }
        $this->assertNotNull($handoffPost);
        $this->assertStringContainsString($config->promptFor('handoff'), $handoffPost['prompt']);
        $this->assertStringContainsString('Active ticket_id=200', $handoffPost['prompt']);
        $this->assertStringContainsString('module_id=200', $handoffPost['prompt']);
    }
}
