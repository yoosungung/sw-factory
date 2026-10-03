import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, Project } from "../../api";
import { Sidebar } from "./AppChrome";

afterEach(() => {
  cleanup();
});

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

function renderSidebar(collapsed: boolean) {
  const onToggle = vi.fn();
  render(
    <MemoryRouter>
      <Sidebar
        clients={clients}
        activeClient={clients[0]}
        activeProject={project}
        view="board"
        collapsed={collapsed}
        onToggle={onToggle}
      />
    </MemoryRouter>,
  );
  return onToggle;
}

const VISIBLE_LABEL = /접기|펴기|Collapse|Expand/;

describe("Sidebar collapse icons", () => {
  it("collapse control is icon-only with accessible name", () => {
    const onToggle = renderSidebar(false);
    const btn = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(btn.textContent).not.toMatch(VISIBLE_LABEL);
    expect(btn.querySelector("svg")).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("expand control is icon-only with accessible name", () => {
    const onToggle = renderSidebar(true);
    const btn = screen.getByRole("button", { name: "Expand sidebar" });
    expect(btn.textContent).not.toMatch(VISIBLE_LABEL);
    expect(btn.querySelector("svg")).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
