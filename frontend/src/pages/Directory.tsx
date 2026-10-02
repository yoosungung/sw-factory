import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { client, type Client, type Project, type Ticket, type User } from "../api";
import { statusLabel } from "../components/issue/IssuePanel";
import {
  deleteFilter,
  listFilters,
  type SavedFilter,
  upsertFilter,
} from "../lib/savedViews";
import type { ChromeFn } from "./Personal";

function newId() {
  return crypto.randomUUID();
}

export function FiltersPage({
  user,
  onLogout,
  chrome,
  clients,
  projects,
}: {
  user: User;
  onLogout: () => void;
  chrome: ChromeFn;
  clients: Client[];
  projects: Project[];
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(listFilters);
  const [fetched, setFetched] = useState<Array<Ticket & { project?: Project }>>([]);
  const [debouncedText, setDebouncedText] = useState("");

  const active = filters.find((f) => f.id === id) ?? null;
  const queryKey = active
    ? [
        active.id,
        active.query.project_id ?? "",
        active.query.status ?? "",
        active.query.type ?? "",
        active.query.assignee ?? "",
      ].join("|")
    : "";

  useEffect(() => {
    if (!active) {
      setDebouncedText("");
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedText(active.query.text ?? "");
    }, 250);
    return () => window.clearTimeout(handle);
  }, [active?.id, active?.query.text]);

  useEffect(() => {
    if (!active) {
      setFetched([]);
      return;
    }
    void (async () => {
      const targets = active.query.project_id
        ? projects.filter((p) => p.id === active.query.project_id)
        : projects;
      const lists = await Promise.all(
        targets.map(async (p) => {
          const r = await client.tickets(p.id, {
            status: active.query.status || undefined,
            type: active.query.type || undefined,
            assignee_id: active.query.assignee === "me" ? "me" : undefined,
          });
          return r.tickets.map((t) => ({ ...t, project: p }));
        }),
      );
      setFetched(lists.flat());
    })();
  }, [queryKey, projects]);

  const results = useMemo(() => {
    const text = debouncedText.trim().toLowerCase();
    if (!text) return fetched;
    return fetched.filter((t) => t.title.toLowerCase().includes(text));
  }, [fetched, debouncedText]);

  function createFilter() {
    const f: SavedFilter = {
      id: newId(),
      name: "New filter",
      starred: false,
      query: { text: "", assignee: "me" },
      created_at: new Date().toISOString(),
    };
    setFilters(upsertFilter(f));
    navigate(`/filters/${f.id}`);
  }

  return chrome({
    user,
    onLogout,
    clients,
    projects,
    view: "list",
    children: (
      <>
        <div className="page-header">
          <h1>Filters</h1>
          <button type="button" className="btn-primary" onClick={createFilter}>
            Create filter
          </button>
        </div>
        <p className="muted pad">Saved locally in this browser (server sync later).</p>
        <div className="settings-layout">
          <div className="content-panel tableish">
            {filters.map((f) => (
              <Link
                key={f.id}
                to={`/filters/${f.id}`}
                className={`list-row linkish ${active?.id === f.id ? "active-row" : ""}`}
              >
                <span>{f.starred ? "★ " : ""}{f.name}</span>
                <span className="muted">{f.query.assignee === "me" ? "Assigned to me" : "All"}</span>
              </Link>
            ))}
            {filters.length === 0 && <div className="empty">No saved filters yet.</div>}
          </div>
          {active && (
            <div className="content-panel settings-form">
              <label>
                Name
                <input
                  value={active.name}
                  onChange={(e) => {
                    const next = { ...active, name: e.target.value };
                    setFilters(upsertFilter(next));
                  }}
                />
              </label>
              <label>
                Text contains
                <input
                  value={active.query.text ?? ""}
                  onChange={(e) => {
                    const next = {
                      ...active,
                      query: { ...active.query, text: e.target.value },
                    };
                    setFilters(upsertFilter(next));
                  }}
                />
              </label>
              <label>
                Project
                <select
                  value={active.query.project_id ?? ""}
                  onChange={(e) => {
                    const next = {
                      ...active,
                      query: { ...active.query, project_id: e.target.value || undefined },
                    };
                    setFilters(upsertFilter(next));
                  }}
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={active.query.status ?? ""}
                  onChange={(e) => {
                    const next = {
                      ...active,
                      query: { ...active.query, status: e.target.value || undefined },
                    };
                    setFilters(upsertFilter(next));
                  }}
                >
                  <option value="">Any</option>
                  <option value="backlog">Backlog</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="deploying_test">Deploying Test</option>
                  <option value="qa">QA</option>
                  <option value="deploying_prod">Deploying Prod</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                  <option value="waiting_for_approval">Waiting for Approval</option>
                </select>
              </label>
              <label>
                Assignee
                <select
                  value={active.query.assignee ?? ""}
                  onChange={(e) => {
                    const assignee = e.target.value === "me" ? ("me" as const) : ("" as const);
                    const next = {
                      ...active,
                      query: {
                        ...active.query,
                        assignee,
                      },
                    };
                    setFilters(upsertFilter(next));
                  }}
                >
                  <option value="">Anyone</option>
                  <option value="me">Assigned to me</option>
                </select>
              </label>
              <label className="row-gap">
                <input
                  type="checkbox"
                  checked={active.starred}
                  onChange={(e) => {
                    const next = { ...active, starred: e.target.checked };
                    setFilters(upsertFilter(next));
                  }}
                />
                Starred
              </label>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  setFilters(deleteFilter(active.id));
                  navigate("/filters");
                }}
              >
                Delete filter
              </button>
              <h3>Results ({results.length})</h3>
              <div className="tableish">
                {results.map((t) => (
                  <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                    <span>{t.title}</span>
                    <span className="muted">{t.project?.name}</span>
                    <span className="muted">{statusLabel(t.status)}</span>
                  </Link>
                ))}
                {results.length === 0 && <div className="empty">No matching issues.</div>}
              </div>
            </div>
          )}
        </div>
      </>
    ),
  });
}
