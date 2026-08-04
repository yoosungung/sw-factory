import { describe, expect, it } from "vitest";

import { CreateStormGuard, CreateThrottledError } from "../src/create-storm.js";

describe("CreateStormGuard", () => {
  it("allows creates under the limit", () => {
    const guard = new CreateStormGuard({ maxAttempts: 5, windowMs: 60_000, now: () => 1000 });
    for (let i = 0; i < 5; i += 1) {
      guard.beforeCreate(109);
    }
  });

  it("throttles after maxAttempts without progress", () => {
    const guard = new CreateStormGuard({ maxAttempts: 3, windowMs: 60_000, now: () => 1000 });
    guard.beforeCreate(109);
    guard.beforeCreate(109);
    guard.beforeCreate(109);
    expect(() => guard.beforeCreate(109)).toThrow(CreateThrottledError);
  });

  it("resets after markProgress", () => {
    const guard = new CreateStormGuard({ maxAttempts: 2, windowMs: 60_000, now: () => 1000 });
    guard.beforeCreate(109);
    guard.beforeCreate(109);
    guard.markProgress(109);
    guard.beforeCreate(109);
    guard.beforeCreate(109);
  });

  it("resets when the window elapses", () => {
    let now = 0;
    const guard = new CreateStormGuard({
      maxAttempts: 2,
      windowMs: 100,
      now: () => now,
    });
    guard.beforeCreate(1);
    guard.beforeCreate(1);
    now = 200;
    guard.beforeCreate(1);
  });
});
