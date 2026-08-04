<?php

declare(strict_types=1);

use Leantime\Core\Events\EventDispatcher;
use Leantime\Domain\Plugins\Services\Registration;
use Leantime\Domain\Widgets\Models\Widget;
use Leantime\Plugins\CursorBridge\Listener;
use Leantime\Plugins\CursorBridge\Plugin;
use Leantime\Plugins\CursorBridge\WidgetDefaults;

$listener = Plugin::createDefault()->listener();

EventDispatcher::addEventListener(
    Listener::HOOK_TICKET_CREATED,
    static fn (array $payload) => $listener->onTicketCreated($payload)
);
EventDispatcher::addEventListener(
    Listener::HOOK_TICKET_UPDATED,
    static fn (array $payload) => $listener->onTicketUpdated($payload)
);
EventDispatcher::addEventListener(
    Listener::HOOK_TICKET_DELETED,
    static fn (array $payload) => $listener->onTicketDeleted($payload)
);
EventDispatcher::addEventListener(
    Listener::HOOK_NOTIFY_PROJECT_USERS,
    static fn (array $payload) => $listener->onNotifyProjectUsers($payload)
);

$registration = app()->makeWith(Registration::class, ['pluginId' => 'CursorBridge']);
$registration->registerLanguageFiles(['en-US']);

EventDispatcher::add_filter_listener(
    'leantime.domain.widgets.services.widgets.__construct.availableWidgets',
    static function (array $widgets): array {
        $created = app()->make(Widget::class, [
            'id' => WidgetDefaults::WIDGET_ID,
            'name' => WidgetDefaults::NAME_KEY,
            'description' => WidgetDefaults::DESCRIPTION_KEY,
            'widgetUrl' => WidgetDefaults::widgetUrl(),
            'gridHeight' => 30,
            'gridWidth' => 4,
            'gridMinHeight' => 12,
            'gridMinWidth' => 3,
            'gridX' => 8,
            'gridY' => 7,
            'alwaysVisible' => false,
            'noTitle' => false,
            'widgetTrigger' => 'load, every 5m',
            'fixed' => false,
        ]);

        return WidgetDefaults::injectAvailable($widgets, $created);
    }
);

EventDispatcher::add_filter_listener(
    'leantime.domain.widgets.services.widgets.__construct.defaultWidgets',
    static function (array $defaults, array $params = []): array {
        $available = $params['availableWidgets'] ?? $defaults;

        return WidgetDefaults::replaceCalendarDefault($defaults, is_array($available) ? $available : $defaults);
    }
);
