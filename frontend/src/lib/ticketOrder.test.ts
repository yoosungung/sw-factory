import { describe, expect, it } from "vitest";
import { ticketsNewestFirst } from "./ticketOrder";

function t(id: string, created_at: string) {
  return { id, created_at };
}

describe("ticketsNewestFirst", () => {
  it("orders by created_at descending (newest first)", () => {
    const input = [
      t("old", "2026-01-01T00:00:00.000Z"),
      t("mid", "2026-06-01T12:00:00.000Z"),
      t("new", "2026-09-01T18:30:00.000Z"),
    ];
    expect(ticketsNewestFirst(input).map((x) => x.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks ties with id descending", () => {
    const same = "2026-05-01T00:00:00.000Z";
    const input = [t("aaa", same), t("zzz", same), t("mmm", same)];
    expect(ticketsNewestFirst(input).map((x) => x.id)).toEqual(["zzz", "mmm", "aaa"]);
  });

  it("does not mutate the input array", () => {
    const input = [t("a", "2026-01-01T00:00:00.000Z"), t("b", "2026-02-01T00:00:00.000Z")];
    const copy = [...input];
    ticketsNewestFirst(input);
    expect(input).toEqual(copy);
  });

  it("returns empty array for empty input", () => {
    expect(ticketsNewestFirst([])).toEqual([]);
  });
});
