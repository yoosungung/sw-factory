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

describe("page list scrollport", () => {
  it("keeps .main overflow hidden for board layout", () => {
    expect(ruleBody(".main")).toMatch(/overflow:\s*hidden/);
  });

  it("page-scroll fills remaining height and scrolls vertically", () => {
    const body = ruleBody(".page-scroll");
    expect(body).toMatch(/flex:\s*1/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it("settings layout fills the main column so People can scroll", () => {
    const body = ruleBody(".main > .settings-layout");
    expect(body).toMatch(/flex:\s*1/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });
});

describe("chrome icon touch targets", () => {
  it("sidebar and issue drawer icon buttons are at least 40px", () => {
    const sidebar = ruleBody(".sidebar .icon-btn");
    const drawer = ruleBody(".drawer-top .icon-btn");
    expect(sidebar).toMatch(/min-width:\s*40px/);
    expect(sidebar).toMatch(/min-height:\s*40px/);
    expect(drawer).toMatch(/min-width:\s*40px/);
    expect(drawer).toMatch(/min-height:\s*40px/);
  });
});
