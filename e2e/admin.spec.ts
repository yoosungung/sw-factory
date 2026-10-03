import { expect, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  clickEl,
  createSpace,
  fillField,
  loginAsAdmin,
  logout,
  register,
  submitForm,
  uniqueEmail,
} from "./helpers";

test("admin can open /admin, create a space, and invite by search", async ({ page }) => {
  const memberEmail = uniqueEmail("invitee");
  const memberName = "Invitee User";
  await register(page, { name: memberName, email: memberEmail, password: "password123" });
  await logout(page);

  await loginAsAdmin(page);
  await clickEl(page.locator(".avatar-inline"));
  await clickEl(page.getByRole("link", { name: "Admin" }));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.locator(".page-header")).toContainText("Create space");
  await expect
    .poll(async () => page.locator(".page-scroll").evaluate((el) => getComputedStyle(el).overflowY))
    .toMatch(/auto|scroll/);
  await expect
    .poll(async () => page.locator("main.main").evaluate((el) => getComputedStyle(el).overflow))
    .toBe("hidden");
  const adminScroll = page.locator(".page-scroll");
  const scrollMetrics = await adminScroll.evaluate((el) => {
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
      headerStillVisible: Boolean(document.querySelector(".page-header h1")),
    };
    el.querySelectorAll("[data-scroll-pad]").forEach((n) => n.remove());
    el.scrollTop = 0;
    return result;
  });
  expect(scrollMetrics.overflowY).toMatch(/auto|scroll/);
  expect(scrollMetrics.canScroll).toBe(true);
  expect(scrollMetrics.atBottom).toBe(true);
  expect(scrollMetrics.headerStillVisible).toBe(true);
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  await expect(page.getByText(memberEmail)).toBeVisible();

  const space = `Admin Space ${Date.now()}`;
  await page.goto("/");
  await createSpace(page, space);

  await clickEl(page.locator(".sidebar").getByRole("link", { name: "Space settings" }));
  await clickEl(page.getByRole("link", { name: "People" }));
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await fillField(page.getByPlaceholder("Search name or email…"), memberEmail);
  await clickEl(page.getByRole("option", { name: new RegExp(memberName) }));
  await submitForm(page.locator("form.list-row"));
  await expect(page.getByText(memberName)).toBeVisible();
});
