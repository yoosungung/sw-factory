import { test, expect } from "@playwright/test";
import { clickEl, login, register, uniqueEmail } from "./helpers";

test.describe("smoke", () => {
  test("API health is reachable", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("unauthenticated / redirects to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText(/Log in/i);
  });

  test("register then logout then login", async ({ page }) => {
    const email = uniqueEmail("smoke");
    const password = "password123";
    await register(page, { email, password, name: "Smoke User" });

    await clickEl(page.locator(".avatar-inline"));
    await clickEl(page.getByRole("button", { name: "Log out" }));
    await expect(page).toHaveURL(/\/login/);

    await login(page, email, password);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create space" })).toHaveCount(0);
    await clickEl(page.locator(".avatar-inline"));
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });
});
