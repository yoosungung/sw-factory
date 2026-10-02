import { expect, test } from "@playwright/test";
import {
  clickEl,
  createIssue,
  createSoftwareProject,
  createSpace,
  fillField,
  loginAsAdmin,
  openTickets,
  submitForm,
} from "./helpers";

test.describe("F16 agent prompt", () => {
  test("Tickets toolbar sends on-demand prompt and shows ack", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `Prompt Space ${Date.now()}`;
    const project = `Prompt Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project, { tickets: true });
    await openTickets(page);

    await clickEl(page.getByRole("button", { name: "Prompt agent" }));
    const dialog = page.locator("form.create-dialog").filter({ hasText: "Prompt agent" });
    await expect(dialog).toBeVisible();

    const target = dialog.getByLabel(/^Target/);
    await expect(target.locator("option")).not.toHaveCount(0);
    await target.evaluate((el) => {
      const select = el as HTMLSelectElement;
      if (select.options.length > 0) {
        select.value = select.options[0].value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await fillField(dialog.getByLabel(/^Prompt/), `E2E wake ${Date.now()}`);
    await submitForm(dialog);

    await expect(dialog.getByRole("status")).toContainText(/Queued event/i);
    await expect(dialog.locator("code").first()).toBeVisible();
  });

  test("Issue panel Prompt agent includes ticket scope", async ({ page }) => {
    await loginAsAdmin(page);

    const space = `Issue Prompt Space ${Date.now()}`;
    const project = `Issue Prompt Proj ${Date.now()}`;
    await createSpace(page, space);
    await createSoftwareProject(page, project, { tickets: true });

    const title = `Prompt Issue ${Date.now()}`;
    await createIssue(page, title);
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    await clickEl(panel.getByRole("button", { name: "Prompt agent" }));
    const dialog = page.locator("form.create-dialog").filter({ hasText: "Prompt agent" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Scoped to issue/i)).toBeVisible();

    await fillField(dialog.getByLabel(/^Prompt/), `Review ${title}`);
    await submitForm(dialog);
    await expect(dialog.getByRole("status")).toContainText(/Queued event/i);
  });
});
