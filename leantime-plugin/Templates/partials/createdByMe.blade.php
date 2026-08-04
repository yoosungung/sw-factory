@props([
    'tickets' => [],
    'userId' => 0,
])

@php
    $statusNames = [
        0 => 'Done',
        1 => 'Blocked',
        2 => 'Waiting for Approval',
        3 => 'New',
        4 => 'In Progress',
        10 => 'Review',
        11 => 'Deploying Test',
        12 => 'QA',
        13 => 'Deploying Prod',
        -1 => 'Archived',
    ];
    // bg, text — factory dual-loop board hues
    $statusColors = [
        0 => ['#d1e7dd', '#0f5132'],   // Done — green
        1 => ['#f8d7da', '#842029'],   // Blocked — red
        2 => ['#fff3cd', '#664d03'],   // Waiting — amber
        3 => ['#cff4fc', '#055160'],   // New — cyan
        4 => ['#ffe5c2', '#984c0c'],   // In Progress — orange
        10 => ['#e2d9f3', '#432874'],  // Review — purple
        11 => ['#d3e5ef', '#1a5276'],  // Deploying Test — blue
        12 => ['#f5d0fe', '#701a75'],  // QA — magenta
        13 => ['#cfe2ff', '#084298'],  // Deploying Prod — indigo
        -1 => ['#e9ecef', '#41464b'],  // Archived — gray
    ];
    $projectPalette = [
        ['#e8f4f8', '#0b6e8a'],
        ['#f3e8ff', '#6b21a8'],
        ['#ecfdf5', '#047857'],
        ['#fff7ed', '#c2410c'],
        ['#fef2f2', '#b91c1c'],
        ['#eff6ff', '#1d4ed8'],
        ['#fdf4ff', '#a21caf'],
        ['#f0fdf4', '#15803d'],
    ];
@endphp

<div id="createdByMeContainer" class="clear">
    @if(empty($tickets))
        <p class="tw-text-sm tw-opacity-70" style="padding: 8px 4px; margin: 0;">
            {{ __('cursorbridge.widgets.created_by_me_empty') }}
        </p>
    @else
        <div style="padding: 4px 0;">
            @foreach($tickets as $ticket)
                @php
                    $status = (int) ($ticket['status'] ?? 0);
                    $label = $statusNames[$status] ?? ('status '.$status);
                    $isDone = $status === 0;
                    $assignee = trim((string) ($ticket['editorName'] ?? ''));
                    if ($assignee === '') {
                        $assignee = '#'.(string) ($ticket['editorId'] ?? '');
                    }
                    $project = trim((string) ($ticket['projectName'] ?? ''));
                    if ($project === '') {
                        $project = 'project #'.(string) ($ticket['projectId'] ?? '');
                    }
                    $statusTone = $statusColors[$status] ?? ['#e9ecef', '#41464b'];
                    $projectTone = $projectPalette[((int) ($ticket['projectId'] ?? 0)) % count($projectPalette)];
                    $chip = 'display:inline-block;padding:1px 7px;border-radius:4px;font-weight:600;line-height:1.4;';
                @endphp
                <div style="padding: 8px 4px; border-bottom: 1px solid var(--main-border-color);">
                    <a href="{{ BASE_URL }}/#/tickets/showTicket/{{ $ticket['id'] }}?projectId={{ $ticket['projectId'] }}"
                       style="font-weight: 600; display: inline;">
                        #{{ $ticket['id'] }} {{ $ticket['headline'] }}
                    </a>
                    <div class="tw-text-xs" style="margin-top: 4px;">
                        <span style="{{ $chip }}background:{{ $projectTone[0] }};color:{{ $projectTone[1] }};">{{ $project }}</span>
                        <span style="{{ $chip }}background:{{ $statusTone[0] }};color:{{ $statusTone[1] }};margin-left:4px;">{{ $label }}</span>
                        <span class="tw-opacity-80" style="margin-left:6px;">{{ $assignee }}</span>
                        @if($isDone && !empty($ticket['closedAt']))
                            <span class="tw-opacity-70" style="margin-left:6px;">closed {{ $ticket['closedAt'] }}</span>
                        @endif
                    </div>
                </div>
            @endforeach
        </div>
    @endif
</div>
