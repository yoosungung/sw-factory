import { upsertBlockedByMarker } from "./blocked-by";
import { FactoryClient } from "./client";

export type McpToolName =
  | "get_ticket"
  | "list_tickets"
  | "create_ticket"
  | "update_ticket"
  | "get_comments"
  | "add_comment"
  | "edit_comment"
  | "set_blocked_by"
  | "list_projects"
  | "get_project"
  | "list_project_members"
  | "search";

export type McpToolResult = { content: Array<{ type: "text"; text: string }> };

function textResult(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function blockerIdsFromArgs(args: Record<string, unknown>): string[] {
  const raw = args.blocker_ids;
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * factory-mcp tool handlers — session cookie REST bridge (no PAT).
 */
export function createFactoryMcp(client: FactoryClient) {
  return {
    tools: [
      { name: "get_ticket", description: "GET /api/tickets/:id" },
      { name: "list_tickets", description: "GET /api/projects/:id/tickets (+ milestone_id filter)" },
      { name: "create_ticket", description: "POST /api/projects/:id/tickets" },
      { name: "update_ticket", description: "PATCH /api/tickets/:id" },
      { name: "get_comments", description: "GET /api/tickets/:id/comments" },
      { name: "add_comment", description: "POST /api/tickets/:id/comments (body = Markdown/GFM)" },
      { name: "edit_comment", description: "PATCH /api/comments/:id (no agent wake)" },
      {
        name: "set_blocked_by",
        description:
          "Upsert <!-- blocked-by:id[,id] --> on ticket description; optional status=blocked",
      },
      { name: "list_projects", description: "GET /api/projects" },
      { name: "get_project", description: "GET /api/projects/:id" },
      {
        name: "list_project_members",
        description:
          "GET /api/projects/:id/members — role (access) + lane (pm|ta|qa|aa|km|developer) for assignment",
      },
      { name: "search", description: "GET /api/search?q=" },
    ] as const,

    async callTool(
      name: McpToolName,
      args: Record<string, unknown>,
    ): Promise<McpToolResult> {
      switch (name) {
        case "get_ticket":
          return textResult(await client.getTicket(String(args.id)));
        case "list_tickets":
          return textResult(
            await client.listTickets(
              String(args.project_id),
              (args.query as Record<string, string>) ?? {},
            ),
          );
        case "create_ticket":
          return textResult(
            await client.createTicket(
              String(args.project_id),
              (args.body as Record<string, unknown>) ?? {},
            ),
          );
        case "update_ticket":
          return textResult(
            await client.updateTicket(
              String(args.id),
              (args.body as Record<string, unknown>) ?? {},
            ),
          );
        case "get_comments":
          return textResult(await client.getComments(String(args.ticket_id)));
        case "add_comment":
          return textResult(
            await client.addComment(String(args.ticket_id), String(args.body)),
          );
        case "edit_comment":
          return textResult(
            await client.editComment(String(args.id ?? args.comment_id), String(args.body)),
          );
        case "set_blocked_by": {
          const ticketId = String(args.ticket_id ?? args.id);
          const got = (await client.getTicket(ticketId)) as {
            ticket: { description?: string; version?: number };
          };
          const ticket = got.ticket;
          const description = upsertBlockedByMarker(
            ticket.description ?? "",
            blockerIdsFromArgs(args),
          );
          const body: Record<string, unknown> = { description };
          if (typeof ticket.version === "number") body.version = ticket.version;
          if (typeof args.status === "string" && args.status.trim()) {
            body.status = args.status.trim();
          }
          return textResult(await client.updateTicket(ticketId, body));
        }
        case "list_projects":
          return textResult(await client.listProjects());
        case "get_project":
          return textResult(await client.getProject(String(args.id)));
        case "list_project_members":
          return textResult(
            await client.listProjectMembers(String(args.project_id ?? args.id)),
          );
        case "search":
          return textResult(await client.search(String(args.q)));
        default:
          throw new Error(`unknown_tool:${name}`);
      }
    },
  };
}
