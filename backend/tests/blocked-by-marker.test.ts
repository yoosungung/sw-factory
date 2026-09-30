import { describe, expect, it } from "vitest";
import {
  parseBlockedByIds,
  stripBlockedByMarker,
} from "../src/lib/blocked-by-marker";

describe("blocked-by soft marker", () => {
  it("parses ids", () => {
    expect(parseBlockedByIds("Goal\n\n<!-- blocked-by:a,b -->\n")).toEqual([
      "a",
      "b",
    ]);
    expect(parseBlockedByIds("no marker")).toEqual([]);
  });

  it("strips marker", () => {
    const out = stripBlockedByMarker("Goal\n\n<!-- blocked-by:old -->\n");
    expect(out).toBe("Goal");
    expect(out).not.toMatch(/blocked-by/);
  });
});
