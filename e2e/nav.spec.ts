import { expect, test } from "@playwright/test";
import { clickEl, createSoftwareProject, createSpace, loginAsAdmin } from "./helpers";

test("UX0 light chrome: top nav matches surface tokens", async ({ page }) => {
  await loginAsAdmin(page);

  const nav = page.locator("header.top-nav");
  await expect(nav).toBeVisible();

  const styles = await nav.evaluate((el) => {
    const cs = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    return {
      navBg: cs.backgroundColor,
      surface: root.getPropertyValue("--color-bg-surface").trim(),
      brand: root.getPropertyValue("--color-brand").trim(),
      canvas: root.getPropertyValue("--color-bg-canvas").trim(),
      radiusSm: root.getPropertyValue("--radius-sm").trim(),
      radiusMd: root.getPropertyValue("--radius-md").trim(),
      radiusLg: root.getPropertyValue("--radius-lg").trim(),
    };
  });

  expect(styles.surface).toBe("#ffffff");
  expect(styles.brand).toBe("#2563eb");
  expect(styles.canvas).toBe("#f8fafc");
  expect(styles.radiusSm).toBe("4px");
  expect(styles.radiusMd).toBe("8px");
  expect(styles.radiusLg).toBe("12px");
  // light chrome: white / near-white, not dark navy (#1d2125)
  expect(styles.navBg).toMatch(/^rgb\(255,\s*255,\s*255\)$/);
  await expect(nav.locator(".nav-search-hint")).toHaveText(/⌘K|Ctrl\+K/);
});

test("top nav maps to API screens in one click", async ({ page }) => {
  await loginAsAdmin(page);

  const nav = page.locator("header.top-nav");
  await expect(nav.getByRole("link", { name: "Spaces", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Your work", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Filters" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Dashboards" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Teams" })).toHaveCount(0);

  await clickEl(nav.getByRole("link", { name: "Spaces", exact: true }));
  await expect(page).toHaveURL(/\/spaces$/);
  await expect(page.getByRole("heading", { name: "Spaces" })).toBeVisible();

  await clickEl(nav.getByRole("link", { name: "Projects", exact: true }));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  await clickEl(nav.getByRole("link", { name: "Your work", exact: true }));
  await expect(page).toHaveURL(/\/your-work/);
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();

  await page.goto("/");
  await createSpace(page, "Nav Space");
  await createSoftwareProject(page, "Nav Proj");

  await clickEl(page.locator("header.top-nav").getByRole("link", { name: "Projects", exact: true }));
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await clickEl(page.getByRole("link", { name: /Nav Proj/ }).first());
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
});
