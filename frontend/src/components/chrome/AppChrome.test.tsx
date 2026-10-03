import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, Project, User } from "../../api";
import { AppChrome, Sidebar } from "./AppChrome";

afterEach(() => {
  cleanup();
});

const user: User = {
  id: "u1",
  email: "dev@example.com",
  name: "dev",
  created_at: "2026-01-01T00:00:00.000Z",
  is_admin: false,
};

const clients: Client[] = [
  {
    id: "c1",
    name: "Acme",
    description: "",
    created_by: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

const project: Project = {
  id: "p1",
  client_id: "c1",
  name: "Demo",
  description: "",
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
};

const VISIBLE_LABEL = /접기|펴기|Collapse|Expand/;

describe("Sidebar collapse icons", () => {
  it("collapse control is icon-only with accessible name", () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar
          clients={clients}
          activeClient={clients[0]}
          activeProject={project}
          view="board"
          collapsed={false}
          onToggle={onToggle}
        />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(btn.textContent).not.toMatch(VISIBLE_LABEL);
    expect(btn.querySelector("svg")).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("expand control is icon-only with accessible name", () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar
          clients={clients}
          activeClient={clients[0]}
          activeProject={project}
          view="board"
          collapsed
          onToggle={onToggle}
        />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: "Expand sidebar" });
    expect(btn.textContent).not.toMatch(VISIBLE_LABEL);
    expect(btn.querySelector("svg")).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe("Sidebar collapsed icon rail", () => {
  it("keeps Overview, Tickets, and Project settings as icon links", () => {
    render(
      <MemoryRouter>
        <Sidebar
          clients={clients}
          activeClient={clients[0]}
          activeProject={project}
          view="overview"
          collapsed
          onToggle={() => {}}
        />
      </MemoryRouter>,
    );

    const overview = screen.getByRole("link", { name: "Overview" });
    const tickets = screen.getByRole("link", { name: "Tickets" });
    const settings = screen.getByRole("link", { name: "Project settings" });
    expect(overview).toHaveAttribute("href", "/projects/p1");
    expect(tickets).toHaveAttribute("href", "/projects/p1?view=board");
    expect(settings).toHaveAttribute("href", "/projects/p1/settings/details");
    expect(overview).toHaveClass("active");
    expect(tickets).not.toHaveClass("active");
    expect(overview.textContent?.trim()).not.toMatch(/Overview/);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("marks Tickets active on board view", () => {
    render(
      <MemoryRouter>
        <Sidebar
          clients={clients}
          activeClient={clients[0]}
          activeProject={project}
          view="board"
          collapsed
          onToggle={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Tickets" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveClass("active");
  });

  it("shows Space settings icon on space-only context", () => {
    render(
      <MemoryRouter>
        <Sidebar
          clients={clients}
          activeClient={clients[0]}
          view="overview"
          collapsed
          onToggle={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Space settings" })).toHaveAttribute(
      "href",
      "/clients/c1/settings/details",
    );
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });
});

describe("AppChrome sidebar collapse", () => {
  it("restores the full sidebar after Expand", () => {
    render(
      <MemoryRouter>
        <AppChrome
          user={user}
          onLogout={() => {}}
          clients={clients}
          projects={[project]}
          activeClient={clients[0]}
          activeProject={project}
          view="overview"
        >
          <div>main</div>
        </AppChrome>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveTextContent("Overview");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("link", { name: "Overview" }).textContent?.trim()).not.toMatch(/Overview/);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("link", { name: "Overview" })).toHaveTextContent("Overview");
  });
});
