import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../../api";
import { AgentPromptDialog } from "./AgentPromptDialog";

const postAgentPrompt = vi.fn();

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    client: {
      postAgentPrompt: (...args: unknown[]) => postAgentPrompt(...args),
    },
  };
});

afterEach(() => {
  cleanup();
});

const members: Member[] = [
  {
    user_id: "u1",
    role: "owner",
    lane: "pm",
    email: "pm@example.com",
    name: "pm",
  },
  {
    user_id: "u2",
    role: "member",
    lane: "developer",
    email: "dev@example.com",
    name: "sw-factory",
  },
];

function renderDialog(
  props: Partial<Parameters<typeof AgentPromptDialog>[0]> = {},
) {
  return render(
    <AgentPromptDialog
      projectId="p1"
      members={members}
      onClose={() => {}}
      {...props}
    />,
  );
}

describe("AgentPromptDialog", () => {
  beforeEach(() => {
    postAgentPrompt.mockReset();
    postAgentPrompt.mockResolvedValue({
      id: "evt-9",
      at: "2026-10-02T12:00:00.000Z",
    });
  });

  it("sends prompt without ticket_id from toolbar context", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/^Target/), {
      target: { value: "sw-factory" },
    });
    fireEvent.change(screen.getByLabelText(/^Prompt/), {
      target: { value: "Catch up on backlog" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /agent prompt/i }));

    await waitFor(() => {
      expect(postAgentPrompt).toHaveBeenCalledWith({
        project_id: "p1",
        target: "sw-factory",
        prompt: "Catch up on backlog",
      });
    });
    expect(screen.getByText(/evt-9/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-02T12:00:00.000Z/)).toBeInTheDocument();
  });

  it("includes defaultTicketId when opened from issue", async () => {
    renderDialog({ defaultTicketId: "ticket-abc" });

    expect(screen.getByText(/ticket-abc/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Target/), {
      target: { value: "pm" },
    });
    fireEvent.change(screen.getByLabelText(/^Prompt/), {
      target: { value: "Please review" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /agent prompt/i }));

    await waitFor(() => {
      expect(postAgentPrompt).toHaveBeenCalledWith({
        project_id: "p1",
        target: "pm",
        prompt: "Please review",
        ticket_id: "ticket-abc",
      });
    });
  });

  it("shows 4xx error message", async () => {
    const { ApiError } = await import("../../api");
    postAgentPrompt.mockRejectedValue(new ApiError(400, { error: "invalid_target" }));
    renderDialog();

    fireEvent.change(screen.getByLabelText(/^Target/), {
      target: { value: "pm" },
    });
    fireEvent.change(screen.getByLabelText(/^Prompt/), {
      target: { value: "hi" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /agent prompt/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid_target/)).toBeInTheDocument();
    });
  });
});
