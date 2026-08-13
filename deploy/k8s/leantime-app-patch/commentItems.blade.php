{{-- Factory overlay: shared comment rows for initial Discussion + Load more. --}}
@foreach ($comments as $row)
                <div class="clearall">
                    <div class="commentImage" id="comment-image-to-hide-on-edit-{{ $formHash }}-{{ $row['id'] }}">
                        <img src="{{ BASE_URL }}/api/users?profileImage={{ $row['userId'] }}&v={{ format($row['userModified'])->timestamp() }}"/>
                    </div>
                    <div class="commentMain">
                        <div class="commentContent" id="comment-to-hide-on-edit-{{ $formHash }}-{{ $row['id'] }}">
                            <div class="right commentDate">
                                {!! sprintf(__('text.written_on'), format($row['date'])->date(), format($row['date'])->time()) !!}
                                    @if ($login::userIsAtLeast($roles::$editor))
                                        <div class="inlineDropDownContainer" style="float:right; margin-left:10px;">
                                            <a href="javascript:void(0);" class="dropdown-toggle ticketDropDown" data-toggle="dropdown">
                                                <i class="fa fa-ellipsis-v" aria-hidden="true"></i>
                                            </a>

                                            <ul class="dropdown-menu">
                                                @if (($row['userId'] == session('userdata.id')) || can('comments.moderate'))
                                                    <li><a href="{{ $deleteUrlBase . $row['id'] }}" class="deleteComment formModal">
                                                        <span class="fa fa-trash"></span> {!! __('links.delete') !!}
                                                    </a></li>
                                                @endif
                                                @if (($row['userId'] == session('userdata.id')) || can('comments.moderate'))
                                                    <li>
                                                        <a href="javascript:void(0);" onclick="toggleCommentBoxes({{ $row['id'] }}, null, '{{ $formHash }}', true)">
                                                            <span class="fa fa-edit"></span> {!! __('label.edit') !!}
                                                        </a>
                                                    </li>
                                                @endif
                                                @if (isset($ticket->id))
                                                        <li><a href="javascript:void(0);" onclick="leantime.ticketsController.addCommentTimesheetContent({{ $row['id'] }}, {{ $ticket->id }});">{!! __('links.add_to_timesheets') !!}</a></li>
                                                @endif
                                            </ul>
                                        </div>
                                    @endif
                            </div>
                            <span class="name">{!! sprintf(__('text.full_name'), $tpl->escape($row['firstname']), $tpl->escape($row['lastname'])) !!}</span>
                            <div class="text tiptap-content" id="commentText-{{ $formHash }}-{{ $row['id'] }}">
                                <div id="comment-text-to-hide-{{ $formHash }}-{{ $row['id'] }}">{!! $tpl->escapeMinimal($row['text']) !!}</div>
                            </div>
                        </div>
                        <div class="commentLinks" id="comment-link-to-hide-on-edit-{{ $formHash }}-{{ $row['id'] }}">
                            @if ($login::userIsAtLeast($roles::$commenter))
                                <a href="javascript:void(0);"
                                   onclick="toggleCommentBoxes({{ $row['id'] }}, null, '{{ $formHash }}')">
                                    <span class="fa fa-reply"></span> {!! __('links.reply') !!}
                                </a>
                            @endif
                            <span class="comment-reactions" id="reactions-{{ $row['id'] }}"
                                 hx-get="{{ BASE_URL }}/hx/comments/reactions/get?commentId={{ $row['id'] }}"
                                 hx-trigger="intersect once"
                                 hx-swap="outerHTML">
                            </span>
                        </div>

                        {{-- Reply/edit box for the parent comment. Kept ABOVE the replies thread so
                             editing a comment that has replies opens the editor in place rather than
                             jumping below its replies. (#3319) --}}
                        <div style="display:none;" id="comment-{{ $formHash }}-{{ $row['id'] }}" class="commentBox">
                            <div class="commentImage">
                                <img src="{{ BASE_URL }}/api/users?profileImage={{ session('userdata.id') }}&v={{ format(session('userdata.modified'))->timestamp() }}"/>
                            </div>
                            <div class="commentReply">
                                <x-global::forms.button tag="input" inputType="submit" :labelText="__('links.reply')" name="comment" id="submit-reply-button" contentRole="primary" />
                                <x-global::forms.button tag="input" inputType="button" onclick="cancel({{ $row['id'] }}, '{{ $formHash }}')" :labelText="__('links.cancel')" contentRole="tertiary" />
                            </div>
                            <div class="clearall"></div>
                        </div>

                        <div class="replies">
                            @if ($commentsRepo->getReplies($row['id']))
                                @foreach ($commentsRepo->getReplies($row['id']) as $comment)
                                    <div>
                                        <div class="commentImage">
                                            <img src="{{ BASE_URL }}/api/users?profileImage={{ $comment['userId'] }}&v={{ format($comment['userModified'])->timestamp() }}"/>
                                        </div>
                                        <div class="commentMain">
                                            <div class="commentContent">
                                                <div class="right commentDate">
                                                    {!! sprintf(__('text.written_on'), format($comment['date'])->date(), format($comment['date'])->time()) !!}
                                                </div>
                                                <span class="name">{!! sprintf(__('text.full_name'), $tpl->escape($comment['firstname']), $tpl->escape($comment['lastname'])) !!}</span>
                                                <div class="text tiptap-content" id="comment-text-to-hide-reply-{{ $formHash }}-{{ $comment['id'] }}">{!! $tpl->escapeMinimal($comment['text']) !!}</div>
                                            </div>

                                            <div class="commentLinks">
                                                @if ($login::userIsAtLeast($roles::$commenter))
                                                    <a href="javascript:void(0);"
                                                       onclick="toggleCommentBoxes({{ $row['id'] }}, null, '{{ $formHash }}')">
                                                        <span class="fa fa-reply"></span> {!! __('links.reply') !!}
                                                    </a>
                                                    @if ($comment['userId'] == session('userdata.id'))
                                                        <a href="{{ $deleteUrlBase . $comment['id'] }}"
                                                           class="deleteComment formModal">
                                                            <span class="fa fa-trash"></span> {!! __('links.delete') !!}
                                                        </a>
                                                        <a href="javascript:void(0);" onclick="toggleCommentBoxes({{ $row['id'] }}, {{ $comment['id'] }}, '{{ $formHash }}', true, true)">
                                                            <span class="fa fa-edit"></span> {!! __('label.edit') !!}
                                                        </a>
                                                    @endif
                                                @endif
                                                <span class="comment-reactions" id="reactions-{{ $comment['id'] }}"
                                                     hx-get="{{ BASE_URL }}/hx/comments/reactions/get?commentId={{ $comment['id'] }}"
                                                     hx-trigger="intersect once"
                                                     hx-swap="outerHTML">
                                                </span>
                                            </div>
                                        </div>
                                        <div class="clearall"></div>
                                    </div>
                                @endforeach
                            @endif
                        </div>
                    </div>
                </div>
@endforeach
