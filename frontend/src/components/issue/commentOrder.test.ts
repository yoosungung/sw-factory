import { describe, expect, it } from "vitest";
import type { Comment } from "../../api";
import { commentsNewestFirst } from "./commentOrder";

function c(id: string, created_at: string): Comment {
  return {
    id,
    entity_type: "ticket",
    entity_id: "t1",
    body: id,
    author_id: "u1",
    author_name: "a",
    created_at,
  };
}

describe("commentsNewestFirst", () => {
  it("orders by created_at descending (newest first)", () => {
    const input = [
      c("old", "2026-01-01T00:00:00.000Z"),
      c("mid", "2026-06-01T00:00:00.000Z"),
      c("new", "2026-09-01T00:00:00.000Z"),
    ];
    expect(commentsNewestFirst(input).map((x) => x.id)).toEqual(["new", "mid", "old"]);
  });

  it("does not mutate the input array", () => {
    const input = [c("a", "2026-01-01T00:00:00.000Z"), c("b", "2026-02-01T00:00:00.000Z")];
    const copy = [...input];
    commentsNewestFirst(input);
    expect(input).toEqual(copy);
  });

  it("returns empty array for empty input", () => {
    expect(commentsNewestFirst([])).toEqual([]);
  });
});
