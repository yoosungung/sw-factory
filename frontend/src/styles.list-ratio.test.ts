import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "styles.css");
const css = readFileSync(cssPath, "utf8");

function ruleBody(selector: string): string {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  );
  const m = css.match(re);
  if (!m) throw new Error(`missing CSS rule for ${selector}`);
  return m[1];
}

describe("list column ratio scopes", () => {
  it("history-list uses 2 columns with content as 1fr and timestamp auto", () => {
    const body = ruleBody(".history-list .list-row");
    expect(body).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  });

  it("overview active list uses 3 columns with title as main 1fr", () => {
    const body = ruleBody(".overview-active-list .list-row");
    expect(body).toMatch(
      /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/,
    );
  });

  it("your-work issues list uses Issue as main minmax(0,1fr) plus 3 auxiliary cols", () => {
    const body = ruleBody(".your-work-issues .list-row");
    expect(body).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/,
    );
  });

  it("your-work projects list uses name · description · action columns", () => {
    const body = ruleBody(".your-work-projects .list-row");
    expect(body).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s+minmax\(0,\s*1fr\)\s+auto/,
    );
  });
});
