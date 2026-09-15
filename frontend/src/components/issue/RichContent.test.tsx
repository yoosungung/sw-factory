import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichContent } from "./RichContent";

describe("RichContent", () => {
  it("renders GFM markdown (bold, list, link)", () => {
    render(
      <RichContent
        source={"**hello**\n\n- one\n- two\n\n[docs](https://example.com)"}
      />,
    );
    expect(screen.getByText("hello").tagName).toBe("STRONG");
    expect(screen.getByText("one").tagName).toBe("LI");
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders safe HTML tags but strips scripts", () => {
    render(
      <RichContent
        source={'<p>safe</p><script>alert(1)</script><b onclick="x()">bold</b>'}
      />,
    );
    expect(screen.getByText("safe")).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("B");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("bold")).not.toHaveAttribute("onclick");
  });

  it("renders empty source as nothing visible", () => {
    const { container } = render(<RichContent source="   " />);
    expect(container.querySelector(".rich-content")?.textContent?.trim()).toBe("");
  });
});
