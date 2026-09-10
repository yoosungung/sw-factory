import { test, expect } from "@playwright/test";
import { clickEl, createSoftwareProject, createSpace, fillField, register, submitForm } from "./helpers";

test.describe("happy path", () => {
  test("space → project → create issue on board", async ({ page }) => {
    await register(page, { name: "Happy Path" });

    const space = `Space ${Date.now()}`;
    const project = `App ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    await clickEl(page.getByRole("button", { name: "+ Create" }).first());
    const title = `Issue ${Date.now()}`;
    await fillField(page.getByPlaceholder("What needs to be done?"), title);
    await submitForm(page.locator("form.inline-create"));

    await expect(page.getByText(title)).toBeVisible();
    await clickEl(page.getByText(title));

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(page.locator(".issue-title-input")).toHaveValue(title);
    await expect(panel.getByText("Priority")).toBeVisible();
    await expect(panel.getByText("Assignee")).toBeVisible();
    await expect(panel.getByText("Due date")).toBeVisible();

    await panel.locator("select").nth(1).evaluate((el) => {
      const select = el as HTMLSelectElement;
      select.value = "high";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clickEl(panel.getByRole("button", { name: "✕" }));
    await expect(page.locator(".prio-badge.high")).toBeVisible();
  });

  test("project settings people page loads for owner", async ({ page }) => {
    await register(page, { name: "Settings Owner" });
    const space = `Settings Space ${Date.now()}`;
    const project = `Settings Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    await clickEl(page.getByRole("link", { name: "Project settings" }));
    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();

    await clickEl(page.getByRole("link", { name: "People" }));
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await expect(page.getByText("Settings Owner")).toBeVisible();
    await expect(page.getByText("owner").first()).toBeVisible();
  });
});
