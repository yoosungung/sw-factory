import { describe, expect, it } from "vitest";

import {
  budgetLogFields,
  composeAgentPrompt,
  parseRunControl,
} from "../src/run-policy.js";

describe("composeAgentPrompt", () => {
  it("returns prompt unchanged without control", () => {
    expect(composeAgentPrompt("do work")).toBe("do work");
  });

  it("prepends budget, policy, and context summary", () => {
    const out = composeAgentPrompt("Active ticket_id=1", {
      context_summary: "PR #12 open; tests green.",
      budget: { max_turns: 20, timeout_ms: 600_000 },
      policy: {
        tool_classes: ["read", "local_write", "external_write"],
        deny: ["force-push", "git reset --hard"],
      },
    });
    expect(out).toContain("Context summary");
    expect(out).toContain("PR #12 open; tests green.");
    expect(out).toContain("about 20 tool/model turns");
    expect(out).toContain("600000ms");
    expect(out).toContain("read, local_write, external_write");
    expect(out).toContain("force-push");
    expect(out.endsWith("Active ticket_id=1")).toBe(true);
  });
});

describe("parseRunControl", () => {
  it("ignores empty body", () => {
    expect(parseRunControl({})).toBeUndefined();
  });

  it("parses budget and policy", () => {
    expect(
      parseRunControl({
        budget: { max_turns: 10 },
        policy: { deny: ["force-push"] },
        context_summary: " summary ",
      }),
    ).toEqual({
      budget: { max_turns: 10 },
      policy: { deny: ["force-push"] },
      context_summary: "summary",
    });
  });
});

describe("budgetLogFields", () => {
  it("maps budget for logs", () => {
    expect(budgetLogFields({ budget: { max_turns: 5, timeout_ms: 1000 } })).toEqual(
      {
        budget_max_turns: 5,
        budget_timeout_ms: 1000,
      },
    );
  });
});
