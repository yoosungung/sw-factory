<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/**
 * Loads raw comment HTML that notifyProjectUsers.message omits (strip_tags).
 */
interface CommentLookup
{
    public function textForId(int $commentId): ?string;
}
