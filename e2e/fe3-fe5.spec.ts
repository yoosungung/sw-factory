import { expect, test } from "@playwright/test";
import {
  clickEl,
  createSoftwareProject,
  createSpace,
  fillField,
  loginAsAdmin,
  register,
  submitForm,
} from "./helpers";

test("FE3: your-work, search, account", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE3 Space");
  await createSoftwareProject(page, "FE3 Proj");

  await clickEl(page.getByRole("button", { name: "+ Create" }).first());
  const title = `SearchableNeedle ${Date.now()}`;
  await fillField(page.getByPlaceholder("What needs to be done?"), title);
  await submitForm(page.locator("form.inline-create"));
  await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });

  // Assign to me via issue panel so Your work shows it
  await clickEl(page.getByText(title));
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await panel.locator("select").nth(2).evaluate((el) => {
    const select = el as HTMLSelectElement;
    if (select.options.length > 1) {
      select.value = select.options[1].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await clickEl(panel.getByRole("button", { name: "✕" }));

  await page.goto("/your-work");
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
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

test("FE5: filters and dashboards", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE5 Space");
  await createSoftwareProject(page, "FE5 Proj");

  await page.goto("/filters");
  await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
  await clickEl(page.getByRole("button", { name: "Create filter" }));
  await expect(page).toHaveURL(/\/filters\//);
  await fillField(page.getByLabel("Name"), "My open");
  await expect(page.getByLabel("Name")).toHaveValue("My open");

  await page.goto("/dashboards");
  await expect(page.getByRole("heading", { name: "Dashboards" })).toBeVisible();
  await expect(page.getByText("My open issues")).toBeVisible();
  await expect(page.getByText("Projects I can access")).toBeVisible();
});

test("FE6: history tab on issue", async ({ page }) => {
  await loginAsAdmin(page);
  await createSpace(page, "FE6 Space");
  await createSoftwareProject(page, "FE6 Proj");

  await clickEl(page.getByRole("button", { name: "+ Create" }).first());
  const title = `History ${Date.now()}`;
  await fillField(page.getByPlaceholder("What needs to be done?"), title);
  await submitForm(page.locator("form.inline-create"));
  await expect(page.getByText(title)).toBeVisible();
  await clickEl(page.getByText(title));

  const panel = page.getByRole("dialog");
  await panel.locator("select").first().evaluate((el) => {
    const select = el as HTMLSelectElement;
    select.value = "in_progress";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await clickEl(panel.getByRole("button", { name: "History" }));
  await expect(panel.getByText(/status/i).first()).toBeVisible({ timeout: 10000 });
});
