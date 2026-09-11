import { expect, test } from "@playwright/test";
import {
  clickEl,
  createSoftwareProject,
  createSpace,
  fillField,
  loginAsAdmin,
  submitForm,
} from "./helpers";

test("UX2: empty timeline shows EmptyState CTA", async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  await createSpace(page, `UX2 Space ${stamp}`);
  await createSoftwareProject(page, `UX2 Proj ${stamp}`);
  await expect(page).toHaveURL(/\/projects\//);

  await clickEl(page.locator(".view-segment").getByRole("tab", { name: "Timeline" }));
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  const empty = page.getByTestId("empty-state");
  await expect(empty).toBeVisible();
  await expect(empty.getByRole("button", { name: /일정 티켓|Create|만들기/i })).toBeVisible();
});

test("UX3: sidebar inspector has no backdrop; switching cards updates panel", async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  await createSpace(page, `UX3 Space ${stamp}`);
  await createSoftwareProject(page, `UX3 Proj ${stamp}`);

  await clickEl(page.getByRole("button", { name: "+ Create" }).first());
  const titleA = `Alpha ${stamp}`;
  await fillField(page.getByPlaceholder("What needs to be done?"), titleA);
  await submitForm(page.locator("form.inline-create"));
  await expect(page.getByText(titleA)).toBeVisible();

  await clickEl(page.getByRole("button", { name: "+ Create" }).first());
  const titleB = `Beta ${stamp}`;
  await fillField(page.getByPlaceholder("What needs to be done?"), titleB);
  await submitForm(page.locator("form.inline-create"));
  await expect(page.getByText(titleB)).toBeVisible();

  await clickEl(page.getByText(titleA));
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(page.locator(".drawer-backdrop")).toHaveCount(0);
  await expect(page.locator(".issue-title-input")).toHaveValue(titleA);

  await clickEl(page.getByText(titleB));
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
