import { expect, test } from "@playwright/test";
import { clickEl, createSoftwareProject, createSpace, loginAsAdmin } from "./helpers";

test("UX1: single view source + space switcher + settings shell", async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  await createSpace(page, `UX1 Space ${stamp}`);
  await createSoftwareProject(page, `UX1 Proj ${stamp}`);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();

  // Board/Backlog/Timeline/List: toolbar segment only (not duplicated in sidebar)
  await expect(page.getByRole("tab", { name: "Board", exact: true })).toHaveCount(1);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Board", exact: true })).toHaveCount(0);
  await expect(page.locator(".view-segment").getByRole("tab", { name: "Board", exact: true })).toHaveCount(1);

  // Space dump removed; switcher present
  await expect(page.locator(".sidebar .side-section", { hasText: "Spaces" })).toHaveCount(0);
  await expect(page.locator(".space-switcher")).toBeVisible();

  await clickEl(page.locator(".sidebar").getByRole("link", { name: "Project settings" }));
  await expect(page).toHaveURL(/\/settings\/details/);
  // Single settings shell: no project sidebar beside settings-side
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".settings-side")).toBeVisible();
});
