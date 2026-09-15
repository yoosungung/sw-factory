import { describe, expect, it } from "vitest";
import { wrapSdkAgent } from "../src/sdk-backend";

describe("wrapSdkAgent", () => {
  it("calls send and dispose with agent as this", async () => {
    const agent = {
      agentId: "agent-test-1",
      marker: true,
      send(this: { marker?: boolean }, _text: string) {
        if (!this?.marker) throw new Error("lost this on send");
        return Promise.resolve({
          wait: async () => undefined,
          id: "run-1",
        });
      },
      async [Symbol.asyncDispose](this: {
        marker?: boolean;
        awaitPendingPrAttributions?: () => Promise<void>;
      }) {
        // Mirrors SDK: dispose body reads this.awaitPendingPrAttributions
        if (!this?.marker) {
          throw new TypeError(
            "Cannot read properties of undefined (reading 'awaitPendingPrAttributions')",
          );
        }
        await this.awaitPendingPrAttributions?.();
      },
      awaitPendingPrAttributions() {
        return Promise.resolve();
      },
    };

    const handle = wrapSdkAgent(agent);
    await expect(handle.send("hello")).resolves.toEqual({ runId: "run-1" });
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it("swallows dispose errors so recover cancel cannot kill the process", async () => {
    const agent = {
      agentId: "agent-test-2",
      send() {
        return Promise.resolve({ wait: async () => undefined, id: "run-2" });
      },
      async [Symbol.asyncDispose]() {
        throw new Error("dispose_boom");
      },
    };

    const handle = wrapSdkAgent(agent);
    await expect(handle.close()).resolves.toBeUndefined();
  });
});
