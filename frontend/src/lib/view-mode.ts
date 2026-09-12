export type ViewMode = "overview" | "board" | "backlog" | "timeline" | "list";

const VIEWS: ViewMode[] = ["overview", "board", "backlog", "timeline", "list"];

export function parseViewMode(raw: string | null): ViewMode {
  if (raw && VIEWS.includes(raw as ViewMode)) return raw as ViewMode;
  return "overview";
}

export function isTicketsView(view: ViewMode): boolean {
  return view !== "overview";
}
