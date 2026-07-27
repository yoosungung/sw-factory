/**
 * Minimal IPC worker for WorkerPool unit tests (no @cursor/sdk).
 *
 * MOCK_WORKER_MODE=ok|auth_always
 * MOCK_AUTH_FLAG_FILE — if file exists, consume (unlink) and fail once (global across workers)
 * MOCK_AUTH_PHASE=wait — fail after accepted with done auth error
 * MOCK_WORKER_DELAY_MS — delay before response
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const mode = process.env.MOCK_WORKER_MODE ?? "ok";
const delayMs = Number(process.env.MOCK_WORKER_DELAY_MS ?? "0");
const flagFile = process.env.MOCK_AUTH_FLAG_FILE;

function send(msg) {
  process.send?.(msg);
}

function consumeAuthFlag() {
  if (!flagFile) {
    return false;
  }
  try {
    fs.unlinkSync(flagFile);
    return true;
  } catch {
    return false;
  }
}

process.on("message", (job) => {
  void (async () => {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (job.type === "delete") {
      send({
        requestId: job.requestId,
        phase: "deleted",
        agentId: job.agentId,
      });
      return;
    }

    const shouldAuthFail =
      mode === "auth_always" || consumeAuthFlag();

    if (shouldAuthFail) {
      if (process.env.MOCK_AUTH_PHASE === "wait") {
        const agentId = job.agentId ?? `mock-${randomUUID().slice(0, 8)}`;
        const runId = `run-${randomUUID().slice(0, 8)}`;
        send({
          requestId: job.requestId,
          phase: "accepted",
          agentId,
          runId,
        });
        send({
          requestId: job.requestId,
          phase: "done",
          agentId,
          runId,
          status: "error",
          error:
            "Authentication error If you are logged in, try logging out and back in.",
        });
        return;
      }
      send({
        requestId: job.requestId,
        phase: "failed",
        error:
          "Authentication error If you are logged in, try logging out and back in.",
        code: "auth",
      });
      return;
    }

    const agentId = job.agentId ?? `mock-${randomUUID().slice(0, 8)}`;
    const runId = `run-${randomUUID().slice(0, 8)}`;
    send({
      requestId: job.requestId,
      phase: "accepted",
      agentId,
      runId,
    });
    send({
      requestId: job.requestId,
      phase: "done",
      agentId,
      runId,
      status: "finished",
      resultPreview: "ok",
    });
  })();
});

send({ phase: "ready" });
