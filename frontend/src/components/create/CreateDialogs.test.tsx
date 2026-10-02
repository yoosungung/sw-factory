import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, Project } from "../../api";
import { CreateIssueDialog } from "./CreateDialogs";

afterEach(() => {
  cleanup();
});

const createTicket = vi.fn(async () => ({
  ticket: { id: "t-new", project_id: "p1", title: "Hello" },
}));

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    client: {
      projectMembers: vi.fn(async () => ({ members: [] })),
      projectStatuses: vi.fn(async () => ({
        statuses: [
          { key: "backlog", label: "Backlog", category: "backlog", sort_order: 0 },
          { key: "in_progress", label: "In Progress", category: "active", sort_order: 1 },
        ],
      })),
      createTicket: (...args: unknown[]) => createTicket(...args),
    },
  };
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

const projects: Project[] = [
  {
    id: "p1",
    client_id: "c1",
    name: "Demo",
    description: "",
    created_by: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

function renderDialog(props: Partial<Parameters<typeof CreateIssueDialog>[0]> = {}) {
  return render(
    <CreateIssueDialog
      clients={clients}
      projects={projects}
      defaultProjectId="p1"
      docked={false}
      onDock={() => {}}
      onClose={() => {}}
      onCreated={() => {}}
      {...props}
    />,
  );
}

describe("CreateIssueDialog compact Description", () => {
  beforeEach(() => {
    createTicket.mockClear();
  });

  it("shows Description below Summary in compact Task create", () => {
    renderDialog();
    const body = document.querySelector(".create-dialog-body") as HTMLElement;
    const fieldOrder = [...body.querySelectorAll("label")]
      .map((label) => label.childNodes[0]?.textContent?.trim())
      .filter(Boolean);

    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Status/)).toBeNull();

    const summaryIdx = fieldOrder.indexOf("Summary");
    const descriptionIdx = fieldOrder.indexOf("Description");
    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(descriptionIdx).toBe(summaryIdx + 1);
  });

  it("creates with description from compact form without expand", async () => {
    const onCreated = vi.fn();
    renderDialog({ onCreated });

    fireEvent.change(screen.getByPlaceholderText(/What needs to be done/), {
      target: { value: "Ship desc" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Add a description \(Markdown\)/), {
      target: { value: "Body from compact" },
    });
    fireEvent.submit(document.querySelector("form.create-dialog")!);

    await waitFor(() => {
      expect(createTicket).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          title: "Ship desc",
          description: "Body from compact",
          type: "task",
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith("p1", "t-new");
  });

  it("keeps a single Description field when expanded", () => {
    renderDialog();
    fireEvent.click(screen.getByTitle(/Full form/i));
    expect(screen.getAllByLabelText(/^Description/)).toHaveLength(1);
    expect(screen.getByLabelText(/^Status/)).toBeInTheDocument();
  });
});
