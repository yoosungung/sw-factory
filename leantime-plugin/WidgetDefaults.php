<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Pure helpers for registering Created-by-me on My Work and migrating saved grids.
 */
final class WidgetDefaults
{
    public const WIDGET_ID = 'createdByMe';

    public const NAME_KEY = 'cursorbridge.widgets.created_by_me';

    public const DESCRIPTION_KEY = 'cursorbridge.widgets.created_by_me_desc';

    public static function widgetUrl(): string
    {
        $base = defined('BASE_URL') ? (string) BASE_URL : '';

        return rtrim($base, '/') . '/cursorBridge/createdByMe/get';
    }

    /**
     * @param  array<string, object>  $available
     * @return array<string, object>
     */
    public static function injectAvailable(array $available, object $createdByMe): array
    {
        $available[self::WIDGET_ID] = $createdByMe;

        return $available;
    }

    /**
     * @param  array<string, object>  $defaults
     * @param  array<string, object>  $available
     * @return array<string, object>
     */
    public static function replaceCalendarDefault(array $defaults, array $available): array
    {
        if (! isset($available[self::WIDGET_ID])) {
            return $defaults;
        }

        unset($defaults['calendar']);
        $defaults[self::WIDGET_ID] = $available[self::WIDGET_ID];

        return $defaults;
    }

    /**
     * @param  list<array<string, mixed>>  $grid
     * @return list<array<string, mixed>>
     */
    public static function swapCalendarInDashboardGrid(
        array $grid,
        string $widgetUrl,
        string $nameKey
    ): array {
        $out = [];
        foreach ($grid as $item) {
            if (! is_array($item)) {
                continue;
            }
            if (($item['id'] ?? '') === self::WIDGET_ID) {
                $out[] = $item;

                continue;
            }
            if (($item['id'] ?? '') === 'calendar') {
                $item['id'] = self::WIDGET_ID;
                $item['widgetUrl'] = $widgetUrl;
                $item['name'] = $nameKey;
                $item['description'] = self::DESCRIPTION_KEY;
            }
            $out[] = $item;
        }

        return $out;
    }
}
