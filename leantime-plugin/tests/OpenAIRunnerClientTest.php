<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\BridgeConfig;
use Leantime\Plugins\CursorBridge\DelegatingRunnerClient;
use Leantime\Plugins\CursorBridge\OpenAIRunnerClient;
use Leantime\Plugins\CursorBridge\ResilientRunnerClient;
use Leantime\Plugins\CursorBridge\Router;
use Leantime\Plugins\CursorBridge\RunnerClient;
use Leantime\Plugins\CursorBridge\SessionStore;
use PHPUnit\Framework\TestCase;

final class OpenAIRunnerClientTest extends TestCase
{
    public function testConversationForTicket(): void
    {
        $this->assertSame('leantime-ticket-42', OpenAIRunnerClient::conversationForTicket(42));
    }

    public function testCreateSessionPostsResponsesWithConversation(): void
    {
        $posts = [];
        $client = new OpenAIRunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = ['url' => $url, 'body' => $body];

                return ['_accepted' => true];
            },
            'test-key'
        );

        $result = $client->createSession(
            'http://hermes-master.ai-agents.svc:8642',
            'hello candy',
            99
        );

        $this->assertSame(['agent_id' => 'leantime-ticket-99'], $result);
        $this->assertCount(1, $posts);
        $this->assertSame(
            'http://hermes-master.ai-agents.svc:8642/v1/responses',
            $posts[0]['url']
        );
        $this->assertSame('hello candy', $posts[0]['body']['input']);
        $this->assertSame('leantime-ticket-99', $posts[0]['body']['conversation']);
        $this->assertTrue($posts[0]['body']['store']);
    }

    public function testPromptReusesAgentIdAsConversation(): void
    {
        $posts = [];
        $client = new OpenAIRunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = $body;

                return ['_accepted' => true];
            },
            'test-key'
        );

        $run = $client->prompt(
            'http://hermes.example:8642',
            'leantime-ticket-7',
            'follow up',
            'comment_added',
            7
        );

        $this->assertSame('accepted', $run['status']);
        $this->assertSame('leantime-ticket-7', $posts[0]['conversation']);
        $this->assertSame('follow up', $posts[0]['input']);
    }

    public function testDeleteSessionIsNoOp(): void
    {
        $client = new OpenAIRunnerClient(
            static function (string $url, array $body): array {
                throw new \RuntimeException('should not post');
            },
            'test-key'
        );
        $client->deleteSession('http://hermes.example:8642', 'leantime-ticket-1');
        $this->assertTrue(true);
    }

    public function testDelegatingRoutesOpenAITypeAgent(): void
    {
        $posts = [];
        $config = new BridgeConfig([
            'debounce_ms' => 0,
            'prompts' => [
                'ticket_created' => 'Process ticket',
            ],
            'agents' => [
                [
                    'name' => 'external-pm',
                    'leantime_user_id' => 99,
                    'email' => 'external@example.com',
                    'runner_url' => 'http://hermes-master.ai-agents.svc:8642',
                    'type' => 'openai',
                    'persona' => 'external-pm',
                ],
            ],
        ]);
        $sessions = new RunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = ['dialect' => 'sessions', 'url' => $url, 'body' => $body];

                return ['agent_id' => 'agent-sessions'];
            },
            static function (string $url): void {
            }
        );
        $openai = new OpenAIRunnerClient(
            function (string $url, array $body) use (&$posts): array {
                $posts[] = ['dialect' => 'openai', 'url' => $url, 'body' => $body];

                return ['_accepted' => true];
            },
            'test-key'
        );
        $runner = new ResilientRunnerClient(
            new DelegatingRunnerClient($config, $sessions, $openai),
            SessionStore::inMemory()
        );
        $router = new Router($config, SessionStore::inMemory(), $runner);

        $results = $router->handle('ticket_created', [
            'ticketId' => 501,
            'assigneeUserId' => 99,
            'actorUserId' => 1,
            'status' => 3,
            'headline' => 'OpenAI dialect review',
        ]);

        $this->assertCount(1, $results);
        $this->assertSame('openai', $posts[0]['dialect']);
        $this->assertStringEndsWith('/v1/responses', $posts[0]['url']);
        $this->assertSame('leantime-ticket-501', $results[0]['agent_id']);
    }
}
