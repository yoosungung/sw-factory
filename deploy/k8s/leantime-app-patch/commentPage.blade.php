{{-- Factory overlay: HTMX page for Discussion Load older comments. --}}
@php
    $commentsRepo = $commentsRepo ?? app()->make(Leantime\Domain\Comments\Repositories\Comments::class);
    $nextOffset = (int) $commentOffset + (int) $commentLimit;
@endphp

<div id="comments-items-{{ $formHash }}" hx-swap-oob="beforeend">
    @include('comments::partials.commentItems')
</div>

<div id="comments-load-more-{{ $formHash }}" class="align-center" style="margin: 12px 0;">
    @if (!empty($commentsHasMore) && !empty($commentModule) && !empty($commentModuleId))
        <button type="button"
                class="btn btn-default"
                hx-get="{{ BASE_URL }}/hx/comments/thread/more?module={{ urlencode($commentModule) }}&moduleId={{ (int) $commentModuleId }}&offset={{ $nextOffset }}&limit={{ (int) $commentLimit }}&formHash={{ urlencode($formHash) }}&deleteUrlBase={{ urlencode($deleteUrlBase) }}@if(!empty($ticket->id))&ticketId={{ (int) $ticket->id }}@endif"
                hx-trigger="intersect once"
                hx-target="#comments-load-more-{{ $formHash }}"
                hx-swap="outerHTML"
                hx-indicator="this">
            Load older comments
        </button>
    @endif
</div>
