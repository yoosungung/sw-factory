/** Goose A안: soft run budget / policy applied as prompt preamble. */

export interface RunBudget {
  max_turns?: number;
  timeout_ms?: number;
}

export interface RunPolicy {
  tool_classes?: string[];
  deny?: string[];
}

export interface RunSuccessRetry {
  max_attempts?: number;
}

export interface RunControl {
  budget?: RunBudget;
  policy?: RunPolicy;
  context_summary?: string;
  success_checks?: string[];
  success_retry?: RunSuccessRetry;
}

export function composeAgentPrompt(
  prompt: string,
  control?: RunControl | null,
): string {
  if (!control) {
    return prompt;
  }

  const parts: string[] = [];

  const summary = control.context_summary?.trim();
  if (summary) {
    parts.push("Context summary (do not treat as audit log replacement):");
    parts.push(summary);
  }

  const budgetLines: string[] = [];
  if (control.budget?.max_turns !== undefined) {
    budgetLines.push(
      `- Stay within about ${control.budget.max_turns} tool/model turns without further user input; then stop and report status.`,
    );
  }
  if (control.budget?.timeout_ms !== undefined) {
    budgetLines.push(
      `- Prefer finishing within ${control.budget.timeout_ms}ms wall time; if not done, leave a clear next-step comment.`,
    );
  }
  if (budgetLines.length > 0) {
    parts.push("Run budget (soft limit; honor unless blocked):");
    parts.push(...budgetLines);
  }

  const policyLines: string[] = [];
  if (control.policy?.tool_classes && control.policy.tool_classes.length > 0) {
    policyLines.push(
      `- Tool classes in scope: ${control.policy.tool_classes.join(", ")}.`,
    );
  }
  if (control.policy?.deny && control.policy.deny.length > 0) {
    policyLines.push(`- Do not do: ${control.policy.deny.join("; ")}.`);
  }
  if (policyLines.length > 0) {
    parts.push("Run policy:");
    parts.push(...policyLines);
  }

  if (parts.length === 0) {
    return prompt;
  }

  parts.push("---");
  parts.push(prompt);
  return parts.join("\n");
}

export function budgetLogFields(
  control?: RunControl | null,
): Record<string, unknown> {
  if (!control?.budget) {
    return {};
  }
  const out: Record<string, unknown> = {};
  if (control.budget.max_turns !== undefined) {
    out.budget_max_turns = control.budget.max_turns;
  }
  if (control.budget.timeout_ms !== undefined) {
    out.budget_timeout_ms = control.budget.timeout_ms;
  }
  return out;
}

export function parseRunControl(body: {
  budget?: RunBudget;
  policy?: RunPolicy;
  context_summary?: string;
  success_checks?: unknown;
  success_retry?: { max_attempts?: unknown };
}): RunControl | undefined {
  const control: RunControl = {};
  if (body.budget && typeof body.budget === "object") {
    control.budget = {};
    if (typeof body.budget.max_turns === "number") {
      control.budget.max_turns = body.budget.max_turns;
    }
    if (typeof body.budget.timeout_ms === "number") {
      control.budget.timeout_ms = body.budget.timeout_ms;
    }
    if (
      control.budget.max_turns === undefined &&
      control.budget.timeout_ms === undefined
    ) {
      delete control.budget;
    }
  }
  if (body.policy && typeof body.policy === "object") {
    control.policy = {};
    if (Array.isArray(body.policy.tool_classes)) {
      control.policy.tool_classes = body.policy.tool_classes.filter(
        (v): v is string => typeof v === "string",
      );
    }
    if (Array.isArray(body.policy.deny)) {
      control.policy.deny = body.policy.deny.filter(
        (v): v is string => typeof v === "string",
      );
    }
    if (
      (!control.policy.tool_classes || control.policy.tool_classes.length === 0) &&
      (!control.policy.deny || control.policy.deny.length === 0)
    ) {
      delete control.policy;
    }
  }
  if (typeof body.context_summary === "string" && body.context_summary.trim()) {
    control.context_summary = body.context_summary.trim();
  }
  if (Array.isArray(body.success_checks)) {
    const checks = body.success_checks.filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    if (checks.length > 0) {
      control.success_checks = checks;
    }
  }
  if (body.success_retry && typeof body.success_retry === "object") {
    const max = body.success_retry.max_attempts;
    if (typeof max === "number" && Number.isInteger(max) && max >= 0) {
      control.success_retry = { max_attempts: max };
    }
  }
  if (
    !control.budget &&
    !control.policy &&
    !control.context_summary &&
    !control.success_checks &&
    !control.success_retry
  ) {
    return undefined;
  }
  return control;
}
