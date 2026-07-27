<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge;

/** No-op lookup for unit tests. */
final class NullCommentLookup implements CommentLookup
{
    public function textForId(int $commentId): ?string
    {
        return null;
    }
}
