<?php

declare(strict_types=1);

use Leantime\Core\Events\EventDispatcher;
use Leantime\Plugins\CursorBridge\Listener;
use Leantime\Plugins\CursorBridge\Plugin;

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
