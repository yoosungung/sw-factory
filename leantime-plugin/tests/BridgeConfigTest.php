<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\BridgeConfig;
use PHPUnit\Framework\TestCase;

final class BridgeConfigTest extends TestCase
{
    public function testLoadsBridgeJson(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $this->assertSame(3000, $config->debounceMs());
        $this->assertTrue($config->mentionRoutingEnabled());
        $this->assertNotEmpty($config->agents());
        $this->assertStringContainsString('ticket', $config->promptFor('ticket_created'));
        $this->assertStringContainsString(
            '42',
            $config->promptFor('mention', ['ticket_id' => '42'])
        );
        $this->assertStringContainsString('handoff', $config->promptFor('handoff'));
        $this->assertIsArray($config->schedules());
        $this->assertSame('path', (string) ($config->agentByName('path')['name'] ?? ''));
    }

    public function testResolvesBotRunnerByUserId(): void
    {
        $config = BridgeConfig::fromFile(dirname(__DIR__) . '/bridge.json');
        $agent = $config->runnerForUserId(6);
        $this->assertNotNull($agent);
        $this->assertTrue($config->isAgentAccount(6));
        $this->assertTrue($config->isAgentAccount(4));
        $candy = $config->runnerForUserId(4);
        $this->assertSame('sessions', $config->agentType($candy));
        $candyUrl = (string) ($candy['runner_url'] ?? '');
        $this->assertStringContainsString('cursor-agent-candy', $candyUrl);
        $this->assertStringContainsString('cursor-agent-path', (string) $agent['runner_url']);
        $this->assertFalse($config->isAgentAccount(1));
        $this->assertSame('', (string) ($config->runnerForUserId(1)['runner_url'] ?? ''));
        $this->assertSame('human', $config->agentType($config->runnerForUserId(1)));
        $this->assertSame('sessions', $config->typeForRunnerUrl($candyUrl));
        $this->assertSame('sessions', $config->typeForRunnerUrl('http://cursor-agent-path.leantime.svc:8080'));
        $openaiCfg = new BridgeConfig([
            'agents' => [
                [
                    'name' => 'external-pm',
                    'leantime_user_id' => 99,
                    'runner_url' => 'http://hermes-master.ai-agents.svc:8642',
                    'type' => 'openai',
                ],
            ],
        ]);
        $this->assertSame(
            'openai',
            $openaiCfg->typeForRunnerUrl('http://hermes-master.ai-agents.svc:8642')
        );
    }

    public function testFormatsSuccessChecksPrompt(): void
    {
        $config = new BridgeConfig([
            'success_checks' => ['Leave add_comment', '  ', 'Ship PR when Review-ready'],
            'schedules' => [
                [
                    'id' => 's1',
                    'cron' => '0 0 * * *',
                    'prompt' => 'x',
                    'success_checks' => ['Schedule-specific check'],
                ],
            ],
        ]);

        $this->assertSame(
            ['Leave add_comment', 'Ship PR when Review-ready'],
            $config->successChecks()
        );
        $this->assertSame(
            ['Schedule-specific check'],
            $config->successChecksForSchedule($config->schedules()[0])
        );
        $this->assertSame([], $config->gatesForSchedule($config->schedules()[0]));
        $this->assertSame(
            ['in_progress'],
            $config->gatesForSchedule(['gates' => ['in_progress', '  ']])
        );
        $formatted = $config->formatSuccessChecksPrompt($config->successChecks());
        $this->assertStringContainsString('Success checks', $formatted);
        $this->assertStringContainsString('1. Leave add_comment', $formatted);
    }

    public function testBudgetTimeoutFromConfig(): void
    {
        $this->assertNull((new BridgeConfig([]))->budget());
        $config = new BridgeConfig(['budget' => ['timeout_ms' => 600000]]);
        $this->assertSame(['timeout_ms' => 600000], $config->budget());
    }

    public function testSuccessRetryMaxAttempts(): void
    {
        $this->assertNull((new BridgeConfig([]))->successRetryMaxAttempts());
        $config = new BridgeConfig(['success_retry' => ['max_attempts' => 2]]);
        $this->assertSame(2, $config->successRetryMaxAttempts());
    }
}
