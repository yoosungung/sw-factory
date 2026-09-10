export type SavedFilter = {
  id: string;
  name: string;
  starred: boolean;
  query: {
    text?: string;
    status?: string;
    type?: string;
    assignee?: "me" | "";
    project_id?: string;
  };
  created_at: string;
};

export type SavedDashboard = {
  id: string;
  name: string;
  widgets: Array<"my_open" | "projects" | "by_status">;
  created_at: string;
};

const FILTERS_KEY = "lt_saved_filters";
const DASH_KEY = "lt_saved_dashboards";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listFilters(): SavedFilter[] {
  return readJson<SavedFilter[]>(FILTERS_KEY, []);
}

export function saveFilters(items: SavedFilter[]) {
  writeJson(FILTERS_KEY, items);
}

export function upsertFilter(filter: SavedFilter) {
  const items = listFilters();
  const idx = items.findIndex((f) => f.id === filter.id);
  if (idx >= 0) items[idx] = filter;
  else items.unshift(filter);
  saveFilters(items);
  return items;
}

export function deleteFilter(id: string) {
  saveFilters(listFilters().filter((f) => f.id !== id));
}

export function listDashboards(): SavedDashboard[] {
  const items = readJson<SavedDashboard[]>(DASH_KEY, []);
  if (items.length === 0) {
    const def: SavedDashboard = {
      id: "default",
      name: "Default dashboard",
      widgets: ["my_open", "projects", "by_status"],
      created_at: new Date().toISOString(),
    };
    writeJson(DASH_KEY, [def]);
    return [def];
  }
  return items;
}

export function upsertDashboard(dash: SavedDashboard) {
  const items = listDashboards();
  const idx = items.findIndex((d) => d.id === dash.id);
  if (idx >= 0) items[idx] = dash;
  else items.unshift(dash);
  writeJson(DASH_KEY, items);
  return items;
}

export function deleteDashboard(id: string) {
  writeJson(
    DASH_KEY,
    listDashboards().filter((d) => d.id !== id),
  );
}
