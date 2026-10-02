import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "styles.css");
const css = readFileSync(cssPath, "utf8");

function media767(): string {
  const start = css.search(/@media\s*\(\s*max-width:\s*767px\s*\)\s*\{/);
  if (start < 0) throw new Error("missing @media (max-width: 767px)");
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("unclosed @media (max-width: 767px)");
}

function block(source: string, selector: string): string {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  );
  const m = source.match(re);
  if (!m) throw new Error(`missing CSS rule for ${selector}`);
  return m[1];
}

describe("ticket UI mobile (<768px)", () => {
  const mobile = media767();

  it("stacks list, your work, overview, and history rows; hides their headers", () => {
    expect(block(mobile, ".list-issue")).toMatch(/grid-template-columns:\s*1fr\s*!important/);
    expect(block(mobile, ".your-work-issues .list-row")).toMatch(/grid-template-columns:\s*1fr/);
    expect(block(mobile, ".overview-active-list .list-row")).toMatch(/grid-template-columns:\s*1fr/);
    expect(block(mobile, ".history-list .list-row")).toMatch(/grid-template-columns:\s*1fr/);
    expect(mobile).toMatch(/\.list-row\.head\.list-issue[\s\S]*?display:\s*none/);
    expect(mobile).toMatch(/\.your-work-issues \.list-row\.head[\s\S]*?display:\s*none/);
    expect(mobile).toMatch(/\.overview-active-list \.list-row\.head[\s\S]*?display:\s*none/);
    expect(mobile).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("wraps backlog rows and gives the status select a 40px target", () => {
    expect(block(mobile, ".backlog-row")).toMatch(/flex-wrap:\s*wrap/);
    expect(block(mobile, ".backlog-row .grow")).toMatch(/flex:\s*1\s+1\s+100%/);
    expect(block(mobile, ".backlog-row select")).toMatch(/min-height:\s*40px/);
  });

  it("turns the issue drawer and modal into a full-width sheet", () => {
    const drawer = block(mobile, ".drawer");
    expect(drawer).toMatch(/left:\s*0/);
    expect(drawer).toMatch(/width:\s*100%/);
    expect(block(mobile, ".drawer-top")).toMatch(/position:\s*sticky/);
    expect(block(mobile, ".project-breadcrumb-link")).toMatch(/text-overflow:\s*ellipsis/);
    expect(block(mobile, ".issue-modal-layer")).toMatch(/padding:\s*0/);
    const modal = block(mobile, ".issue-modal");
    expect(modal).toMatch(/height:\s*100%/);
    expect(modal).toMatch(/border-radius:\s*0/);
    expect(block(mobile, ".activity-tabs")).toMatch(/overflow-x:\s*auto/);
    const tab = block(mobile, ".activity-tab");
    expect(tab).toMatch(/min-height:\s*40px/);
    expect(tab).toMatch(/flex-shrink:\s*0/);
    expect(mobile).toMatch(/font-size:\s*16px/);
    expect(block(mobile, ".deps-add")).toMatch(/flex-wrap:\s*wrap/);
    expect(block(mobile, ".file-row")).toMatch(/flex-wrap:\s*wrap/);
    expect(block(mobile, ".btn-subtle.sm")).toMatch(/min-height:\s*40px/);
    expect(mobile).toMatch(/safe-area-inset-bottom/);
  });

  it("stacks the tickets toolbar and snaps board columns", () => {
    expect(block(mobile, ".view-segment")).toMatch(/overflow-x:\s*auto/);
    expect(block(mobile, ".view-segment")).toMatch(/width:\s*100%/);
    expect(block(mobile, ".quick-filter")).toMatch(/width:\s*100%/);
    expect(block(mobile, ".board-scroll")).toMatch(/scroll-snap-type:\s*x\s+mandatory/);
    expect(block(mobile, ".board-col")).toMatch(/scroll-snap-align:\s*start/);
  });

  it("hides the card status select until the mobile breakpoint", () => {
    expect(block(css, ".issue-card .move-select")).toMatch(/display:\s*none/);
    expect(block(mobile, ".issue-card .move-select")).toMatch(/display:\s*block/);
    expect(block(mobile, ".issue-card .move-select")).toMatch(/min-height:\s*40px/);
  });
});
