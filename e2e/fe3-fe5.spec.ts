import { expect, test } from "@playwright/test";
import {
  clickEl,
  createIssue,
  createSoftwareProject,
  createSpace,
  fillField,
  loginAsAdmin,
  register,
} from "./helpers";

test("FE3: your-work, search, account", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE3 Space");
  await createSoftwareProject(page, "FE3 Proj");

  const title = `SearchableNeedle ${Date.now()}`;
  await createIssue(page, title);

  // Assign to me via issue panel so Your work shows it
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await panel.locator("select").first().evaluate((el) => {
    const select = el as HTMLSelectElement;
    if (select.options.length > 1) {
      select.value = select.options[1].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await clickEl(panel.getByRole("button", { name: "✕" }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await clickEl(page.getByRole("button", { name: "Created by me" }));
  await expect(page.getByText(title)).toBeVisible();
  await clickEl(page.getByRole("button", { name: "Recent projects" }));
  await expect(page.getByText("FE3 Proj")).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent("SearchableNeedle")}`);
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await fillField(page.getByLabel("Name"), "FE3 Renamed");
  await clickEl(page.getByRole("button", { name: "Save profile" }));
  await expect(page.getByText("Profile saved.")).toBeVisible();
});

test("FE3: registered user can update password", async ({ page }) => {
  const creds = await register(page, { name: "FE3 Pw User" });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await fillField(page.getByLabel("Current password"), creds.password);
  await fillField(page.getByLabel("New password"), "password456");
  await clickEl(page.getByRole("button", { name: "Change password" }));
  await expect(page.getByText("Password updated.")).toBeVisible();
});

test("FE5: filters", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE5 Space");
  await createSoftwareProject(page, "FE5 Proj");

  await page.goto("/filters");
  await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
  await clickEl(page.getByRole("button", { name: "Create filter" }));
  await expect(page).toHaveURL(/\/filters\//);
  await fillField(page.getByLabel("Name"), "My open");
  await expect(page.getByLabel("Name")).toHaveValue("My open");
});

test("FE6: history tab on issue", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE6 Space");
  await createSoftwareProject(page, "FE6 Proj");

  const title = `History ${Date.now()}`;
  await createIssue(page, title);

  const panel = page.getByRole("dialog");
  await clickEl(panel.locator(".status-picker").getByRole("button", { name: /status/i }));
  await expect(panel.locator(".status-picker").getByRole("option", { name: /In Progress/i })).toBeVisible({
    timeout: 10000,
  });
  await clickEl(panel.locator(".status-picker").getByRole("option", { name: /In Progress/i }));
  await clickEl(panel.getByRole("button", { name: "History" }));
  await expect(panel.getByText(/status/i).first()).toBeVisible({ timeout: 10000 });
});

test("FE8: board settings custom column appears on board", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE8 Space");
  await createSoftwareProject(page, "FE8 Proj");

  await expect(page.locator(".board-col").filter({ has: page.getByRole("heading", { name: "Review" }) })).toBeVisible();

  await clickEl(page.getByRole("link", { name: "Project settings" }));
  await clickEl(page.getByRole("link", { name: "Board" }));
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();

  await clickEl(page.getByRole("button", { name: "Add column" }));
  const rows = page.locator(".board-status-row");
  const last = rows.last();
  await fillField(last.locator('input[aria-label="Status key"]'), "staging");
  await fillField(last.locator('input[aria-label="Status label"]'), "Staging");
  await last.locator('select[aria-label="Status category"]').selectOption("active");
  await clickEl(page.getByRole("button", { name: "Save columns" }));
  await expect(page.getByText("Board columns saved")).toBeVisible({ timeout: 10000 });

  await clickEl(page.getByRole("link", { name: "← Back to project" }));
  await expect(
    page.locator(".board-col").filter({ has: page.getByRole("heading", { name: "Staging" }) }),
  ).toBeVisible({ timeout: 10000 });
});
