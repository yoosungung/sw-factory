import { describe, expect, it } from "vitest";

import { isStaleAuthFailure, isStaleAuthRunResult } from "../src/stale-auth.js";

describe("isStaleAuthFailure", () => {
  it("detects AuthenticationError-shaped errors", () => {
    const err = new Error("If you are logged in, try logging out and back in.");
    err.name = "AuthenticationError";
    expect(isStaleAuthFailure(err)).toBe(true);
  });

  it("detects known message substrings", () => {
    expect(
      isStaleAuthFailure(
        new Error("Authentication error If you are logged in, try logging out and back in."),
      ),
    ).toBe(true);
    expect(isStaleAuthFailure(new Error("[unauthenticated] Error"))).toBe(true);
    expect(isStaleAuthFailure(new Error("ERROR_NOT_LOGGED_IN"))).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isStaleAuthFailure(new Error("already has active run"))).toBe(false);
    expect(isStaleAuthFailure(new Error("model not found"))).toBe(false);
  });
});

describe("isStaleAuthRunResult", () => {
  it("detects wait() results with auth error payload", () => {
    expect(
      isStaleAuthRunResult({
        status: "error",
        error: {
          message: "Authentication error If you are logged in, try logging out and back in.",
        },
      }),
    ).toBe(true);
  });

  it("detects bare status=error without usage", () => {
    expect(isStaleAuthRunResult({ status: "error" })).toBe(true);
  });

  it("rejects finished runs and non-auth errors", () => {
    expect(isStaleAuthRunResult({ status: "finished", result: "ok" } as never)).toBe(
      false,
    );
    expect(
      isStaleAuthRunResult({
        status: "error",
        error: { message: "tool failed: permission denied" },
      }),
    ).toBe(false);
  });
});
