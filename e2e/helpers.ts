import { expect, type Locator, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Chromium headless on some macOS builds hangs on Playwright fill/click; use DOM events. */
export async function fillField(locator: Locator, value: string) {
  await locator.waitFor({ state: "attached" });
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    desc?.set?.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

export async function clickEl(locator: Locator) {
  await locator.waitFor({ state: "attached" });
  await locator.evaluate((el) => (el as HTMLElement).click());
}

export async function submitForm(form: Locator) {
  await form.waitFor({ state: "attached" });
  await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
}

export async function register(
  page: Page,
  opts: { name?: string; email?: string; password?: string } = {},
) {
  const name = opts.name ?? "E2E User";
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? "password123";

  await page.goto("/register");
  await expect(page.locator("h1")).toContainText(/Sign up/i);
  await fillField(page.getByLabel("Full name"), name);
  await fillField(page.getByLabel("Email"), email);
  await fillField(page.getByLabel("Password"), password);
  await submitForm(page.locator("form.auth-card"));
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  return { name, email, password };
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.locator("h1")).toContainText(/Log in/i);
  await fillField(page.getByLabel("Email"), email);
  await fillField(page.getByLabel("Password"), password);
  await submitForm(page.locator("form.auth-card"));
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

export async function createSpace(page: Page, name: string) {
  await clickEl(page.getByRole("button", { name: "Create space" }).first());
  const dialog = page.locator(".create-dialog").filter({ hasText: "Create space" });
  await fillField(dialog.getByLabel(/Name/), name);
  await submitForm(dialog);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function createSoftwareProject(page: Page, name: string) {
  await clickEl(page.getByRole("button", { name: "Create project" }));
  const dialog = page.locator(".create-dialog").filter({ hasText: "Create project" });
  await fillField(dialog.getByLabel(/Name/), name);
  await submitForm(dialog);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
}
