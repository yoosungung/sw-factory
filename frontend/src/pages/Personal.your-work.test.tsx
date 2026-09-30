import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Ticket, User } from "../api";
import { YourWorkPage, type ChromeFn } from "./Personal";

const projectsApi = vi.fn();
const ticketsApi = vi.fn();
const getTicketApi = vi.fn();
const recentProjectIdsMock = vi.fn();
const recentTicketIdsMock = vi.fn();

vi.mock("../api", () => ({
  client: {
    clients: async () => ({ clients: [] }),
    projects: () => projectsApi(),
    tickets: (...args: unknown[]) => ticketsApi(...args),
    getTicket: (...args: unknown[]) => getTicketApi(...args),
  },
}));

vi.mock("../lib/recent", () => ({
  recentProjectIds: () => recentProjectIdsMock(),
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
    recentProjectIdsMock.mockReset();
    recentTicketIdsMock.mockReset();
    projectsApi.mockResolvedValue({ projects: [project, emptyProject] });
    ticketsApi.mockImplementation(async (projectId: string) => ({
      tickets: projectId === project.id ? [ticket] : [],
    }));
    getTicketApi.mockResolvedValue({ ticket });
    recentProjectIdsMock.mockReturnValue(["p1", "p2"]);
    recentTicketIdsMock.mockReturnValue(["t1"]);
  });

  it("Assigned tab keeps Issue · Project · Status · Due headers aligned with rows", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText(ticket.title)).toBeInTheDocument());
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

  it("Recent projects shows description or No description placeholder", async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Recent projects" }));
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    const panel = container.querySelector(".your-work-projects") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.querySelector(".list-row.head")?.textContent).toMatch(/Project.*Description/s);
    expect(within(panel).getByText("Ship the grid")).toBeInTheDocument();
    expect(within(panel).getByText("No description")).toBeInTheDocument();
    expect(panel.querySelectorAll("a.list-row").length).toBe(2);
  });
});
