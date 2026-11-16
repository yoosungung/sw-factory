import { describe, expect, it } from "vitest";
import { formatListDue } from "./list-due";

describe("formatListDue", () => {
  it("prefers due_at", () => {
    expect(
      formatListDue({
        due_at: "2026-12-01",
        date_from: "2026-10-01",
        date_to: "2026-10-10",
      }),
    ).toBe("2026-12-01");
  });

  it("falls back to date_from → date_to when due_at missing", () => {
    expect(
      formatListDue({
        due_at: null,
        date_from: "2026-10-01",
        date_to: "2026-10-10",
      }),
    ).toBe("2026-10-01 → 2026-10-10");
  });

  it("returns em dash when no dates", () => {
    expect(formatListDue({ due_at: null, date_from: null, date_to: null })).toBe("—");
  });
});
