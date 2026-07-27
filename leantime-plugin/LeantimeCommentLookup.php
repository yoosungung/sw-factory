<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** Resolves comment body via Leantime Comments repository (runtime only). */
final class LeantimeCommentLookup implements CommentLookup
{
    public function textForId(int $commentId): ?string
    {
        if ($commentId <= 0 || ! function_exists('app')) {
            return null;
        }

        try {
            $repo = app()->make(\Leantime\Domain\Comments\Repositories\Comments::class);
            $comment = $repo->getComment($commentId);
            if (! is_array($comment) || ! isset($comment['text'])) {
                return null;
            }

            $text = trim((string) $comment['text']);

            return $text === '' ? null : $text;
        } catch (\Throwable) {
            return null;
        }
    }
}
