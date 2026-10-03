import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(frontendRoot, "..");

describe("app icon assets", () => {
  it("keeps SVG original and apple-touch PNG under frontend/icons", () => {
    const svg = readFileSync(join(frontendRoot, "icons/app-icon.svg"), "utf8");
    expect(svg).toMatch(/#2563eb/i);
    expect(svg).toMatch(/viewBox/i);
    const png = readFileSync(join(frontendRoot, "icons/apple-touch-icon.png"));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("wires favicon and apple-touch-icon in the SPA document head", () => {
    const html = readFileSync(join(repoRoot, "index.html"), "utf8");
    expect(html).toMatch(/rel="icon"[^>]*href="\.\/frontend\/icons\/app-icon\.svg"/);
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\.\/frontend\/icons\/apple-touch-icon\.png"/);
  });

  it("renders BrandMark from the same SVG file", () => {
    const svg = readFileSync(join(frontendRoot, "icons/app-icon.svg"), "utf8");
    const { container } = render(<BrandMark size={24} />);
    const img = container.querySelector("img.brand-mark");
    expect(img).toBeTruthy();
    const src = img?.getAttribute("src") ?? "";
    if (src.startsWith("data:image/svg+xml")) {
      const payload = decodeURIComponent(src.replace(/^data:image\/svg\+xml,?/, ""));
      expect(payload).toContain("#2563eb");
      expect(svg).toContain("#2563eb");
      expect(payload).toMatch(/viewBox=['"]0 0 32 32['"]/);
    } else {
      expect(src).toMatch(/app-icon\.svg/);
    }
  });
});
