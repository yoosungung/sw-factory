import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function renderPanel(ticketProp: Ticket = ticket, onChanged: (t?: Ticket) => void = () => {}) {
  return render(
    <MemoryRouter>
      <IssuePanel
        mode="page"
        user={user}
        project={project}
        projectRole="owner"
        members={members}
        ticket={ticketProp}
        onClose={() => {}}
        onChanged={onChanged}
        onDeleted={() => {}}
      />
    </MemoryRouter>,
  );
}

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

  it("shows properties fields only on Details tab", async () => {
    renderPanel();
    expect(screen.queryByText("Assignee")).toBeNull();

    screen.getByRole("tab", { name: /^Details$/i }).click();
    expect(await screen.findByText("Assignee")).toBeInTheDocument();
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Blocked by")).toBeInTheDocument();
    expect(document.querySelector(".properties-panel")).toBeTruthy();
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

    screen.getByRole("button", { name: /Remove blocker Pred/i }).click();
    expect(client.putTicketDependencies).toHaveBeenCalledWith("t1", []);
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

  it("does not re-fetch side loads when ticket prop identity changes for the same id", async () => {
    const { client } = await import("../../api");
    const { rerender } = renderPanel();
    await waitFor(() => expect(client.comments).toHaveBeenCalledTimes(1));
    expect(client.listFiles).toHaveBeenCalledTimes(1);
    expect(client.ticketActivities).toHaveBeenCalledTimes(1);
    expect(client.ticketDependencies).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <IssuePanel
          mode="page"
          user={user}
          project={project}
          projectRole="owner"
          members={members}
          ticket={{ ...ticket, title: "Renamed", version: 2 }}
          onClose={() => {}}
          onChanged={() => {}}
          onDeleted={() => {}}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue("Renamed")).toBeInTheDocument());
    expect(client.comments).toHaveBeenCalledTimes(1);
    expect(client.listFiles).toHaveBeenCalledTimes(1);
    expect(client.ticketActivities).toHaveBeenCalledTimes(1);
    expect(client.ticketDependencies).toHaveBeenCalledTimes(1);
  });

  it("save uses PATCH activities and does not call ticketActivities again", async () => {
    const { client } = await import("../../api");
    const onChanged = vi.fn();
    vi.mocked(client.patchTicket).mockResolvedValue({
      ticket: { ...ticket, title: "Saved title", version: 2 },
      activities: [
        {
          id: "a1",
          ticket_id: "t1",
          actor_id: "u1",
          field: "title",
          old_val: "Sample",
          new_val: "Saved title",
          at: "2026-09-29T04:00:00.000Z",
        },
      ],
    });

    renderPanel(ticket, onChanged);
    await waitFor(() => expect(client.comments).toHaveBeenCalled());
    const titleCalls = vi.mocked(client.ticketActivities).mock.calls.length;

    const titleInput = screen.getByPlaceholderText(/Issue title/i);
    fireEvent.change(titleInput, { target: { value: "Saved title" } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(client.patchTicket).toHaveBeenCalled());
    expect(client.ticketActivities).toHaveBeenCalledTimes(titleCalls);
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved title", version: 2 }),
    );

    screen.getByRole("tab", { name: /^History$/i }).click();
    expect(await screen.findByText(/Saved title/i)).toBeInTheDocument();
  });
});
