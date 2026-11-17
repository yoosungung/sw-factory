import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAgentsYaml } from "../../shared/load-config";

const examplePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deploy/agents.yaml.example",
);

describe("deploy/agents.yaml.example mm wiring", () => {
  it("includes mm sessions agent with workspace and repo_ids", async () => {
    const file = await loadAgentsYaml(examplePath);
    const mm = file.agents.find((a) => a.name === "mm");
    expect(mm).toBeDefined();
    expect(mm?.type).toBe("sessions");
    expect(mm?.persona).toBe("mm");
    expect(mm?.workspace).toMatch(/mm/);
    expect(mm?.repo_ids?.length ?? 0).toBeGreaterThan(0);
  });

  it("includes weekly mm-topic-radar schedule targeting mm", async () => {
    const file = await loadAgentsYaml(examplePath);
    const sched = file.settings.schedules?.find((s) => s.id === "mm-topic-radar");
    expect(sched).toBeDefined();
    expect(sched?.agents).toEqual(["mm"]);
    // weekly UTC: day-of-week field set (5-field cron)
    expect(sched?.cron.split(/\s+/)).toHaveLength(5);
    expect(sched?.cron.split(/\s+/)[4]).not.toBe("*");
    expect(sched?.prompt.toLowerCase()).toMatch(/topic-radar/);
  });
});
