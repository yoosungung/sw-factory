import { expect, test } from "@playwright/test";
import {
  clickEl,
  createIssue,
  createSoftwareProject,
  createSpace,
  loginAsAdmin,
} from "./helpers";

test("UX2: empty timeline and list match backlog EmptyState form", async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  await createSpace(page, `UX2 Space ${stamp}`);
  await createSoftwareProject(page, `UX2 Proj ${stamp}`);
  await expect(page).toHaveURL(/\/projects\//);

  await clickEl(page.locator(".view-segment").getByRole("tab", { name: "Backlog" }));
  const backlogEmpty = page.getByTestId("empty-state");
  await expect(backlogEmpty.getByRole("heading", { name: "Backlog is empty" })).toBeVisible();
  await expect(backlogEmpty.getByRole("button")).toHaveCount(0);

  await clickEl(page.locator(".view-segment").getByRole("tab", { name: "Timeline" }));
  await expect(page.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();
  const timelineEmpty = page.getByTestId("empty-state");
  await expect(timelineEmpty.getByRole("heading", { name: "Timeline is empty" })).toBeVisible();
  await expect(timelineEmpty.getByRole("button")).toHaveCount(0);

  await clickEl(page.locator(".view-segment").getByRole("tab", { name: "List" }));
  await expect(page.getByRole("heading", { name: "List", exact: true })).toBeVisible();
  const listEmpty = page.getByTestId("empty-state");
  await expect(listEmpty.getByRole("heading", { name: "List is empty" })).toBeVisible();
  await expect(listEmpty.getByRole("button")).toHaveCount(0);
});

test("UX3: sidebar inspector has no backdrop; switching cards updates panel", async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  await createSpace(page, `UX3 Space ${stamp}`);
  await createSoftwareProject(page, `UX3 Proj ${stamp}`);

  const titleA = `Alpha ${stamp}`;
  await createIssue(page, titleA);
  const titleB = `Beta ${stamp}`;
  await createIssue(page, titleB);

  await clickEl(page.locator(".issue-card").filter({ hasText: titleA }));
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(page.locator(".drawer-backdrop")).toHaveCount(0);
  await expect(page.locator(".issue-title-input")).toHaveValue(titleA);

  await clickEl(page.locator(".issue-card").filter({ hasText: titleB }));
  await expect(page.locator(".issue-title-input")).toHaveValue(titleB);
});

test("UX4: mobile hamburger nav", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);

  const topNav = page.locator(".top-nav");
  await expect(topNav.locator(".nav-desktop-links")).toBeHidden();
  const burger = topNav.getByRole("button", { name: /menu|☰/i });
  await expect(burger).toBeVisible();
  await clickEl(burger);

  const drawer = page.locator(".mobile-nav-drawer");
  await expect(drawer).toBeVisible();
  for (const name of ["Spaces", "Projects", "Your work", "Create"]) {
    const item = drawer.getByRole("link", { name }).or(drawer.getByRole("button", { name }));
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
  }
});
