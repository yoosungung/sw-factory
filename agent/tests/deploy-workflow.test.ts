import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("deploy D1 migrations gate", () => {
  it("npm run deploy applies remote D1 migrations before wrangler deploy", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(__dirname, "../../package.json"), "utf8"),
    );
    const script = pkg.scripts.deploy as string;
    expect(script).toMatch(/d1 migrations apply\s+sw-factory\s+--remote/);
    const applyIdx = script.indexOf("d1 migrations apply");
    const deployIdx = script.indexOf("wrangler deploy");
    expect(applyIdx).toBeGreaterThan(-1);
    expect(deployIdx).toBeGreaterThan(applyIdx);
  });
});
