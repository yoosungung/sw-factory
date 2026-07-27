/**
 * Detect Cursor SDK stale local-agent auth failures.
 * Kept free of `@cursor/sdk` runtime imports so the parent process stays SDK-free.
 * @see https://forum.cursor.com/t/163819
 */
export function isStaleAuthFailure(error: unknown): boolean {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: string }).name === "AuthenticationError"
  ) {
    return true;
  }
  const text = errorText(error).toLowerCase();
  if (text.length === 0) {
    return false;
  }
  return (
    text.includes("authentication error") ||
    text.includes("error_not_logged_in") ||
    text.includes("unauthenticated") ||
    text.includes("not logged in") ||
    text.includes("try logging out")
  );
}

/** True when run.wait() ended in the known idle-token / bare-error pattern. */
export function isStaleAuthRunResult(result: {
  status: string;
  error?: { message?: string; code?: string } | null;
  usage?: unknown;
}): boolean {
  if (result.status !== "error") {
    return false;
  }
  if (result.error?.message || result.error?.code) {
    return (
      isStaleAuthFailure(result.error.message ?? "") ||
      isStaleAuthFailure(result.error.code ?? "")
    );
  }
  return result.usage === undefined;
}

/** Worker done-message check for parent pool. */
export function doneLooksAuthStale(done: {
  status: string;
  error?: string;
  usage?: unknown;
}): boolean {
  return isStaleAuthRunResult({
    status: done.status,
    error: done.error ? { message: done.error } : undefined,
    usage: done.usage,
  });
}

function errorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "";
}
