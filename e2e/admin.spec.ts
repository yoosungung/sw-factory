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

test("admin can open /admin, create a space, and invite by email", async ({ page }) => {
  const memberEmail = uniqueEmail("invitee");
  const memberName = "Invitee User";
  await register(page, { name: memberName, email: memberEmail, password: "password123" });
  await logout(page);

  await loginAsAdmin(page);
  await clickEl(page.locator(".avatar-inline"));
  await clickEl(page.getByRole("link", { name: "Admin" }));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  await expect(page.getByText(memberEmail)).toBeVisible();

  const space = `Admin Space ${Date.now()}`;
  await page.goto("/");
  await createSpace(page, space);

  await clickEl(page.getByRole("link", { name: "People" }));
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await fillField(page.getByPlaceholder("Email to invite"), memberEmail);
  await submitForm(page.locator("form.list-row"));
  await expect(page.getByText(memberName)).toBeVisible();
});
