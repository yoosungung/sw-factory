import { describe, expect, it } from "vitest";
import { isTicketsView, parseViewMode } from "./view-mode";

describe("parseViewMode", () => {
  it("defaults missing/unknown to overview", () => {
    expect(parseViewMode(null)).toBe("overview");
    expect(parseViewMode("")).toBe("overview");
    expect(parseViewMode("nope")).toBe("overview");
  });

  it("accepts board, backlog, list", () => {
    expect(parseViewMode("board")).toBe("board");
    expect(parseViewMode("backlog")).toBe("backlog");
    expect(parseViewMode("list")).toBe("list");
  });

  it("maps legacy timeline deep link to list", () => {
    expect(parseViewMode("timeline")).toBe("list");
  });
});

describe("isTicketsView", () => {
  it("is false only for overview", () => {
    expect(isTicketsView("overview")).toBe(false);
    expect(isTicketsView("board")).toBe(true);
    expect(isTicketsView("list")).toBe(true);
  });
});
