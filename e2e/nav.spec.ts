import { expect, test } from "@playwright/test";
import { clickEl, createSoftwareProject, createSpace, loginAsAdmin } from "./helpers";

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
  await clickEl(page.getByRole("link", { name: /Nav Proj/ }));
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
});
