import { Agent } from "@cursor/sdk";

import type { WorkerJob, WorkerMessage } from "../job-types.js";
import { executeJob, toWorkerError, type WorkerSdk } from "./execute-job.js";

const sdk: WorkerSdk = {
  create: (options) => Agent.create(options),
  resume: (agentId, options) => Agent.resume(agentId, options),
  delete: (agentId, options) => Agent.delete(agentId, options),
};

function send(msg: WorkerMessage): void {
  if (typeof process.send === "function") {
    process.send(msg);
  }
}

process.on("message", (raw: unknown) => {
  void (async () => {
    const job = raw as WorkerJob;
    if (!job || typeof job !== "object" || !("type" in job)) {
      return;
    }
    try {
      const result = await executeJob(job, sdk, (accepted) => {
        send(accepted);
      });
      if (result.phase === "deleted") {
        send({
          requestId: result.requestId,
          phase: "deleted",
          agentId: result.agentId,
        });
        return;
      }
      send(result);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "phase" in error &&
        (error as { phase: string }).phase === "failed"
      ) {
        send(error as WorkerMessage);
        return;
      }
      send(toWorkerError(job.requestId, error));
    }
  })();
});

send({ phase: "ready" });
