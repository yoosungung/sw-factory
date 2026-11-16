export type ViewMode = "overview" | "board" | "backlog" | "list";

const VIEWS: ViewMode[] = ["overview", "board", "backlog", "list"];

/** Legacy `?view=timeline` deep links fall back to List (Timeline segment removed). */
export function parseViewMode(raw: string | null): ViewMode {
  if (raw === "timeline") return "list";
  if (raw && VIEWS.includes(raw as ViewMode)) return raw as ViewMode;
  return "overview";
}

export function isTicketsView(view: ViewMode): boolean {
  return view !== "overview";
}
