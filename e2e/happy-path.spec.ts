import { test, expect } from "@playwright/test";
import { clickEl, createIssue, createSoftwareProject, createSpace, fillField, loginAsAdmin } from "./helpers";

test.describe("happy path", () => {
  test("space → project → create issue on board", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `Space ${Date.now()}`;
    const project = `App ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    const title = `Issue ${Date.now()}`;
    await createIssue(page, title);
    await expect(
      page
        .locator(".board-col")
        .filter({ has: page.getByRole("heading", { name: "Backlog", exact: true }) })
        .getByText(title),
    ).toBeVisible();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(page.locator(".issue-title-input")).toHaveValue(title);
    await clickEl(panel.getByRole("tab", { name: "Details" }));
    await expect(panel.getByText("Priority")).toBeVisible();
    await expect(panel.getByText("Assignee")).toBeVisible();
    await expect(panel.getByText("Due date")).toBeVisible();

    await clickEl(panel.locator(".prio-picker").getByRole("button", { name: /priority/i }));
    await clickEl(panel.locator(".prio-picker").getByRole("option", { name: /High/i }));
    await clickEl(panel.getByRole("button", { name: "Close" }));
    await expect(page.locator(".prio-badge.high").first()).toBeVisible();
  });

  test("issue description renders Markdown", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `MD Space ${Date.now()}`;
    const project = `MD Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    const title = `MD Issue ${Date.now()}`;
    await createIssue(page, title);
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    await clickEl(panel.locator(".issue-desc-view"));
    const desc = panel.locator("textarea.issue-desc");
    await expect(desc).toBeVisible();
    await fillField(desc, "**Bold bit** and [link](https://example.com)");
    await desc.evaluate((el) => (el as HTMLTextAreaElement).blur());

    await expect(panel.locator(".issue-desc-view .rich-content strong")).toHaveText("Bold bit");
    await expect(panel.locator(".issue-desc-view .rich-content a")).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  test("compact Create saves Description without expand", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `QC Space ${Date.now()}`;
    const project = `QC Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    const title = `QC Issue ${Date.now()}`;
    const body = `Compact desc ${Date.now()}`;
    await createIssue(page, title, { description: body });

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".issue-desc-view .rich-content")).toContainText(body);
  });

  test("issue Details Parent and Children show id + name", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `PC Space ${Date.now()}`;
    const project = `PC Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project);

    const parentTitle = `Parent ${Date.now()}`;
    await createIssue(page, parentTitle);
    const parentPanel = page.getByRole("dialog");
    await expect(parentPanel).toBeVisible();
    await clickEl(parentPanel.getByRole("tab", { name: "Details" }));
    await expect(parentPanel.getByTestId("issue-parent")).toBeVisible();
    await expect(parentPanel.getByTestId("issue-children")).toBeVisible();
    await expect(parentPanel.getByTestId("blocked-by")).toBeVisible();

    const childTitle = `Child ${Date.now()}`;
    await fillField(parentPanel.getByLabel(/New child title/i), childTitle);
    await clickEl(parentPanel.getByRole("button", { name: /^Add child$/i }));
    await expect(parentPanel.getByTestId("issue-children")).toContainText(childTitle);

    const childHref = await parentPanel
      .getByTestId("issue-children")
      .getByRole("link")
      .getAttribute("href");
    expect(childHref).toMatch(/\/browse\//);
    const childId = childHref!.split("/").pop()!;
    await expect(parentPanel.getByTestId("issue-children")).toContainText(childId.slice(0, 8));

    await clickEl(parentPanel.getByRole("button", { name: "Close" }));

    await page.goto(childHref!);
    const childPage = page.locator(".issue-page");
    await expect(childPage).toBeVisible();
    await clickEl(childPage.getByRole("tab", { name: "Details" }));
    await expect(childPage.getByTestId("issue-parent")).toContainText(parentTitle);
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
    await expect(page.getByText("Access", { exact: true })).toBeVisible();
    await expect(page.getByText("Lane", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Access for/i).first()).toHaveValue("owner");
    await expect(page.getByLabel(/Lane for/i).first()).toBeVisible();
  });
});
