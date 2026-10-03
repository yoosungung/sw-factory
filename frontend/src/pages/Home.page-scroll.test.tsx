import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, User } from "../api";
import { ProjectsHome } from "./Home";

const older: Project = {
  id: "aaa",
  client_id: "c1",
  name: "Older project",
  description: "",
  created_by: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
  role: "owner",
};

const newer: Project = {
  id: "zzz",
  client_id: "c1",
  name: "Newer project",
  description: "",
  created_by: "u1",
  created_at: "2026-06-01T00:00:00.000Z",
  role: "owner",
};

vi.mock("../hooks/useSession", () => ({
  useClients: () => ({
    clients: [{ id: "c1", name: "Space", description: "", created_by: "u1", created_at: "2026-01-01T00:00:00.000Z", role: "owner" }],
    reload: vi.fn(),
  }),
  useAllProjects: () => [newer, older],
}));

vi.mock("../components/chrome/AppChrome", () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div className="main">{children}</div>,
}));

const admin: User = {
  id: "u1",
  email: "admin@localhost",
  name: "Admin",
  created_at: "2026-01-01T00:00:00.000Z",
  is_admin: true,
};

afterEach(() => {
  cleanup();
});

describe("ProjectsHome scrollport and order", () => {
  it("keeps title and Create in the header; table scrolls in .page-scroll newest first", () => {
    const { container } = render(
      <MemoryRouter>
        <ProjectsHome user={admin} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    const header = container.querySelector(".page-header");
    expect(header?.querySelector("h1")?.textContent).toBe("Projects");
    expect(header?.contains(screen.getByRole("button", { name: "Create project" }))).toBe(true);

    const scroll = container.querySelector(".page-scroll");
    expect(scroll?.querySelector(".content-panel.tableish")).toBeTruthy();
    expect(header?.querySelector(".content-panel.tableish")).toBeNull();

    const names = [...container.querySelectorAll(".page-scroll .list-row.linkish .name-cell")].map(
      (el) => el.textContent,
    );
    expect(names[0]).toContain("Newer project");
    expect(names[1]).toContain("Older project");
  });
});
