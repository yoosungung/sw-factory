import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { client, type Client, type Project, type Ticket, type User } from "../api";
import { initials, STATUS_LABEL } from "../components/issue/IssuePanel";
import {
  deleteDashboard,
  deleteFilter,
  listDashboards,
  listFilters,
  type SavedDashboard,
  type SavedFilter,
  upsertDashboard,
  upsertFilter,
} from "../lib/savedViews";
import type { ChromeFn } from "./Personal";

function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    void client.clients().then((r) => setClients(r.clients));
  }, []);
  return clients;
}

function useAllProjects(clients: Client[]) {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    void (async () => {
      const lists = await Promise.all(clients.map((c) => client.clientProjects(c.id)));
      setProjects(lists.flatMap((l) => l.projects));
    })();
  }, [clients]);
  return projects;
}

function newId() {
  return crypto.randomUUID();
}

export function FiltersPage({
  user,
  onLogout,
  chrome,
}: {
  user: User;
  onLogout: () => void;
  chrome: ChromeFn;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const clients = useClients();
  const projects = useAllProjects(clients);
  const [filters, setFilters] = useState(listFilters);
  const [results, setResults] = useState<Array<Ticket & { project?: Project }>>([]);

  const active = filters.find((f) => f.id === id) ?? null;

  useEffect(() => {
    if (!active) {
      setResults([]);
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
          const text = (active.query.text ?? "").trim().toLowerCase();
          return r.tickets
            .filter((t) => !text || t.title.toLowerCase().includes(text))
            .map((t) => ({ ...t, project: p }));
        }),
      );
      setResults(lists.flat());
    })();
  }, [active, projects]);

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
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
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
                  deleteFilter(active.id);
                  setFilters(listFilters());
                  navigate("/filters");
                }}
              >
                Delete
              </button>
              <h2 className="section-title">Results</h2>
              <div className="tableish">
                {results.map((t) => (
                  <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                    <span>{t.title}</span>
                    <span className="muted">{t.project?.name}</span>
                    <span className="muted">{STATUS_LABEL[t.status]}</span>
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

export function DashboardsPage({
  user,
  onLogout,
  chrome,
}: {
  user: User;
  onLogout: () => void;
  chrome: ChromeFn;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const clients = useClients();
  const projects = useAllProjects(clients);
  const [dashes, setDashes] = useState(listDashboards);
  const active = dashes.find((d) => d.id === (id ?? "default")) ?? dashes[0] ?? null;
  const [myOpen, setMyOpen] = useState<Ticket[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      const lists = await Promise.all(
        projects.map(async (p) => {
          const r = await client.tickets(p.id, { assignee_id: "me" });
          return r.tickets.filter((t) => t.status !== "done");
        }),
      );
      const open = lists.flat();
      setMyOpen(open);
      const counts: Record<string, number> = {
        backlog: 0,
        todo: 0,
        in_progress: 0,
        done: 0,
      };
      for (const p of projects) {
        const r = await client.tickets(p.id, { limit: 100 });
        for (const t of r.tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;
      }
      setByStatus(counts);
    })();
  }, [projects]);

  function createDash() {
    const d: SavedDashboard = {
      id: newId(),
      name: "New dashboard",
      widgets: ["my_open", "projects"],
      created_at: new Date().toISOString(),
    };
    setDashes(upsertDashboard(d));
    navigate(`/dashboards/${d.id}`);
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
          <h1>Dashboards</h1>
          <button type="button" className="btn-primary" onClick={createDash}>
            Create dashboard
          </button>
        </div>
        <p className="muted pad">Layout stored locally; widgets use live API data.</p>
        <div className="activity-tabs pad">
          {dashes.map((d) => (
            <Link
              key={d.id}
              className={`chip ${active?.id === d.id ? "active" : ""}`}
              to={`/dashboards/${d.id}`}
            >
              {d.name}
            </Link>
          ))}
        </div>
        {active && (
          <div className="content-panel settings-form">
            <label>
              Name
              <input
                value={active.name}
                onChange={(e) => {
                  const next = { ...active, name: e.target.value };
                  setDashes(upsertDashboard(next));
                }}
              />
            </label>
            {active.id !== "default" && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  deleteDashboard(active.id);
                  setDashes(listDashboards());
                  navigate("/dashboards/default");
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
        <div className="dash-grid">
          {active?.widgets.includes("my_open") && (
            <section className="content-panel">
              <h2 className="section-title">My open issues</h2>
              {myOpen.slice(0, 8).map((t) => (
                <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                  <span>{t.title}</span>
                  <span className="muted">{STATUS_LABEL[t.status]}</span>
                </Link>
              ))}
              {myOpen.length === 0 && <div className="empty">No open issues.</div>}
              <Link className="menu-item" to="/your-work">
                Go to Your work
              </Link>
            </section>
          )}
          {active?.widgets.includes("projects") && (
            <section className="content-panel">
              <h2 className="section-title">Projects I can access</h2>
              {projects.slice(0, 8).map((p) => (
                <Link key={p.id} to={`/projects/${p.id}?view=board`} className="list-row linkish">
                  <span className="name-cell">
                    <span className="project-icon sm">{initials(p.name)}</span>
                    {p.name}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {active?.widgets.includes("by_status") && (
            <section className="content-panel">
              <h2 className="section-title">Issues by status</h2>
              {Object.entries(byStatus).map(([status, count]) => (
                <div key={status} className="list-row">
                  <span>{STATUS_LABEL[status as Ticket["status"]] ?? status}</span>
                  <span className="muted">{count}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      </>
    ),
  });
}

export function starredFilters() {
  return listFilters().filter((f) => f.starred);
}

export function dashboardSummaries() {
  return listDashboards();
}
