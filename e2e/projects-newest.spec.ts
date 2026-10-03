import { expect, test } from "@playwright/test";
import {
  clickEl,
  createIssue,
  createSoftwareProject,
  createSpace,
  loginAsAdmin,
} from "./helpers";

test("projects list scrolls under a fixed header; ticket views show newest first", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  await createSpace(page, `Newest Space ${stamp}`);
  await createSoftwareProject(page, `Newest Proj ${stamp}`);

  const older = `Older ticket ${stamp}`;
  const newer = `Newer ticket ${stamp}`;
  await createIssue(page, older);
  const close1 = page.getByRole("button", { name: "Close" });
  if (await close1.count()) await clickEl(close1);
  await createIssue(page, newer);
  const close2 = page.getByRole("button", { name: "Close" });
  if (await close2.count()) await clickEl(close2);

  await clickEl(page.locator(".view-segment").getByRole("tab", { name: "List" }));
  const listRows = page.locator(".page-scroll .list-row.list-issue:not(.head)");
  await expect(listRows.first()).toContainText(newer);

  await clickEl(page.locator(".view-segment").getByRole("tab", { name: "Board" }));
  const backlogCol = page.locator(".board-col").filter({ hasText: "Backlog" });
  await expect(backlogCol.locator(".issue-card").first()).toContainText(newer);

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect
    .poll(async () => page.locator("main.main").evaluate((el) => getComputedStyle(el).overflow))
    .toBe("hidden");
  const headerBottom = await page.locator(".page-header").evaluate((el) => el.getBoundingClientRect().bottom);
  const metrics = await page.locator(".page-scroll").evaluate((el) => {
    for (let i = 0; i < 60; i++) {
      const row = document.createElement("div");
      row.className = "list-row";
      row.dataset.scrollPad = String(i);
      row.textContent = `Scroll pad ${i}`;
      row.style.minHeight = "40px";
      el.appendChild(row);
    }
    el.scrollTop = el.scrollHeight;
    const result = {
      overflowY: getComputedStyle(el).overflowY,
      canScroll: el.scrollHeight > el.clientHeight,
      atBottom: el.scrollTop > 0,
      top: el.getBoundingClientRect().top,
    };
    el.querySelectorAll("[data-scroll-pad]").forEach((n) => n.remove());
    el.scrollTop = 0;
    return result;
  });
  expect(metrics.overflowY).toMatch(/auto|scroll/);
  expect(metrics.canScroll).toBe(true);
  expect(metrics.atBottom).toBe(true);
  expect(metrics.top).toBeGreaterThanOrEqual(headerBottom - 1);
});
