import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    tickets: () => Promise.resolve({ tickets: [], next_cursor: null }),
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
});

async function renderView(view: "backlog" | "timeline") {
  const result = render(
    <MemoryRouter initialEntries={[`/projects/p1?view=${view}`]}>
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
});
