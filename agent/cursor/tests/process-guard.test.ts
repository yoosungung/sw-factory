import { describe, expect, it, vi, afterEach } from "vitest";
import {
  formatGuardError,
  installProcessGuard,
  isTransientSdkSpawnError,
} from "../src/process-guard";

describe("isTransientSdkSpawnError", () => {
  it("matches spawn /bin/zsh ENOENT (observed SDK crash)", () => {
    const err = Object.assign(new Error("spawn /bin/zsh ENOENT"), {
      code: "ENOENT",
      errno: -2,
      syscall: "spawn",
      path: "/bin/zsh",
    });
    expect(isTransientSdkSpawnError(err)).toBe(true);
  });

  it("matches spawn bash ENOENT via message only", () => {
    expect(
      isTransientSdkSpawnError(new Error("spawn /bin/bash ENOENT")),
    ).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isTransientSdkSpawnError(new Error("oom"))).toBe(false);
    expect(isTransientSdkSpawnError("string")).toBe(false);
    expect(
      isTransientSdkSpawnError(
        Object.assign(new Error("EACCES"), { code: "EACCES", syscall: "open" }),
      ),
    ).toBe(false);
  });
});

describe("installProcessGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not exit on transient SDK spawn uncaughtException", () => {
    const exit = vi.fn();
    const log = vi.fn();
    const uninstall = installProcessGuard({
      exit: exit as unknown as (code: number) => never,
      log,
    });

    process.emit(
      "uncaughtException",
      Object.assign(new Error("spawn /bin/zsh ENOENT"), {
        code: "ENOENT",
        syscall: "spawn",
        path: "/bin/zsh",
      }),
    );

    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "process_guard",
        kind: "uncaughtException",
        keep_alive: true,
      }),
    );
    uninstall();
  });

  it("exits on unexpected uncaughtException", () => {
    const exit = vi.fn();
    const uninstall = installProcessGuard({
      exit: exit as unknown as (code: number) => never,
      log: vi.fn(),
    });

    process.emit("uncaughtException", new Error("fatal_boom"));
    expect(exit).toHaveBeenCalledWith(1);
    uninstall();
  });

  it("keeps alive on unhandledRejection with spawn ENOENT", async () => {
    const exit = vi.fn();
    const log = vi.fn();
    const uninstall = installProcessGuard({
      exit: exit as unknown as (code: number) => never,
      log,
    });

    const err = Object.assign(new Error("spawn /bin/zsh ENOENT"), {
      code: "ENOENT",
      syscall: "spawn",
      path: "/bin/zsh",
    });
    process.emit("unhandledRejection", err, Promise.resolve());

    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "process_guard",
        kind: "unhandledRejection",
        keep_alive: true,
      }),
    );
    uninstall();
  });

  it("formatGuardError includes cause chain codes", () => {
    const err = Object.assign(new Error("spawn failed"), {
      code: "ENOENT",
      path: "/bin/zsh",
    });
    expect(formatGuardError(err)).toContain("ENOENT");
    expect(formatGuardError(err)).toContain("/bin/zsh");
  });
});
