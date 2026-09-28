import { cleanup, render, screen, within } from "@testing-library/react";
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

function renderPanel() {
  return render(
    <MemoryRouter>
      <IssuePanel
        mode="page"
        user={user}
        project={project}
        projectRole="owner"
        members={members}
        ticket={ticket}
        onClose={() => {}}
        onChanged={() => {}}
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
    expect(document.querySelector(".properties-panel")).toBeTruthy();
  });
});
