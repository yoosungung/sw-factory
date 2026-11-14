import { describe, expect, it, vi } from "vitest";
import {
  ensureTicketCreateOnce,
  unwrapTicketId,
} from "../mcp/ticket-id";

describe("unwrapTicketId", () => {
  it("reads nested ticket.id (Worker 201 wrap)", () => {
    expect(unwrapTicketId({ ticket: { id: "abc-123", title: "t" } })).toBe("abc-123");
  });

  it("rejects top-level id-only (legacy misparse target)", () => {
    expect(() => unwrapTicketId({ id: "bare" })).toThrow(/ticket\.id/);
  });

  it("rejects empty / missing", () => {
    expect(() => unwrapTicketId({})).toThrow(/ticket\.id/);
    expect(() => unwrapTicketId({ ticket: {} })).toThrow(/ticket\.id/);
    expect(() => unwrapTicketId(null)).toThrow(/ticket\.id/);
  });
});

describe("ensureTicketCreateOnce", () => {
  const projectId = "proj-1";
  const title = "candidate-escalation-drain 1100 KST (2026-11-14)";
  const date = "2026-11-14";

  it("reuses same-day same-title without POST", async () => {
    const create = vi.fn();
    const list = vi.fn().mockResolvedValue({
      tickets: [
        { id: "existing", title, date_from: date, status: "in_progress" },
        { id: "other", title: "other", date_from: date },
      ],
    });
    const got = await ensureTicketCreateOnce({
      projectId,
      title,
      dateFrom: date,
      body: { title, type: "task" },
      listTickets: list,
      createTicket: create,
    });
    expect(got).toEqual({ id: "existing", created: false, reused: true });
    expect(create).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("POSTs at most once and returns ticket.id", async () => {
    const create = vi.fn().mockResolvedValue({
      ticket: { id: "new-1", title },
    });
    const list = vi.fn().mockResolvedValue({ tickets: [] });
    const got = await ensureTicketCreateOnce({
      projectId,
      title,
      dateFrom: date,
      body: { title, type: "task" },
      listTickets: list,
      createTicket: create,
    });
    expect(got).toEqual({ id: "new-1", created: true, reused: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("on parse fail after POST: list/reuse, never second POST", async () => {
    const create = vi.fn().mockResolvedValue({ id: "wrong-shape" }); // legacy misparse shape
    const list = vi
      .fn()
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [{ id: "orphaned-but-real", title, date_from: date }],
      });
    const got = await ensureTicketCreateOnce({
      projectId,
      title,
      dateFrom: date,
      body: { title, type: "task" },
      listTickets: list,
      createTicket: create,
    });
    expect(got).toEqual({
      id: "orphaned-but-real",
      created: true,
      reused: true,
      parseRecovered: true,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("on parse fail with no list hit: throws without retrying POST", async () => {
    const create = vi.fn().mockResolvedValue({ id: "wrong-shape" });
    const list = vi.fn().mockResolvedValue({ tickets: [] });
    await expect(
      ensureTicketCreateOnce({
        projectId,
        title,
        dateFrom: date,
        body: { title, type: "task" },
        listTickets: list,
        createTicket: create,
      }),
    ).rejects.toThrow(/ticket\.id/);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
