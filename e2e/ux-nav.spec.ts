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

test("UX5: space settings in sidebar; overview vs tickets", async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const space = `UX5 Space ${stamp}`;
  const project = `UX5 Proj ${stamp}`;
  await createSpace(page, space);

  await expect(page.locator(".space-switcher")).toBeVisible();
  await expect(page.locator(".sidebar-project")).toHaveCount(0);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Space settings" })).toBeVisible();
  await expect(page.locator(".page-header").getByRole("link", { name: /Settings/ })).toHaveCount(0);
  await expect(page.locator(".page-header").getByRole("link", { name: "People" })).toHaveCount(0);

  await createSoftwareProject(page, project, { tickets: false });
  await expect(page.getByRole("heading", { name: project, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "In progress", exact: true })).toBeVisible();
  await expect(page.locator(".view-segment")).toHaveCount(0);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Overview" })).toHaveClass(/active/);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Tickets" })).toBeVisible();

  await clickEl(page.locator(".sidebar").getByRole("link", { name: "Tickets" }));
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
  await expect(page.locator(".view-segment").getByRole("tab", { name: "Board", exact: true })).toHaveCount(1);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Tickets" })).toHaveClass(/active/);
});
