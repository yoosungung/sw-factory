import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, Project, Ticket, User } from "../../api";
import { IssuePanel } from "./IssuePanel";

afterEach(() => {
  cleanup();
});

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    client: {
      projectStatuses: vi.fn(async () => ({
        statuses: [
          { key: "backlog", label: "Backlog", category: "backlog", sort_order: 0 },
          { key: "in_progress", label: "In Progress", category: "active", sort_order: 1 },
        ],
      })),
      comments: vi.fn(async () => ({ comments: [] })),
      listFiles: vi.fn(async () => ({ files: [] })),
      ticketActivities: vi.fn(async () => ({ activities: [] })),
      patchTicket: vi.fn(),
      addComment: vi.fn(),
      deleteComment: vi.fn(),
      uploadFile: vi.fn(),
      uploadFileDirect: vi.fn(),
      deleteFile: vi.fn(),
      deleteTicket: vi.fn(),
      getTicket: vi.fn(),
      tickets: vi.fn(async () => ({ tickets: [] })),
      search: vi.fn(async () => ({ clients: [], projects: [], tickets: [] })),
      createTicket: vi.fn(),
      ticketDependencies: vi.fn(async () => ({
        blocker_ids: [],
        blockers: [],
        blocking: [],
      })),
      putTicketDependencies: vi.fn(),
    },
  };
});

const user: User = {
  id: "u1",
  email: "dev@example.com",
  name: "Dev",
  created_at: "2026-01-01T00:00:00.000Z",
  is_admin: false,
};

const project: Project = {
  id: "p1",
  client_id: "c1",
  name: "Demo",
  description: "",
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ticket: Ticket = {
  id: "t1",
  project_id: "p1",
  title: "Sample",
  description: "",
  type: "task",
  status: "backlog",
  priority: "medium",
  sort_order: 0,
  milestone_id: null,
  assignee_id: null,
  due_at: null,
  date_from: null,
  date_to: null,
  version: 1,
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const members: Member[] = [
  { user_id: "u1", role: "owner", email: "dev@example.com", name: "Dev" },
];

function renderPanel(
  props: {
    onPromptAgent?: () => void;
    mode?: "sidebar" | "modal" | "page";
    ticket?: Ticket;
  } = {},
) {
  const { ticket: ticketProp, ...rest } = props;
  return render(
    <MemoryRouter>
      <IssuePanel
        mode="page"
        user={user}
        project={project}
        projectRole="owner"
        members={members}
        ticket={ticketProp ?? ticket}
        onClose={() => {}}
        onChanged={() => {}}
        onDeleted={() => {}}
        {...rest}
      />
    </MemoryRouter>,
  );
}

const VISIBLE_CHROME = /닫기|크게|전체 화면으로 열기/;

describe("IssuePanel activity tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orders tabs Comments → Details → Files → History and defaults to Comments", () => {
    renderPanel();
    const tabs = screen.getByRole("tablist", { name: /activity/i });
    const labels = within(tabs)
      .getAllByRole("tab")
      .map((el) => el.textContent?.replace(/\d+/g, "").trim());
    expect(labels).toEqual(["Comments", "Details", "Files", "History"]);
    expect(screen.getByRole("tab", { name: /Comments/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByPlaceholderText(/Add a comment/i)).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.querySelector(".issue-aside")).toBeNull();
  });

  it("shows Prompt agent only when onPromptAgent is provided", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /Prompt agent/i })).toBeNull();

    const onPromptAgent = vi.fn();
    cleanup();
    renderPanel({ onPromptAgent });
    screen.getByRole("button", { name: /Prompt agent/i }).click();
    expect(onPromptAgent).toHaveBeenCalledOnce();
  });

  it("shows properties fields only on Details tab", async () => {
    renderPanel();
    expect(screen.queryByText("Assignee")).toBeNull();

    screen.getByRole("tab", { name: /^Details$/i }).click();
    expect(await screen.findByText("Assignee")).toBeInTheDocument();
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Blocked by")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Children")).toBeInTheDocument();
    expect(document.querySelector(".properties-panel")).toBeTruthy();
  });

  it("shows Parent and Children as id + title separate from Blocked by", async () => {
    const { client } = await import("../../api");
    const parentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    vi.mocked(client.getTicket).mockResolvedValue({
      ticket: { ...ticket, id: parentId, title: "Parent Epic" },
    });
    vi.mocked(client.tickets).mockResolvedValue({
      tickets: [{ ...ticket, id: "child-1111-2222-3333-444444444444", title: "Child Task" }],
    });

    renderPanel({ ticket: { ...ticket, milestone_id: parentId } });
    screen.getByRole("tab", { name: /^Details$/i }).click();

    const parent = await screen.findByTestId("issue-parent");
    expect(parent).toHaveTextContent(/aaaaaaaa.*Parent Epic/);
    const children = await screen.findByTestId("issue-children");
    expect(children).toHaveTextContent(/child-11.*Child Task/);
    expect(screen.getByTestId("blocked-by")).toBeInTheDocument();
    expect(client.tickets).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ milestone_id: "t1" }),
    );
  });

  it("sets Parent via PATCH milestone_id from picker paste", async () => {
    const { client } = await import("../../api");
    const parentId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    vi.mocked(client.getTicket).mockResolvedValue({
      ticket: { ...ticket, id: parentId, title: "New Parent" },
    });
    vi.mocked(client.patchTicket).mockResolvedValue({
      ticket: { ...ticket, milestone_id: parentId, version: 2 },
    });

    renderPanel();
    screen.getByRole("tab", { name: /^Details$/i }).click();
    await screen.findByTestId("issue-parent");

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByRole("combobox", { name: /Parent ticket/i }), {
      target: { value: parentId },
    });
    screen.getByRole("button", { name: /^Set parent$/i }).click();

    expect(client.patchTicket).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ milestone_id: parentId, version: 1 }),
    );
  });

  it("creates a child with milestone_id linked to current ticket", async () => {
    const { client } = await import("../../api");
    vi.mocked(client.createTicket).mockResolvedValue({
      ticket: {
        ...ticket,
        id: "new-child",
        title: "Spawned",
        milestone_id: "t1",
      },
    });
    vi.mocked(client.tickets)
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [{ ...ticket, id: "new-child", title: "Spawned", milestone_id: "t1" }],
      });

    renderPanel();
    screen.getByRole("tab", { name: /^Details$/i }).click();
    await screen.findByTestId("issue-children");

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText(/New child title/i), {
      target: { value: "Spawned" },
    });
    screen.getByRole("button", { name: /^Add child$/i }).click();

    await screen.findByText(/Spawned/);
    expect(client.createTicket).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ title: "Spawned", type: "task", milestone_id: "t1" }),
    );
  });

  it("links an existing ticket as child via picker OCC patch", async () => {
    const { client } = await import("../../api");
    const childId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    vi.mocked(client.getTicket).mockResolvedValue({
      ticket: { ...ticket, id: childId, title: "Existing", version: 3 },
    });
    vi.mocked(client.patchTicket).mockResolvedValue({
      ticket: { ...ticket, id: childId, title: "Existing", milestone_id: "t1", version: 4 },
    });
    vi.mocked(client.tickets)
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [{ ...ticket, id: childId, title: "Existing", milestone_id: "t1" }],
      });

    renderPanel();
    screen.getByRole("tab", { name: /^Details$/i }).click();
    await screen.findByTestId("issue-children");

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByRole("combobox", { name: /Existing child ticket/i }), {
      target: { value: childId },
    });
    screen.getByRole("button", { name: /^Link child$/i }).click();

    await waitFor(() => {
      expect(client.getTicket).toHaveBeenCalledWith(childId);
      expect(client.patchTicket).toHaveBeenCalledWith(
        childId,
        expect.objectContaining({ milestone_id: "t1", version: 3 }),
      );
    });
    expect(await screen.findByText(/Existing/)).toBeInTheDocument();
  });

  it("adds and removes FS blockers from Details", async () => {
    const { client } = await import("../../api");
    vi.mocked(client.ticketDependencies).mockResolvedValue({
      blocker_ids: ["t2"],
      blockers: [{ id: "t2", title: "Pred", status: "in_progress" }],
      blocking: [],
    });
    vi.mocked(client.putTicketDependencies).mockImplementation(async (_id, ids) => ({
      blocker_ids: ids,
      blockers: ids.map((id) => ({ id, title: id === "t2" ? "Pred" : "New", status: "backlog" })),
      blocking: [],
      ticket: { ...ticket, blocker_ids: ids, version: ticket.version + 1 },
    }));

    renderPanel();
    screen.getByRole("tab", { name: /^Details$/i }).click();
    expect(await screen.findByText("Pred")).toBeInTheDocument();

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByRole("combobox", { name: /Predecessor ticket/i }), {
      target: { value: "t3" },
    });
    screen.getByRole("button", { name: /^Add blocker$/i }).click();
    await waitFor(() => {
      expect(client.putTicketDependencies).toHaveBeenCalledWith("t1", ["t2", "t3"]);
    });
    expect(await screen.findByText("New")).toBeInTheDocument();

    screen.getByRole("button", { name: /Remove blocker Pred/i }).click();
    await waitFor(() => {
      expect(client.putTicketDependencies).toHaveBeenCalledWith("t1", ["t3"]);
    });
  });

  it("History rows put change text before timestamp inside history-list", async () => {
    const { client } = await import("../../api");
    vi.mocked(client.ticketActivities).mockResolvedValueOnce({
      activities: [
        {
          id: "a1",
          field: "status",
          old_val: "backlog",
          new_val: "in_progress",
          at: "2026-09-29T04:00:00.000Z",
        },
      ],
    });

    renderPanel();
    screen.getByRole("tab", { name: /^History$/i }).click();

    const list = await screen.findByText(/status/i).then((el) => el.closest(".history-list"));
    expect(list).toBeTruthy();
    const row = list!.querySelector(".list-row");
    expect(row).toBeTruthy();
    const cells = Array.from(row!.children) as HTMLElement[];
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toMatch(/status.*backlog.*in_progress/i);
    expect(cells[1].classList.contains("muted")).toBe(true);
  });
});

describe("IssuePanel type icon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses check glyph for milestone tickets", () => {
    render(
      <MemoryRouter>
        <IssuePanel
          mode="page"
          user={user}
          project={project}
          projectRole="owner"
          members={members}
          ticket={{ ...ticket, type: "milestone", title: "Epic" }}
          onClose={() => {}}
          onChanged={() => {}}
          onDeleted={() => {}}
        />
      </MemoryRouter>,
    );
    const icon = document.querySelector(".type-icon.milestone");
    expect(icon).toBeTruthy();
    expect(icon!.textContent).toBe("✓");
    expect(icon!.textContent).not.toContain("◆");
  });
});

describe("IssuePanel chrome icons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sidebar close and full-page link are icon-only with accessible names", () => {
    renderPanel({ mode: "sidebar" });
    const full = screen.getByRole("link", { name: "Open full page" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(full.textContent).not.toMatch(VISIBLE_CHROME);
    expect(close.textContent).not.toMatch(VISIBLE_CHROME);
    expect(full.querySelector("svg")).toBeTruthy();
    expect(close.querySelector("svg")).toBeTruthy();
  });

  it("page mode uses Back to board icon without full-page link", () => {
    renderPanel({ mode: "page" });
    expect(screen.queryByRole("link", { name: "Open full page" })).toBeNull();
    const back = screen.getByRole("button", { name: "Back to board" });
    expect(back.textContent).not.toMatch(VISIBLE_CHROME);
    expect(back.querySelector("svg")).toBeTruthy();
  });
});
