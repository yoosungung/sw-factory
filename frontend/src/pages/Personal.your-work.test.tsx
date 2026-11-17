import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectStatus, Ticket, User } from "../api";
import { YourWorkPage, type ChromeFn } from "./Personal";

const projectsApi = vi.fn();
const ticketsApi = vi.fn();
const getTicketApi = vi.fn();
const kanbanApi = vi.fn();
const recentTicketIdsMock = vi.fn();

vi.mock("../api", () => ({
  client: {
    clients: async () => ({ clients: [] }),
    projects: () => projectsApi(),
    tickets: (...args: unknown[]) => ticketsApi(...args),
    getTicket: (...args: unknown[]) => getTicketApi(...args),
    kanban: (...args: unknown[]) => kanbanApi(...args),
  },
}));

vi.mock("../lib/recent", () => ({
  recentTicketIds: () => recentTicketIdsMock(),
}));

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
  name: "Alpha",
  description: "Ship the grid",
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
};

const emptyProject: Project = {
  id: "p2",
  client_id: "c1",
  name: "Beta",
  description: "",
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ticket: Ticket = {
  id: "t1",
  project_id: "p1",
  title: "Polish Your work columns",
  description: "",
  type: "task",
  status: "in_progress",
  priority: "medium",
  sort_order: 0,
  milestone_id: null,
  assignee_id: "u1",
  due_at: "2026-10-01",
  date_from: null,
  date_to: null,
  version: 1,
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const statuses: ProjectStatus[] = [
  { key: "backlog", label: "Backlog", category: "backlog", sort_order: 0 },
  { key: "in_progress", label: "In progress", category: "active", sort_order: 1 },
  { key: "done", label: "Done", category: "done", sort_order: 2 },
];

const openMilestone: Ticket = {
  ...ticket,
  id: "m-open",
  title: "Ship MVP",
  type: "milestone",
  status: "in_progress",
};

const doneMilestone: Ticket = {
  ...ticket,
  id: "m-done",
  title: "Done milestone",
  type: "milestone",
  status: "done",
};

const chrome: ChromeFn = ({ children }) => <div>{children}</div>;

function renderPage() {
  return render(
    <MemoryRouter>
      <YourWorkPage user={user} onLogout={() => {}} chrome={chrome} />
    </MemoryRouter>,
  );
}

describe("YourWorkPage grid UX", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    projectsApi.mockReset();
    ticketsApi.mockReset();
    getTicketApi.mockReset();
    kanbanApi.mockReset();
    recentTicketIdsMock.mockReset();
    projectsApi.mockResolvedValue({ projects: [project, emptyProject] });
    ticketsApi.mockImplementation(async (projectId: string, opts?: { assignee_id?: string; created_by?: string; type?: string }) => {
      if (opts?.type === "milestone") {
        return { tickets: projectId === project.id ? [openMilestone, doneMilestone] : [] };
      }
      return { tickets: projectId === project.id ? [ticket] : [] };
    });
    getTicketApi.mockResolvedValue({ ticket });
    kanbanApi.mockImplementation(async (projectId: string) => ({
      statuses,
      columns:
        projectId === project.id
          ? { backlog: [], in_progress: [ticket], done: [] }
          : { backlog: [], in_progress: [], done: [] },
    }));
    recentTicketIdsMock.mockReturnValue(["t1"]);
  });

  it("Assigned tab requests tickets with exclude_done", async () => {
    renderPage();
    await waitFor(() => expect(ticketsApi).toHaveBeenCalled());
    const assignedCalls = ticketsApi.mock.calls.filter(
      (args) => (args[1] as { assignee_id?: string } | undefined)?.assignee_id === "me",
    );
    expect(assignedCalls.length).toBeGreaterThan(0);
    for (const args of assignedCalls) {
      expect(args[1]).toMatchObject({ assignee_id: "me", exclude_done: true });
    }
    const createdCalls = ticketsApi.mock.calls.filter(
      (c) => (c[1] as { created_by?: string } | undefined)?.created_by === "me",
    );
    for (const args of createdCalls) {
      expect(args[1]).not.toHaveProperty("exclude_done", true);
    }
  });

  it("Assigned tab keeps Issue · Project · Status · Due headers aligned with rows", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText(ticket.title)).toBeInTheDocument());
    expect(container.querySelector(".page-scroll .your-work-issues")).toBeTruthy();
    const panel = container.querySelector(".your-work-issues");
    expect(panel).toBeTruthy();
    const head = panel!.querySelector(".list-row.head");
    expect(head?.textContent).toContain("Issue");
    expect(head?.textContent).toContain("Project");
    expect(head?.textContent).toContain("Status");
    expect(head?.textContent).toContain("Due");
    const row = panel!.querySelector("a.list-row");
    expect(row?.children).toHaveLength(4);
  });

  it("Assigned tab shows tickets newest-created first across projects", async () => {
    const older: Ticket = {
      ...ticket,
      id: "t-old",
      title: "Older assigned",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const newer: Ticket = {
      ...ticket,
      id: "t-new",
      project_id: emptyProject.id,
      title: "Newer assigned",
      created_at: "2026-09-15T12:00:00.000Z",
    };
    ticketsApi.mockImplementation(async (projectId: string) => ({
      tickets: projectId === project.id ? [older] : projectId === emptyProject.id ? [newer] : [],
    }));
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Newer assigned")).toBeInTheDocument());
    const titles = [...container.querySelectorAll(".your-work-issues a.list-row .your-work-issue-title")].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Newer assigned", "Older assigned"]);
  });

  it("Recently viewed adds the same 4-column header as Assigned", async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Recently viewed" }));
    await waitFor(() => expect(screen.getByText(ticket.title)).toBeInTheDocument());
    const panel = container.querySelector(".your-work-issues");
    expect(panel?.querySelector(".list-row.head")?.textContent).toMatch(/Issue.*Project.*Status.*Due/s);
    expect(panel?.querySelector("a.list-row")?.children).toHaveLength(4);
  });

  it("Overviews tab replaces Recent projects and shows membership pulse", async () => {
    const { container } = renderPage();
    expect(screen.queryByRole("button", { name: "Recent projects" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Overviews" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("href", "/projects/p2");
    expect(kanbanApi).toHaveBeenCalled();
    const alphaSection = container.querySelector('[data-project-id="p1"]') as HTMLElement;
    expect(alphaSection).toBeTruthy();
    expect(within(alphaSection).getByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(within(alphaSection).getByText(ticket.title)).toBeInTheDocument();
    expect(within(alphaSection).getByRole("heading", { name: "Open milestones" })).toBeInTheDocument();
    expect(within(alphaSection).getByText("Ship MVP")).toBeInTheDocument();
    expect(within(alphaSection).queryByText("Done milestone")).toBeNull();
    const betaSection = container.querySelector('[data-project-id="p2"]') as HTMLElement;
    expect(within(betaSection).getByText("Nothing in progress")).toBeInTheDocument();
    expect(within(betaSection).getByText("No open milestones")).toBeInTheDocument();
    const sectionEmpties = within(betaSection).getAllByTestId("empty-state");
    expect(sectionEmpties).toHaveLength(2);
    for (const el of sectionEmpties) {
      expect(el).toHaveClass("empty-state--compact");
    }
  });

  it("Overviews caps In progress and Open milestones at 5 each", async () => {
    const manyActive = Array.from({ length: 7 }, (_, i) => ({
      ...ticket,
      id: `active-${i}`,
      title: `Active ${i}`,
    }));
    const manyMs = Array.from({ length: 7 }, (_, i) => ({
      ...openMilestone,
      id: `ms-${i}`,
      title: `Milestone ${i}`,
      status: "in_progress" as const,
    }));
    projectsApi.mockResolvedValue({ projects: [project] });
    kanbanApi.mockResolvedValue({
      statuses,
      columns: { backlog: [], in_progress: manyActive, done: [] },
    });
    ticketsApi.mockImplementation(async (_projectId: string, opts?: { type?: string }) => {
      if (opts?.type === "milestone") return { tickets: manyMs };
      return { tickets: [] };
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Overviews" }));
    await waitFor(() => expect(screen.getByText("Active 0")).toBeInTheDocument());
    expect(screen.getByText("Active 4")).toBeInTheDocument();
    expect(screen.queryByText("Active 5")).toBeNull();
    expect(screen.getByText("Milestone 0")).toBeInTheDocument();
    expect(screen.getByText("Milestone 4")).toBeInTheDocument();
    expect(screen.queryByText("Milestone 5")).toBeNull();
  });

  it("Overviews shows empty membership state", async () => {
    projectsApi.mockResolvedValue({ projects: [] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Overviews" }));
    await waitFor(() => expect(screen.getByText("No projects yet")).toBeInTheDocument());
    const empty = screen.getByTestId("empty-state");
    expect(empty).not.toHaveClass("empty-state--compact");
  });
});
