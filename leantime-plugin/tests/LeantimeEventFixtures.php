<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Tests;

/**
 * Payload shapes observed on Leantime 3.9 (k8s-test cluster).
 *
 * @see TicketUpdated::dispatch — only ticketId + legacyHook
 * @see Projects::notifyProjectUsers — comment fan-out via module=comments
 */
final class LeantimeEventFixtures
{
    /** @return array<string, mixed> */
    public static function ticketUpdated167(): array
    {
        return [
            'ticketId' => 167,
            'legacyHook' => 'updateTicket',
        ];
    }

    /** @return array<string, mixed> */
    public static function commentNotifyOnTicket167(): array
    {
        return [
            'type' => 'projectUpdate',
            'module' => 'comments',
            'moduleId' => 14,
            'message' => '클러스터 TEI·PG 실검증 : 내가 하는 건가 ?',
            'subject' => 'New comment on task #167',
            'users' => [1],
            'url' => 'https://leantime.k8s-test/#/tickets/showTicket/167?projectId=18',
        ];
    }

    /** saveTicket form carries editorId; TicketUpdated hook does not — DB lookup fills this. */
    /** @return array<string, mixed> */
    public static function ticketLookup167(): array
    {
        return [
            'ticketId' => 167,
            'assigneeUserId' => 6,
            'editorId' => 6,
            'status' => 4,
            'projectId' => 18,
        ];
    }
}
