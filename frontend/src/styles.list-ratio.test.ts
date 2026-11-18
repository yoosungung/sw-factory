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

  it("your-work overviews pulse rows use title · status columns", () => {
    const body = ruleBody(".your-work-overviews .overview-active-list .list-row");
    expect(body).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  });

  it("empty-state--compact drops full-page min-height", () => {
    const body = ruleBody(".empty-state--compact");
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).not.toMatch(/min-height:\s*240px/);
  });

  it("overview-active-list softens title-column weight and tracking", () => {
    const body = ruleBody(".overview-active-list .list-row");
    expect(body).toMatch(/font-weight:\s*400/);
    expect(body).toMatch(/letter-spacing:\s*0\.01em/);
  });

  it("overview-active-list gives rows more left inset than base list-row", () => {
    const body = ruleBody(".overview-active-list .list-row");
    // Explicit left ≥24px so title/key are not flush to the panel edge
    // (rework: previous 8px 12px was tighter than base 12px 16px).
    expect(body).toMatch(/padding:\s*\d+px\s+\d+px\s+\d+px\s+24px/);
    expect(body).toMatch(/column-gap:\s*12px/);
  });

  it("overview-section pads left so headings match page-header inset", () => {
    const body = ruleBody(".overview-section");
    expect(body).toMatch(/padding:\s*8px\s+24px\s+24px/);
  });

  it("overview-section content-panel drops horizontal margin (section pad owns inset)", () => {
    const body = ruleBody(".overview-section .content-panel");
    expect(body).toMatch(/margin-left:\s*0/);
    expect(body).toMatch(/margin-right:\s*0/);
  });

  it("overview-project-title prefixes a disc bullet with existing text color", () => {
    const body = ruleBody(".overview-project-title::before");
    expect(body).toMatch(/content:\s*["']•["']/);
    expect(body).toMatch(/color:\s*inherit|color:\s*var\(--(?:ds-text|color-text-primary)\)/);
  });
});
