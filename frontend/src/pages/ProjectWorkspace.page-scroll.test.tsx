import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ticket, User } from "../api";
import { ProjectWorkspace } from "./ProjectWorkspace";

const statuses = [
  { key: "backlog", label: "Backlog", category: "backlog" as const, sort_order: 0 },
  { key: "in_progress", label: "In progress", category: "active" as const, sort_order: 1 },
  { key: "done", label: "Done", category: "done" as const, sort_order: 2 },
];

function ticket(partial: Partial<Ticket> & Pick<Ticket, "id" | "title" | "status">): Ticket {
  return {
    project_id: "p1",
    description: "",
    type: "task",
    priority: "medium",
    sort_order: 0,
    milestone_id: null,
    assignee_id: null,
    due_at: null,
    date_from: partial.date_from ?? null,
    date_to: partial.date_to ?? null,
    version: 1,
    created_by: "u1",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

const backlogTicket = ticket({ id: "t-backlog", title: "Backlog item", status: "backlog" });
const timelineTicket = ticket({
  id: "t-timeline",
  title: "Timeline item",
  status: "in_progress",
  date_from: "2026-10-01",
  date_to: "2026-10-10",
});
const milestoneTicket = ticket({
  id: "t-ms",
  title: "Milestone row",
  status: "in_progress",
  type: "milestone",
  date_from: "2026-10-01",
  date_to: "2026-10-15",
});
const doneMilestone = ticket({
  id: "t-ms-done",
  title: "Done milestone",
  status: "done",
  type: "milestone",
});

const ticketsMock = vi.fn(
  async (_id: string, opts?: { type?: string; limit?: number }) => {
    if (opts?.type === "milestone") {
      if (opts.limit) {
        return { tickets: [milestoneTicket], next_cursor: null };
      }
      return { tickets: [milestoneTicket, doneMilestone], next_cursor: null };
    }
    if (opts?.type === "task") {
      return { tickets: [timelineTicket, backlogTicket], next_cursor: null };
    }
    return { tickets: [milestoneTicket, timelineTicket], next_cursor: null };
  },
);

vi.mock("../api", () => ({
  client: {
    project: () =>
      Promise.resolve({
        project: {
          id: "p1",
          client_id: "c1",
          name: "Proj",
          description: "",
          created_by: "u1",
          created_at: "2026-01-01T00:00:00.000Z",
          role: "owner",
        },
      }),
    kanban: () =>
      Promise.resolve({
        statuses,
        columns: {
          backlog: [backlogTicket],
          in_progress: [timelineTicket],
          done: [],
        },
      }),
    timeline: () => Promise.resolve({ items: [timelineTicket] }),
    tickets: (...args: Parameters<typeof ticketsMock>) => ticketsMock(...args),
    projectMembers: () => Promise.resolve({ members: [] }),
    getClient: () =>
      Promise.resolve({
        client: {
          id: "c1",
          name: "Space",
          description: "",
          created_by: "u1",
          created_at: "2026-01-01T00:00:00.000Z",
          role: "owner",
        },
      }),
  },
}));

vi.mock("../hooks/useSession", () => ({
  useClients: () => ({ clients: [], reload: vi.fn() }),
  useAllProjects: () => [],
}));

vi.mock("../components/chrome/AppChrome", () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div className="main">{children}</div>,
}));

const user: User = {
  id: "u1",
  email: "dev@localhost",
  name: "Dev",
  created_at: "2026-01-01T00:00:00.000Z",
  is_admin: false,
};

afterEach(() => {
  cleanup();
  ticketsMock.mockReset();
  ticketsMock.mockImplementation(async (_id, opts) => {
    if (opts?.type === "milestone") {
      if (opts.limit) {
        return { tickets: [milestoneTicket], next_cursor: null };
      }
      return { tickets: [milestoneTicket, doneMilestone], next_cursor: null };
    }
    if (opts?.type === "task") {
      return { tickets: [timelineTicket, backlogTicket], next_cursor: null };
    }
    return { tickets: [milestoneTicket, timelineTicket], next_cursor: null };
  });
});

async function renderPath(path: string) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/projects/:id"
          element={<ProjectWorkspace user={user} onLogout={() => undefined} />}
        />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
  return result;
}

async function renderView(view: "backlog" | "timeline" | "list" | "board" | "overview") {
  const qs = view === "overview" ? "/projects/p1" : `/projects/p1?view=${view}`;
  return renderPath(qs);
}

describe("ProjectWorkspace backlog/timeline scrollport", () => {
  it("keeps toolbar fixed; backlog body scrolls in .page-scroll", async () => {
    const { container } = await renderView("backlog");

    expect(screen.getByRole("heading", { name: "Backlog" })).toBeTruthy();
    const toolbar = container.querySelector(".toolbar");
    const scroll = container.querySelector(".page-scroll");
    expect(toolbar).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(scroll?.querySelector(".backlog")).toBeTruthy();
    expect(toolbar?.querySelector(".backlog")).toBeNull();
    expect(scroll?.textContent).toContain("Backlog item");
  });

  it("keeps toolbar fixed; timeline body scrolls in .page-scroll", async () => {
    const { container } = await renderView("timeline");

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeTruthy();
    const toolbar = container.querySelector(".toolbar");
    const scroll = container.querySelector(".page-scroll");
    expect(toolbar).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(scroll?.querySelector(".content-panel")).toBeTruthy();
    expect(toolbar?.querySelector(".content-panel")).toBeNull();
    expect(scroll?.textContent).toContain("Timeline item");
  });

  it("shows unified type-icon check on timeline rows", async () => {
    const { container } = await renderView("timeline");
    const icon = container.querySelector(".page-scroll .type-icon.task");
    expect(icon).toBeTruthy();
    expect(icon!.textContent).toBe("✓");
    expect(container.querySelector(".page-scroll .type-icon")!.textContent).not.toContain("◆");
  });

  it("timeline rows use list-timeline with date · key · title · status cells", async () => {
    const { container } = await renderView("timeline");
    const row = container.querySelector(".page-scroll .list-row.list-timeline");
    expect(row).toBeTruthy();
    expect(row!.children).toHaveLength(4);
    expect(row!.textContent).toContain("Timeline item");
    expect(row!.textContent).toMatch(/In progress/i);
    expect(row!.querySelector(".issue-key")).toBeTruthy();
  });
});

describe("ProjectWorkspace type-icon unify", () => {
  it("list view uses check glyph for milestone (not diamond)", async () => {
    const { container } = await renderView("list");
    expect(screen.getByText("Milestone row")).toBeInTheDocument();
    const icon = container.querySelector(".type-icon.milestone");
    expect(icon).toBeTruthy();
    expect(icon!.textContent).toBe("✓");
    expect(icon!.textContent).not.toContain("◆");
  });
});

describe("ProjectWorkspace type filter UX", () => {
  it("shows All/Task/Milestone chips on board/backlog/list and keeps URL type=", async () => {
    const { container } = await renderPath("/projects/p1?view=board&type=milestone");
    const group = screen.getByRole("group", { name: "Ticket type" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Task" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Milestone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector(".issue-card")?.textContent).toContain("Milestone row");
    expect(container.textContent).not.toContain("Timeline item");
  });

  it("list passes type=milestone to tickets API and empty copy is No milestones", async () => {
    ticketsMock.mockImplementation(async (_id, opts) => {
      if (opts?.type === "milestone") {
        return { tickets: [], next_cursor: null };
      }
      return { tickets: [], next_cursor: null };
    });
    await renderPath("/projects/p1?view=list&type=milestone");
    await waitFor(() => {
      expect(
        ticketsMock.mock.calls.some(
          (c) => c[1]?.type === "milestone" && c[1]?.limit === 50,
        ),
      ).toBe(true);
    });
    expect(screen.getByText("No milestones")).toBeInTheDocument();
    expect(screen.queryByText("List is empty")).toBeNull();
  });

  it("overview lists open milestones only", async () => {
    await renderView("overview");
    const heading = screen.getByRole("heading", { name: "Open milestones" });
    const section = heading.closest("section");
    expect(section).toBeTruthy();
    expect(within(section!).getByText("Milestone row")).toBeInTheDocument();
    expect(within(section!).queryByText("Done milestone")).toBeNull();
  });
});

