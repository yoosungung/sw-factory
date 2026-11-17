import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { client, type Client, type Project, type Ticket, type User } from "../api";
import { statusLabel } from "../components/issue/IssuePanel";
import { EmptyState } from "../components/EmptyState";
import { recentTicketIds } from "../lib/recent";
import { ticketsNewestFirst } from "../lib/ticketOrder";

const OVERVIEW_PREVIEW_LIMIT = 5;

type ProjectOverviewPulse = {
  project: Project;
  active: Ticket[];
  milestones: Ticket[];
};

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
  const [tab, setTab] = useState<"assigned" | "created" | "viewed" | "overviews">("assigned");
  const [assigned, setAssigned] = useState<Array<Ticket & { project?: Project }>>([]);
  const [created, setCreated] = useState<Array<Ticket & { project?: Project }>>([]);
  const [viewed, setViewed] = useState<Array<Ticket & { project?: Project }>>([]);
  const [overviews, setOverviews] = useState<ProjectOverviewPulse[] | null>(null);

  useEffect(() => {
    void (async () => {
      const lists = await Promise.all(
        projects.map(async (p) => {
          const r = await client.tickets(p.id, { assignee_id: "me", exclude_done: true });
          return r.tickets.map((t) => ({ ...t, project: p }));
        }),
      );
      setAssigned(ticketsNewestFirst(lists.flat()));
    })();
  }, [projects]);

  useEffect(() => {
    void (async () => {
      const lists = await Promise.all(
        projects.map(async (p) => {
          const r = await client.tickets(p.id, { created_by: "me" });
          return r.tickets.map((t) => ({ ...t, project: p }));
        }),
      );
      setCreated(ticketsNewestFirst(lists.flat()));
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

  useEffect(() => {
    if (tab !== "overviews") return;
    if (projects.length === 0) {
      setOverviews([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const pulses = await Promise.all(
        projects.map(async (p) => {
          try {
            const [k, m] = await Promise.all([
              client.kanban(p.id),
              client.tickets(p.id, { type: "milestone" }),
            ]);
            const active = k.statuses
              .filter((s) => s.category === "active")
              .flatMap((s) => k.columns[s.key] ?? [])
              .slice(0, OVERVIEW_PREVIEW_LIMIT);
            const doneKeys = new Set(
              k.statuses.filter((s) => s.category === "done").map((s) => s.key),
            );
            const milestones = m.tickets
              .filter((t) => !doneKeys.has(t.status))
              .slice(0, OVERVIEW_PREVIEW_LIMIT);
            return { project: p, active, milestones };
          } catch {
            return { project: p, active: [], milestones: [] };
          }
        }),
      );
      if (!cancelled) setOverviews(pulses);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, projects]);

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
          <div className="activity-tabs">
            {(
              [
                ["assigned", "Assigned to me"],
                ["created", "Created by me"],
                ["viewed", "Recently viewed"],
                ["overviews", "Overviews"],
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
        <div className="page-scroll">
        {tab === "assigned" && (
          <div className="content-panel tableish your-work-issues">
            <div className="list-row head">
              <span>Issue</span>
              <span>Project</span>
              <span>Status</span>
              <span>Due</span>
            </div>
            {assigned.map((t) => (
              <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                <span className="your-work-issue-title">{t.title}</span>
                <span className="muted">{t.project?.name}</span>
                <span className="muted">{statusLabel(t.status)}</span>
                <span className="muted">{t.due_at ?? "—"}</span>
              </Link>
            ))}
            {assigned.length === 0 && (
              <EmptyState
                title="No issues assigned to you"
                description="When someone assigns you work, it will show up here."
              />
            )}
          </div>
        )}
        {tab === "created" && (
          <div className="content-panel tableish your-work-issues">
            <div className="list-row head">
              <span>Issue</span>
              <span>Project</span>
              <span>Status</span>
              <span>Due</span>
            </div>
            {created.map((t) => (
              <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                <span className="your-work-issue-title">{t.title}</span>
                <span className="muted">{t.project?.name}</span>
                <span className="muted">{statusLabel(t.status)}</span>
                <span className="muted">{t.due_at ?? "—"}</span>
              </Link>
            ))}
            {created.length === 0 && (
              <EmptyState
                title="No issues created by you"
                description="Issues you create will show up here."
              />
            )}
          </div>
        )}
        {tab === "viewed" && (
          <div className="content-panel tableish your-work-issues">
            <div className="list-row head">
              <span>Issue</span>
              <span>Project</span>
              <span>Status</span>
              <span>Due</span>
            </div>
            {viewed.map((t) => (
              <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                <span className="your-work-issue-title">{t.title}</span>
                <span className="muted">{t.project?.name}</span>
                <span className="muted">{statusLabel(t.status)}</span>
                <span className="muted">{t.due_at ?? "—"}</span>
              </Link>
            ))}
            {viewed.length === 0 && (
              <EmptyState
                title="Nothing viewed yet"
                description="Open an issue to see it in your recently viewed list."
              />
            )}
          </div>
        )}
        {tab === "overviews" && (
          <div className="your-work-overviews">
            {overviews === null && <p className="muted pad">Loading…</p>}
            {overviews !== null && overviews.length === 0 && (
              <EmptyState
                title="No projects yet"
                description="Join or create a project to see In progress work and open milestones here."
              />
            )}
            {overviews?.map(({ project: p, active, milestones }) => (
              <section key={p.id} className="overview-section" data-project-id={p.id}>
                <h2>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                </h2>
                <h3>In progress</h3>
                {active.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    title="Nothing in progress"
                    description="Tickets in an active status show up here."
                  />
                ) : (
                  <div className="content-panel tableish overview-active-list">
                    {active.map((t) => (
                      <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                        <span className="your-work-issue-title">{t.title}</span>
                        <span className="muted">{statusLabel(t.status)}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <h3>Open milestones</h3>
                {milestones.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    title="No open milestones"
                    description="Milestones that are not done appear here."
                  />
                ) : (
                  <div className="content-panel tableish overview-active-list">
                    {milestones.map((t) => (
                      <Link key={t.id} to={`/browse/${t.id}`} className="list-row linkish">
                        <span className="your-work-issue-title">{t.title}</span>
                        <span className="muted">{statusLabel(t.status)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
        </div>
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
        <div className="page-scroll">
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
        <div className="page-scroll">
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
                  <span className="muted">{statusLabel(t.status)}</span>
                </Link>
              ))}
              {results.tickets.length === 0 && (
                <EmptyState title="No issues" description="Try a different keyword or check spelling." />
              )}
            </div>
            <h2 className="section-title pad">Projects</h2>
            <div className="content-panel tableish">
              {results.projects.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="list-row linkish">
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
        </div>
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
