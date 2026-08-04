<?php

declare(strict_types=1);

namespace Leantime\Plugins\CursorBridge\Hxcontrollers;

use Leantime\Core\Controller\HtmxController;
use Leantime\Plugins\CursorBridge\CreatedByMeTickets;

class CreatedByMe extends HtmxController
{
    protected static string $view = 'cursorbridge::partials.createdByMe';

    private CreatedByMeTickets $tickets;

    public function init(?CreatedByMeTickets $tickets = null): void
    {
        $this->tickets = $tickets ?? new CreatedByMeTickets();
    }

    public function get(): void
    {
        $userId = (int) session('userdata.id');
        $rows = $this->tickets->listFor($userId);

        $this->tpl->assign('tickets', $rows);
        $this->tpl->assign('userId', $userId);
    }
}
