import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { client, type Client, type Project, type Ticket, type User } from "../api";
import { initials, STATUS_LABEL } from "../components/issue/IssuePanel";
import { EmptyState } from "../components/EmptyState";
import { recentProjectIds, recentTicketIds } from "../lib/recent";

function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    void client.clients().then((r) => setClients(r.clients));
  }, []);
  return clients;
}

function useAllProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    void client.projects().then((r) => setProjects(r.projects));
  }, []);
  return projects;
}

export type ChromeProps = {
  user: User;
  onLogout: () => void;
  clients: Client[];
  projects: Project[];
  view: "list";
  children: React.ReactNode;
};

export type ChromeFn = (props: ChromeProps) => React.ReactNode;

export function YourWorkPage({
  user,
  onLogout,
  chrome,
}: {
  user: User;
  onLogout: () => void;
  chrome: ChromeFn;
}) {
  const clients = useClients();
  const projects = useAllProjects();
  const [tab, setTab] = useState<"assigned" | "viewed" | "projects">("assigned");
  const [assigned, setAssigned] = useState<Array<Ticket & { project?: Project }>>([]);
  const [viewed, setViewed] = useState<Array<Ticket & { project?: Project }>>([]);

  const recentProjects = useMemo(() => {
    const ids = recentProjectIds();
    const byId = new Map(projects.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Project[];
    return ordered.length > 0 ? ordered : projects.slice(0, 8);
  }, [projects]);

  useEffect(() => {
    void (async () => {
      const lists = await Promise.all(
        projects.map(async (p) => {
          const r = await client.tickets(p.id, { assignee_id: "me" });
          return r.tickets.map((t) => ({ ...t, project: p }));
        }),
      );
      setAssigned(lists.flat());
    })();
  }, [projects]);

  useEffect(() => {
    const ids = recentTicketIds();
    if (ids.length === 0) {
      setViewed([]);
      return;
    }
    void (async () => {
      const rows: Array<Ticket & { project?: Project }> = [];
      for (const id of ids) {
        try {
          const t = await client.getTicket(id);
          const p = projects.find((x) => x.id === t.ticket.project_id);
          rows.push({ ...t.ticket, project: p });
        } catch {
          /* ignore missing */
        }
      }
      setViewed(rows);
    })();
  }, [projects]);

  return chrome({
    user,
    onLogout,
    clients,
    projects,
    view: "list",
    children: (
      <>
        <div className="page-header">
          <h1>Your work</h1>
          <div className="row-gap">
            <Link className="btn-subtle" to="/dashboards">
              Dashboard
            </Link>
          </div>
          <div className="activity-tabs">
            {(
              [
                ["assigned", "Assigned to me"],
                ["viewed", "Recently viewed"],
                ["projects", "Recent projects"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "assigned" && (
          <div className="content-panel tableish">
            <div className="list-row head">
              <span>Issue</span>
              <span>Project</span>
              <span>Status</span>
              <span>Due</span>
            </div>
            {assigned.map((t) => (
              <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                <span>{t.title}</span>
                <span className="muted">{t.project?.name}</span>
                <span className="muted">{STATUS_LABEL[t.status]}</span>
                <span className="muted">{t.due_at ?? "—"}</span>
              </Link>
            ))}
            {assigned.length === 0 && (
              <EmptyState
                title="No issues assigned to you"
                description="When someone assigns you work, it will show up here."
                actionLabel="Go to projects"
                actionHref="/"
              />
            )}
          </div>
        )}
        {tab === "viewed" && (
          <div className="content-panel tableish">
            {viewed.map((t) => (
              <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                <span>{t.title}</span>
                <span className="muted">{t.project?.name}</span>
                <span className="muted">{STATUS_LABEL[t.status]}</span>
              </Link>
            ))}
            {viewed.length === 0 && (
              <EmptyState
                title="Nothing viewed yet"
                description="Open an issue to see it in your recently viewed list."
                actionLabel="Go to projects"
                actionHref="/"
              />
            )}
          </div>
        )}
        {tab === "projects" && (
          <div className="content-panel tableish">
            {recentProjects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}?view=board`} className="list-row linkish">
                <span className="name-cell">
                  <span className="project-icon sm">{initials(p.name)}</span>
                  {p.name}
                </span>
                <span className="muted">Open board</span>
              </Link>
            ))}
          </div>
        )}
      </>
    ),
  });
}

export function AccountPage({
  user,
  onLogout,
  onUserUpdate,
  chrome,
}: {
  user: User;
  onLogout: () => void;
  onUserUpdate: (u: User) => void;
  chrome: ChromeFn;
}) {
  const clients = useClients();
  const projects = useAllProjects();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const r = await client.updateProfile({ name: name.trim(), email: email.trim() });
      onUserUpdate(r.user);
      setMsg("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await client.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setMsg("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    }
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
          <h1>Account</h1>
        </div>
        <div className="content-panel settings-form">
          {error && <p className="error">{error}</p>}
          {msg && <p className="muted">{msg}</p>}
          <form onSubmit={(e) => void saveProfile(e)}>
            <h2 className="section-title">Profile</h2>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn-primary">
              Save profile
            </button>
          </form>
          <form onSubmit={(e) => void savePassword(e)}>
            <h2 className="section-title">Security</h2>
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="btn-primary">
              Change password
            </button>
          </form>
          <button type="button" className="btn-subtle" onClick={onLogout}>
            Log out
          </button>
        </div>
      </>
    ),
  });
}

export function SearchPage({
  user,
  onLogout,
  chrome,
}: {
  user: User;
  onLogout: () => void;
  chrome: ChromeFn;
}) {
  const clients = useClients();
  const projects = useAllProjects();
  const [params, setParams] = useSearchParams();
  const qParam = params.get("q") ?? "";
  const [q, setQ] = useState(qParam);
  const [results, setResults] = useState<{
    clients: Client[];
    projects: Project[];
    tickets: Ticket[];
  }>({ clients: [], projects: [], tickets: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => setQ(qParam), [qParam]);

  useEffect(() => {
    const term = qParam.trim();
    if (!term) {
      setResults({ clients: [], projects: [], tickets: [] });
      return;
    }
    const handle = window.setTimeout(() => {
      setBusy(true);
      void client
        .search(term)
        .then(setResults)
        .catch(() => setResults({ clients: [], projects: [], tickets: [] }))
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [qParam]);

  return chrome({
    user,
    onLogout,
    clients,
    projects,
    view: "list",
    children: (
      <>
        <div className="page-header">
          <h1>Search</h1>
          <p className="muted pad">
            <Link to="/filters">Saved filters</Link>
          </p>
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              setParams(q.trim() ? { q: q.trim() } : {});
            }}
          >
            <input
              aria-label="Search query"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search issues, projects, spaces…"
              autoFocus
            />
          </form>
        </div>
        {busy && <p className="muted pad">Searching…</p>}
        {!qParam.trim() && (
          <EmptyState
            title="Search the workspace"
            description="Type a query to find issues, projects, and spaces."
          />
        )}
        {qParam.trim() && (
          <>
            <h2 className="section-title pad">Issues</h2>
            <div className="content-panel tableish">
              {results.tickets.map((t) => (
                <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                  <span>{t.title}</span>
                  <span className="muted">{STATUS_LABEL[t.status]}</span>
                </Link>
              ))}
              {results.tickets.length === 0 && (
                <EmptyState title="No issues" description="Try a different keyword or check spelling." />
              )}
            </div>
            <h2 className="section-title pad">Projects</h2>
            <div className="content-panel tableish">
              {results.projects.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}?view=board`} className="list-row linkish">
                  <span>{p.name}</span>
                </Link>
              ))}
              {results.projects.length === 0 && (
                <EmptyState title="No projects" description="No projects matched this query." />
              )}
            </div>
            <h2 className="section-title pad">Spaces</h2>
            <div className="content-panel tableish">
              {results.clients.map((c) => (
                <Link key={c.id} to={`/clients/${c.id}`} className="list-row linkish">
                  <span>{c.name}</span>
                </Link>
              ))}
              {results.clients.length === 0 && (
                <EmptyState title="No spaces" description="No spaces matched this query." />
              )}
            </div>
          </>
        )}
      </>
    ),
  });
}

export function useNavSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  return {
    value,
    setValue,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const q = value.trim();
        navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }
    },
    openSearch: () => navigate(value.trim() ? `/search?q=${encodeURIComponent(value.trim())}` : "/search"),
  };
}
