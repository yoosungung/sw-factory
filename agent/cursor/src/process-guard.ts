/**
 * Keep the cursor parent HTTP process alive when @cursor/sdk child shells
 * throw uncaught spawn errors (e.g. `spawn /bin/zsh ENOENT`).
 *
 * R1–R5 recover sessions inside a live parent; this guard is process-level.
 */

export type ProcessGuardOpts = {
  /** Injected for tests. Default: process.exit */
  exit?: (code: number) => void;
  /** Injected for tests. Default: console.error JSON line */
  log?: (payload: Record<string, unknown>) => void;
};

const SHELL_BASENAMES = new Set(["zsh", "bash", "sh", "dash"]);

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function formatGuardError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  const code =
    "code" in err && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;
  const path =
    "path" in err && typeof (err as { path?: unknown }).path === "string"
      ? (err as { path: string }).path
      : undefined;
  const syscall =
    "syscall" in err && typeof (err as { syscall?: unknown }).syscall === "string"
      ? (err as { syscall: string }).syscall
      : undefined;
  if (code) parts.push(`code=${code}`);
  if (syscall) parts.push(`syscall=${syscall}`);
  if (path) parts.push(`path=${path}`);
  return parts.join(" ");
}

/** Observed killer: SDK sandbox `spawn /bin/zsh ENOENT` (and bash/sh cousins). */
export function isTransientSdkSpawnError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code =
    "code" in err && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;
  const path =
    "path" in err && typeof (err as { path?: unknown }).path === "string"
      ? (err as { path: string }).path
      : undefined;
  const syscall =
    "syscall" in err && typeof (err as { syscall?: unknown }).syscall === "string"
      ? (err as { syscall: string }).syscall
      : undefined;

  if (code === "ENOENT" && syscall?.startsWith("spawn") && path) {
    if (SHELL_BASENAMES.has(basename(path))) return true;
  }

  // Message fallback when fields are stripped
  const msg = err.message;
  if (/spawn\s+\S*(zsh|bash|sh)\S*\s+ENOENT/i.test(msg)) return true;
  if (/ENOENT/.test(msg) && /spawn/i.test(msg) && /(zsh|bash|\/sh\b)/i.test(msg)) {
    return true;
  }
  return false;
}

/**
 * Install process listeners. Returns uninstall().
 * Transient SDK spawn errors → log + keep alive; others → log + exit(1).
 */
export function installProcessGuard(opts: ProcessGuardOpts = {}): () => void {
  const exitFn = opts.exit ?? ((code: number) => process.exit(code));
  const logFn =
    opts.log ??
    ((payload: Record<string, unknown>) => {
      console.error(JSON.stringify(payload));
    });

  const handle = (kind: "uncaughtException" | "unhandledRejection", err: unknown) => {
    const keep = isTransientSdkSpawnError(err);
    logFn({
      msg: "process_guard",
      kind,
      keep_alive: keep,
      error: formatGuardError(err),
    });
    if (!keep) exitFn(1);
  };

  const onUncaught = (err: Error) => handle("uncaughtException", err);
  const onRejection = (reason: unknown) => handle("unhandledRejection", reason);

  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);

  return () => {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onRejection);
  };
}
