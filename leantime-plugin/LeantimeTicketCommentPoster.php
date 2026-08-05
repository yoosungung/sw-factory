<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Posts ticket comments via Leantime Comments repository (runtime only).
 */
final class LeantimeTicketCommentPoster implements TicketCommentPoster
{
    public function post(int $ticketId, string $html, ?int $authorUserId = null): bool
    {
        if ($ticketId <= 0 || $html === '' || ! function_exists('app')) {
            return false;
        }

        $userId = $authorUserId ?? (int) (session('userdata.id') ?? 0);
        if ($userId <= 0) {
            return false;
        }

        try {
            $repo = app()->make(\Leantime\Domain\Comments\Repositories\Comments::class);
            $values = [
                'text' => $html,
                'userId' => $userId,
                'date' => date('Y-m-d H:i:s'),
                'moduleId' => $ticketId,
                'commentParent' => 0,
                'status' => '',
            ];
            $id = $repo->addComment($values, 'ticket');

            return $id !== false && (int) $id > 0;
        } catch (\Throwable) {
            return false;
        }
    }

    public function hasContaining(int $ticketId, string $needle): bool
    {
        if ($ticketId <= 0 || $needle === '' || ! function_exists('app')) {
            return false;
        }

        try {
            $repo = app()->make(\Leantime\Domain\Comments\Repositories\Comments::class);
            // parent=-1: do not filter commentParent (see Comments::getComments).
            $rows = $repo->getComments('ticket', $ticketId, -1);
            if (! is_array($rows)) {
                return false;
            }
            foreach ($rows as $row) {
                $text = is_array($row) ? (string) ($row['text'] ?? '') : '';
                if ($text !== '' && str_contains($text, $needle)) {
                    return true;
                }
            }

            return false;
        } catch (\Throwable) {
            return false;
        }
    }
}
