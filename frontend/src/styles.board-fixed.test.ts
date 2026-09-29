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

describe("board fixed column width and card height", () => {
  it("desktop board uses fixed column track (not fluid 1fr)", () => {
    const body = ruleBody(".board");
    expect(body).toMatch(/grid-auto-columns:\s*280px/);
    expect(body).not.toMatch(/minmax\(/);
  });

  it("issue-card has fixed height with overflow clipped", () => {
    const body = ruleBody(".issue-card");
    expect(body).toMatch(/height:\s*108px/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });

  it("title keeps multi-line clamp with ellipsis", () => {
    const body = ruleBody(".issue-card .title");
    expect(body).toMatch(/-webkit-line-clamp:\s*2/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });

  it("tablet max-width 1024 uses 260px columns", () => {
    expect(css).toMatch(
      /@media\s*\(\s*max-width:\s*1024px\s*\)[\s\S]*?\.board\s*\{[^}]*grid-auto-columns:\s*260px/,
    );
  });

  it("mobile max-width 767 uses 240px columns", () => {
    expect(css).toMatch(
      /@media\s*\(\s*max-width:\s*767px\s*\)[\s\S]*?\.board\s*\{[^}]*grid-auto-columns:\s*240px/,
    );
  });
});
