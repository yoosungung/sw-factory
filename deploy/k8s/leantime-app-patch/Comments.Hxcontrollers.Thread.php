<?php

declare(strict_types=1);

namespace Leantime\Domain\Comments\Hxcontrollers;

use Leantime\Core\Controller\HtmxController;
use Leantime\Domain\Comments\Repositories\Comments as CommentRepository;
use Leantime\Domain\Comments\Services\Comments as CommentService;
use Leantime\Domain\Tickets\Services\Tickets as TicketService;

/**
 * Factory overlay: paginated Discussion "Load older comments" for large ticket threads.
 */
class Thread extends HtmxController
{
    protected static string $view = 'comments::partials.commentPage';

    private CommentService $commentService;

    private CommentRepository $commentRepository;

    private TicketService $ticketService;

    public function init(
        CommentService $commentService,
        CommentRepository $commentRepository,
        TicketService $ticketService
    ): void {
        $this->commentService = $commentService;
        $this->commentRepository = $commentRepository;
        $this->ticketService = $ticketService;
    }

    public function more(): void
    {
        $module = (string) $this->incomingRequest->query->get('module', '');
        $moduleId = (int) $this->incomingRequest->query->get('moduleId', 0);
        $limit = max(1, min(100, (int) $this->incomingRequest->query->get('limit', 20)));
        $offset = max(0, (int) $this->incomingRequest->query->get('offset', 0));
        $formHash = (string) $this->incomingRequest->query->get('formHash', '');
        $deleteUrlBase = (string) $this->incomingRequest->query->get('deleteUrlBase', '');
        $ticketId = (int) $this->incomingRequest->query->get('ticketId', 0);

        if ($module === '' || $moduleId <= 0 || $formHash === '') {
            $this->tpl->assign('comments', []);
            $this->tpl->assign('commentsHasMore', false);
            $this->tpl->assign('formHash', $formHash !== '' ? $formHash : 'invalid');
            $this->tpl->assign('deleteUrlBase', $deleteUrlBase);
            $this->tpl->assign('commentLimit', $limit);
            $this->tpl->assign('commentOffset', $offset);
            $this->tpl->assign('commentModule', $module);
            $this->tpl->assign('commentModuleId', $moduleId);
            $this->tpl->assign('commentsRepo', $this->commentRepository);

            return;
        }

        $page = $this->commentService->getComments($module, $moduleId, 0, 0, $limit + 1, $offset);
        $page = is_array($page) ? $page : [];
        $commentsHasMore = count($page) > $limit;
        $comments = $commentsHasMore ? array_slice($page, 0, $limit) : $page;

        $ticket = null;
        if ($ticketId > 0) {
            $ticket = $this->ticketService->getTicket($ticketId) ?: null;
        }

        $this->tpl->assign('comments', $comments);
        $this->tpl->assign('commentsHasMore', $commentsHasMore);
        $this->tpl->assign('formHash', $formHash);
        $this->tpl->assign('deleteUrlBase', $deleteUrlBase);
        $this->tpl->assign('commentLimit', $limit);
        $this->tpl->assign('commentOffset', $offset);
        $this->tpl->assign('commentModule', $module);
        $this->tpl->assign('commentModuleId', $moduleId);
        $this->tpl->assign('commentsRepo', $this->commentRepository);
        $this->tpl->assign('ticket', $ticket);
    }
}
