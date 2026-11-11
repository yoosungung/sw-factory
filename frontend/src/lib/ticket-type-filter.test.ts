import { describe, expect, it } from "vitest";
import { matchesTicketTypeFilter, parseTicketTypeFilter } from "./ticket-type-filter";

describe("parseTicketTypeFilter", () => {
  it("accepts task and milestone; everything else is all", () => {
    expect(parseTicketTypeFilter("task")).toBe("task");
    expect(parseTicketTypeFilter("milestone")).toBe("milestone");
    expect(parseTicketTypeFilter(null)).toBe("all");
    expect(parseTicketTypeFilter("")).toBe("all");
    expect(parseTicketTypeFilter("epic")).toBe("all");
  });
});

describe("matchesTicketTypeFilter", () => {
  it("filters by exact type unless all", () => {
    expect(matchesTicketTypeFilter("task", "all")).toBe(true);
    expect(matchesTicketTypeFilter("milestone", "all")).toBe(true);
    expect(matchesTicketTypeFilter("task", "task")).toBe(true);
    expect(matchesTicketTypeFilter("milestone", "task")).toBe(false);
    expect(matchesTicketTypeFilter("milestone", "milestone")).toBe(true);
  });
});
