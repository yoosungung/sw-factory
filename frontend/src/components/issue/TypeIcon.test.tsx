import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TypeIcon } from "./TypeIcon";

afterEach(() => {
  cleanup();
});

describe("TypeIcon", () => {
  it("always renders check glyph for task and milestone; keeps type class for color", () => {
    const { container: taskEl } = render(<TypeIcon type="task" />);
    const task = taskEl.querySelector(".type-icon.task");
    expect(task).toBeTruthy();
    expect(task!.textContent).toBe("✓");
    expect(task!.textContent).not.toContain("◆");

    cleanup();
    const { container: msEl } = render(<TypeIcon type="milestone" />);
    const ms = msEl.querySelector(".type-icon.milestone");
    expect(ms).toBeTruthy();
    expect(ms!.textContent).toBe("✓");
    expect(ms!.textContent).not.toContain("◆");
  });
});
