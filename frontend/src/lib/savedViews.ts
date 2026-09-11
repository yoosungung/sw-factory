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

const FILTERS_KEY = "lt_saved_filters";

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
