import { describe, expect, it } from "vitest";
import { upsertBlockedByMarker } from "../mcp/blocked-by";

describe("upsertBlockedByMarker", () => {
  it("appends a marker when none exists", () => {
    expect(upsertBlockedByMarker("Goal", ["a", "b"])).toContain(
      "<!-- blocked-by:a,b -->",
    );
  });

  it("replaces an existing marker and clears with empty ids", () => {
    const withMark = upsertBlockedByMarker("Goal\n\n<!-- blocked-by:old -->\n", ["new"]);
    expect(withMark).toContain("<!-- blocked-by:new -->");
    expect(withMark).not.toContain("old");
    const cleared = upsertBlockedByMarker(withMark, []);
    expect(cleared).not.toMatch(/blocked-by/);
    expect(cleared).toContain("Goal");
  });
});
