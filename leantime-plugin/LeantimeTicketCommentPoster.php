<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Posts ticket comments via Leantime Comments repository (runtime only).
 */
final class LeantimeTicketCommentPoster implements TicketCommentPoster
{
    public function post(int $ticketId, string $html): bool
    {
        if ($ticketId <= 0 || $html === '' || ! function_exists('app')) {
            return false;
        }

        try {
            $repo = app()->make(\Leantime\Domain\Comments\Repositories\Comments::class);
            $values = [
                'text' => $html,
                'module' => 'ticket',
                'moduleId' => $ticketId,
                'commentParent' => -1,
                'status' => '',
            ];
            $id = $repo->addComment($values, 'ticket', $ticketId);

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
            $rows = $repo->getComments('ticket', $ticketId);
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
