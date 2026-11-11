import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "../../api";
import { TicketPicker, filterRecentOpenTickets } from "./TicketPicker";

afterEach(() => {
  cleanup();
});

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    client: {
      tickets: vi.fn(),
      search: vi.fn(),
    },
  };
});

function ticket(partial: Partial<Ticket> & Pick<Ticket, "id" | "title" | "created_at">): Ticket {
  return {
    project_id: "p1",
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
    updated_at: partial.created_at,
    ...partial,
  };
}

describe("filterRecentOpenTickets", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");

  it("keeps tickets created within 7 days and excludes ids", () => {
    const recent = ticket({
      id: "recent-1",
      title: "Recent",
      created_at: "2026-11-10T00:00:00.000Z",
    });
    const old = ticket({
      id: "old-1",
      title: "Old",
      created_at: "2026-10-01T00:00:00.000Z",
    });
    const self = ticket({
      id: "self",
      title: "Self",
      created_at: "2026-11-11T00:00:00.000Z",
    });
    expect(
      filterRecentOpenTickets([recent, old, self], {
        excludeIds: ["self"],
        now,
        days: 7,
      }).map((t) => t.id),
    ).toEqual(["recent-1"]);
  });
});

describe("TicketPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads exclude_done candidates, filters to 7d, and picks from combo", async () => {
    const { client } = await import("../../api");
    const onPick = vi.fn();
    vi.mocked(client.tickets).mockResolvedValue({
      tickets: [
        ticket({
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          title: "Alpha Task",
          created_at: "2026-11-10T00:00:00.000Z",
        }),
        ticket({
          id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
          title: "Stale Task",
          created_at: "2026-01-01T00:00:00.000Z",
        }),
        ticket({
          id: "self-ticket",
          title: "Self",
          created_at: "2026-11-11T00:00:00.000Z",
        }),
      ],
    });

    render(
      <TicketPicker
        projectId="p1"
        excludeIds={["self-ticket"]}
        ariaLabel="Pick ticket"
        confirmLabel="Set"
        onPick={onPick}
      />,
    );

    const input = screen.getByRole("combobox", { name: /Pick ticket/i });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(client.tickets).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ exclude_done: true }),
      );
    });

    expect(await screen.findByRole("option", { name: /Alpha Task/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Stale Task/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /^Self$/i })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /Alpha Task/i }));
    expect(onPick).toHaveBeenCalledWith("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("allows UUID paste fallback via confirm button", async () => {
    const { client } = await import("../../api");
    const onPick = vi.fn();
    vi.mocked(client.tickets).mockResolvedValue({ tickets: [] });

    render(
      <TicketPicker
        projectId="p1"
        excludeIds={[]}
        ariaLabel="Parent ticket"
        confirmLabel="Set parent"
        onPick={onPick}
      />,
    );

    const pasted = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    fireEvent.change(screen.getByRole("combobox", { name: /Parent ticket/i }), {
      target: { value: pasted },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Set parent$/i }));
    expect(onPick).toHaveBeenCalledWith(pasted);
  });

  it("typeahead falls back to project search when local 7d list misses", async () => {
    const { client } = await import("../../api");
    const onPick = vi.fn();
    vi.mocked(client.tickets).mockResolvedValue({ tickets: [] });
    vi.mocked(client.search).mockResolvedValue({
      clients: [],
      projects: [],
      tickets: [
        ticket({
          id: "old-but-match",
          title: "Ancient Match",
          project_id: "p1",
          created_at: "2025-01-01T00:00:00.000Z",
        }),
        ticket({
          id: "other-proj",
          title: "Ancient Match",
          project_id: "p2",
          created_at: "2025-01-01T00:00:00.000Z",
        }),
      ],
    });

    render(
      <TicketPicker
        projectId="p1"
        excludeIds={[]}
        ariaLabel="Link child"
        confirmLabel="Link child"
        onPick={onPick}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: /Link child/i }), {
      target: { value: "Ancient" },
    });

    expect(await screen.findByRole("option", { name: /Ancient Match/i })).toBeInTheDocument();
    expect(client.search).toHaveBeenCalledWith("Ancient", expect.any(Number));
    fireEvent.click(screen.getByRole("option", { name: /Ancient Match/i }));
    expect(onPick).toHaveBeenCalledWith("old-but-match");
  });
});
