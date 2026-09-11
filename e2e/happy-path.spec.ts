import { test, expect } from "@playwright/test";
import { clickEl, createIssue, createSoftwareProject, createSpace, loginAsAdmin } from "./helpers";

test.describe("happy path", () => {
  test("space → project → create issue on board", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `Space ${Date.now()}`;
    const project = `App ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    const title = `Issue ${Date.now()}`;
    await createIssue(page, title);

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(page.locator(".issue-title-input")).toHaveValue(title);
    await expect(panel.getByText("Priority")).toBeVisible();
    await expect(panel.getByText("Assignee")).toBeVisible();
    await expect(panel.getByText("Due date")).toBeVisible();

    await clickEl(panel.locator(".prio-picker").getByRole("button", { name: /priority/i }));
    await clickEl(panel.locator(".prio-picker").getByRole("option", { name: /High/i }));
    await clickEl(panel.getByRole("button", { name: "✕" }));
    await expect(page.locator(".prio-badge.high").first()).toBeVisible();
  });

  test("project settings people page loads for owner", async ({ page }) => {
    await loginAsAdmin(page);
    const space = `Settings Space ${Date.now()}`;
    const project = `Settings Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    await clickEl(page.getByRole("link", { name: "Project settings" }));
    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();

    await clickEl(page.getByRole("link", { name: "People" }));
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await expect(page.locator("select").first()).toHaveValue("owner");
  });
});
