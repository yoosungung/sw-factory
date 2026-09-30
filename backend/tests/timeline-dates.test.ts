import { describe, expect, it } from "vitest";
import { resolveTimelineDates, utcDateFromIso } from "../src/lib/timeline-dates";

describe("utcDateFromIso", () => {
  it("takes the UTC calendar date from an ISO timestamp", () => {
    expect(utcDateFromIso("2026-09-30T12:04:32.020Z")).toBe("2026-09-30");
  });
});

describe("resolveTimelineDates", () => {
  const nowIso = "2026-09-30T15:00:00.000Z";
  const createdAtIso = "2026-09-01T08:00:00.000Z";

  it("fills from created_at and to today when creating in backlog without body dates", () => {
    const r = resolveTimelineDates({
      existingFrom: null,
      existingTo: null,
      bodyHasFrom: false,
      bodyHasTo: false,
      createdAtIso,
      nowIso,
      nextCategory: "backlog",
      prevCategory: null,
    });
    expect(r.date_from).toBe("2026-09-01");
    expect(r.date_to).toBe("2026-09-30");
  });

  it("uses created_at for date_from when backlog is skipped", () => {
    const r = resolveTimelineDates({
      existingFrom: null,
      existingTo: null,
      bodyHasFrom: false,
      bodyHasTo: false,
      createdAtIso,
      nowIso,
      nextCategory: "active",
      prevCategory: null,
    });
    expect(r.date_from).toBe("2026-09-01");
    expect(r.date_to).toBe("2026-09-30");
  });

  it("does not overwrite explicit body dates", () => {
    const r = resolveTimelineDates({
      existingFrom: null,
      existingTo: null,
      bodyHasFrom: true,
      bodyHasTo: true,
      bodyFrom: "2026-01-01",
      bodyTo: "2026-01-15",
      createdAtIso,
      nowIso,
      nextCategory: "backlog",
      prevCategory: null,
    });
    expect(r).toEqual({ date_from: "2026-01-01", date_to: "2026-01-15" });
  });

  it("keeps stored dates on status-only patch when they are a custom range", () => {
    const r = resolveTimelineDates({
      existingFrom: "2026-01-01",
      existingTo: "2026-01-15",
      bodyHasFrom: false,
      bodyHasTo: false,
      createdAtIso,
      nowIso,
      nextCategory: "done",
      prevCategory: "active",
    });
    expect(r).toEqual({ date_from: "2026-01-01", date_to: "2026-01-15" });
  });

  it("sets date_to to today on first done when prior date_to matched created_at (auto open bar)", () => {
    const r = resolveTimelineDates({
      existingFrom: "2026-09-01",
      existingTo: "2026-09-01",
      bodyHasFrom: false,
      bodyHasTo: false,
      createdAtIso,
      nowIso,
      nextCategory: "done",
      prevCategory: "active",
    });
    expect(r.date_from).toBe("2026-09-01");
    expect(r.date_to).toBe("2026-09-30");
  });

  it("sets date_from to now on first backlog enter when empty", () => {
    const r = resolveTimelineDates({
      existingFrom: null,
      existingTo: null,
      bodyHasFrom: false,
      bodyHasTo: false,
      createdAtIso,
      nowIso,
      nextCategory: "backlog",
      prevCategory: "active",
    });
    expect(r.date_from).toBe("2026-09-30");
    expect(r.date_to).toBe("2026-09-30");
  });
});
