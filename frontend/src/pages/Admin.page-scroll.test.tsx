import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api";
import { AdminPage } from "./Admin";

const adminUsersApi = vi.fn();

vi.mock("../api", () => ({
  client: {
    adminUsers: () => adminUsersApi(),
    createClient: vi.fn(),
    patchAdminUser: vi.fn(),
  },
}));

const admin: User = {
  id: "u-admin",
  email: "admin@localhost",
  name: "Admin",
  created_at: "2026-01-01T00:00:00.000Z",
  is_admin: true,
};

const member: User = {
  id: "u-member",
  email: "member@example.com",
  name: "Member",
  created_at: "2026-02-01T00:00:00.000Z",
  is_admin: false,
};

afterEach(() => {
  cleanup();
});

describe("AdminPage scrollport", () => {
  it("keeps title and Create space in the header; table scrolls in .page-scroll", async () => {
    adminUsersApi.mockResolvedValue({ users: [admin, member] });
    const { container } = render(
      <MemoryRouter>
        <AdminPage user={admin} chrome={({ children }) => <div className="main">{children}</div>} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(member.email)).toBeInTheDocument());

    const header = container.querySelector(".page-header");
    expect(header).toBeTruthy();
    expect(header?.querySelector("h1")?.textContent).toBe("Admin");
    expect(screen.getByRole("button", { name: "Create space" })).toBeTruthy();
    expect(header?.contains(screen.getByRole("button", { name: "Create space" }))).toBe(true);

    const scroll = container.querySelector(".page-scroll");
    expect(scroll).toBeTruthy();
    expect(scroll?.querySelector(".content-panel.tableish")).toBeTruthy();
    expect(header?.querySelector(".content-panel.tableish")).toBeNull();
    expect(scroll?.textContent).toContain(member.email);
  });
});
