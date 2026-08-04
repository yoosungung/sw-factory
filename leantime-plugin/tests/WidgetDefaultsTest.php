<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

use Leantime\Plugins\CursorBridge\WidgetDefaults;
use PHPUnit\Framework\TestCase;

final class WidgetDefaultsTest extends TestCase
{
    public function testInjectCreatedByMeKeepsCalendarInCatalog(): void
    {
        $available = [
            'welcome' => (object) ['id' => 'welcome'],
            'calendar' => (object) ['id' => 'calendar'],
            'todos' => (object) ['id' => 'todos'],
        ];
        $created = (object) ['id' => 'createdByMe'];

        $out = WidgetDefaults::injectAvailable($available, $created);

        $this->assertSame($created, $out['createdByMe']);
        $this->assertArrayHasKey('calendar', $out);
    }

    public function testDefaultReplacesCalendarSlotWithCreatedByMe(): void
    {
        $created = (object) [
            'id' => 'createdByMe',
            'gridX' => 8,
            'gridY' => 7,
            'gridWidth' => 4,
            'gridHeight' => 30,
        ];
        $defaults = [
            'welcome' => (object) ['id' => 'welcome'],
            'calendar' => (object) ['id' => 'calendar'],
            'todos' => (object) ['id' => 'todos'],
        ];
        $available = $defaults + ['createdByMe' => $created];

        $out = WidgetDefaults::replaceCalendarDefault($defaults, $available);

        $this->assertArrayNotHasKey('calendar', $out);
        $this->assertSame($created, $out['createdByMe']);
        $this->assertArrayHasKey('todos', $out);
        $this->assertArrayHasKey('welcome', $out);
    }

    public function testReplaceIsNoopWithoutCreatedByMeWidget(): void
    {
        $defaults = [
            'calendar' => (object) ['id' => 'calendar'],
            'todos' => (object) ['id' => 'todos'],
        ];

        $this->assertSame($defaults, WidgetDefaults::replaceCalendarDefault($defaults, $defaults));
    }

    public function testDashboardGridSwapReplacesCalendarEntry(): void
    {
        $grid = [
            ['id' => 'welcome', 'x' => '0', 'y' => '0', 'w' => '12'],
            [
                'id' => 'calendar',
                'x' => '8',
                'y' => '7',
                'w' => '4',
                'h' => '30',
                'widgetUrl' => 'https://example/widgets/calendar/get',
                'name' => 'widgets.title.calendar',
            ],
            ['id' => 'todos', 'x' => '0', 'y' => '7', 'w' => '8'],
        ];

        $out = WidgetDefaults::swapCalendarInDashboardGrid(
            $grid,
            'https://example/cursorBridge/createdByMe/get',
            'cursorbridge.widgets.created_by_me'
        );

        $this->assertSame('createdByMe', $out[1]['id']);
        $this->assertSame('8', $out[1]['x']);
        $this->assertSame('https://example/cursorBridge/createdByMe/get', $out[1]['widgetUrl']);
        $this->assertSame('cursorbridge.widgets.created_by_me', $out[1]['name']);
        $this->assertSame('calendar', $grid[1]['id']);
    }

    public function testDashboardGridSwapIsIdempotentWhenAlreadyReplaced(): void
    {
        $grid = [
            ['id' => 'createdByMe', 'x' => '8', 'widgetUrl' => 'https://example/cursorBridge/createdByMe/get'],
        ];

        $out = WidgetDefaults::swapCalendarInDashboardGrid(
            $grid,
            'https://example/cursorBridge/createdByMe/get',
            'cursorbridge.widgets.created_by_me'
        );

        $this->assertSame($grid, $out);
    }
}
