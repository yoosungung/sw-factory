<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\BridgeConfig;
use Leantime\Plugins\CursorBridge\Listener;
use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\Router;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class ListenerHooksTest extends TestCase
{
    public function testHookPatternsAreLowercaseLegacy(): void
    {
        $patterns = Listener::hookPatterns();
        $this->assertContains(
            'leantime.domain.tickets.services.tickets.*.ticket_created',
            $patterns
        );
        $this->assertContains(
            'leantime.domain.projects.services.projects.notifyProjectUsers.notifyProjectUsers',
            $patterns
        );
    }

    public function testParsesTicketIdFromNotifyUrl(): void
    {
        $this->assertSame(
            42,
            Listener::ticketIdFromNotifyUrl('https://leantime.k8s-test/#/tickets/showTicket/42?projectId=1')
        );
        $this->assertSame(0, Listener::ticketIdFromNotifyUrl('https://example.com/other'));
    }

    public function testNotifyIgnoresNonCommentModules(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $sessions = SessionStore::inMemory();
        $inner = new RunnerClient(
            static fn () => ['agent_id' => 'x'],
            static function (): void {
            }
        );
        $listener = new Listener(
            new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions))
        );

        $this->assertSame([], $listener->onNotifyProjectUsers([
            'module' => 'tickets',
            'moduleId' => 1,
            'url' => 'https://x/#/tickets/showTicket/9',
            'message' => 'updated',
        ]));
    }

    public function testNotifyUsesRawCommentTextForHtmlMentionRouting(): void
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
        $comments = new class implements \Leantime\Plugins\CursorBridge\CommentLookup {
            public function textForId(int $commentId): ?string
            {
                if ($commentId !== 14) {
                    return null;
                }

                return '<a class="tiptap-mention" data-tagged-user-id="99">@reviewer</a> please check';
            }
        };
        $tickets = new class implements \Leantime\Plugins\CursorBridge\TicketLookup {
            public function find(int $ticketId): ?array
            {
                return [
                    'ticketId' => $ticketId,
                    'assigneeUserId' => 6,
                    'status' => 3,
                    'actorUserId' => 1,
                ];
            }
        };
        $listener = new Listener(
            new Router($config, $sessions, new ResilientRunnerClient($inner, $sessions), $tickets),
            $comments
        );

        $listener->onNotifyProjectUsers(LeantimeEventFixtures::commentNotifyOnTicket167());

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
        $this->assertStringContainsString('167', (string) $mentionPost['prompt']);
    }
}
