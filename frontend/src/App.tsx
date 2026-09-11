import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  client,
  type Client,
  type Member,
  type Project,
  type Ticket,
  type TicketPriority,
  type User,
} from "./api";
import {
  IssuePanel,
  issueKey,
  initials,
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUSES,
  PRIORITIES,
  type IssueOpenMode,
} from "./components/issue/IssuePanel";
import { ClientSettingsPage, ProjectSettingsPage } from "./pages/Settings";
import { AdminPage } from "./pages/Admin";
import {
  AccountPage,
  SearchPage,
  YourWorkPage,
} from "./pages/Personal";
import { DashboardsPage, FiltersPage } from "./pages/Directory";
import { touchRecentProject, touchRecentTicket } from "./lib/recent";

type ViewMode = "board" | "backlog" | "timeline" | "list";

const EMPTY_CLIENTS: Client[] = [];
const EMPTY_PROJECTS: Project[] = [];

function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="4" y="4" width="24" height="24" rx="6" fill="#0B6E4F" />
      <path
        fill="#F4FBF7"
        d="M10 21.5V10.5h3.1c2.4 0 3.9 1.2 3.9 3.2 0 1.3-.7 2.3-1.9 2.8l2.4 5h-2.5l-2.1-4.5h-.8V21.5H10zm2.1-6.3h.9c1.1 0 1.7-.5 1.7-1.4s-.6-1.3-1.7-1.3h-.9v2.7zM19.2 21.5l2.6-11h2.4l2.6 11h-2.3l-.4-2h-2.2l-.4 2h-2.3zm3.4-3.8h1.4l-.7-3.3-.7 3.3z"
      />
    </svg>
  );
}

const APP_NAME = "SW Factory";

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

function useEscape(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, active]);
}

function MenuDropdown({
  label,
  open,
  onToggle,
  onClose,
  children,
  align = "left",
}: {
  label: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const ref = useClickOutside(onClose);
  return (
    <div className={`menu ${align === "right" ? "menu-right" : ""}`} ref={ref}>
      <button type="button" className={`nav-item ${open ? "open" : ""}`} onClick={onToggle}>
        {label}
        <span className="chev">▾</span>
      </button>
      {open && <div className="menu-panel">{children}</div>}
    </div>
  );
}

function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    client
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);
  return { user, setUser };
}

function useClients(enabled = true) {
  const [clients, setClients] = useState<Client[]>([]);
  const reload = () => client.clients().then((r) => setClients(r.clients));
  useEffect(() => {
    if (!enabled) {
      setClients((prev) => (prev.length === 0 ? prev : EMPTY_CLIENTS));
      return;
    }
    void reload();
  }, [enabled]);
  return { clients, reload };
}

function useAllProjects(enabled = true) {
  const [projects, setProjects] = useState<Project[]>(EMPTY_PROJECTS);
  useEffect(() => {
    if (!enabled) {
      setProjects(EMPTY_PROJECTS);
      return;
    }
    let cancelled = false;
    void client.projects().then((r) => {
      if (cancelled) return;
      const next = r.projects;
      setProjects((prev) => {
        if (prev.length === next.length && prev.every((p, i) => p.id === next[i]?.id)) return prev;
        return next.length === 0 ? EMPTY_PROJECTS : next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return projects;
}

function AuthForm({
  mode,
  onDone,
}: {
  mode: "login" | "register";
  onDone: (u: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "login"
          ? await client.login({ email, password })
          : await client.register({ email, password, name });
      onDone(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <BrandMark size={40} />
        </div>
        <h1>{mode === "login" ? `Log in to ${APP_NAME}` : `Sign up for ${APP_NAME}`}</h1>
        {mode === "register" && (
          <label>
            Full name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary wide" disabled={busy}>
          {mode === "login" ? "Continue" : "Sign up"}
        </button>
        <p className="auth-footer">
          {mode === "login" ? (
            <>
              New? <Link to="/register">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

function CreateIssueDialog({
  clients,
  projects,
  defaultProjectId,
  defaultClientId,
  defaultStatus,
  docked,
  onDock,
  onClose,
  onCreated,
}: {
  clients: Client[];
  projects: Project[];
  defaultProjectId?: string;
  defaultClientId?: string;
  defaultStatus?: Ticket["status"];
  docked: boolean;
  onDock: () => void;
  onClose: () => void;
  onCreated: (projectId: string, ticketId: string) => void;
}) {
  const [projectId, setProjectId] = useState(
    defaultProjectId ?? projects[0]?.id ?? "",
  );
  const [type, setType] = useState<Ticket["type"]>("task");
  const [status, setStatus] = useState<Ticket["status"]>(defaultStatus ?? "todo");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEscape(onClose, true);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      return;
    }
    void client.projectMembers(projectId).then((r) => setMembers(r.members));
  }, [projectId]);

  const filteredProjects = useMemo(() => {
    if (!defaultClientId) return projects;
    const same = projects.filter((p) => p.client_id === defaultClientId);
    return same.length ? same : projects;
  }, [projects, defaultClientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError("Select a project");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await client.createTicket(projectId, {
        title: summary,
        description,
        type,
        status,
        priority,
        assignee_id: assigneeId || null,
        due_at: dueAt || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      });
      onCreated(projectId, r.ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      setBusy(false);
    }
  }

  return (
    <div className={`create-layer ${docked ? "docked" : ""}`} onMouseDown={onClose}>
      <form
        className={`create-dialog ${expanded ? "expanded" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="create-dialog-head">
          <strong>Create</strong>
          <div className="create-head-actions">
            <button type="button" className="icon-btn" title="Dock" onClick={onDock}>
              ▢
            </button>
            <button
              type="button"
              className="icon-btn"
              title={expanded ? "Collapse" : "Full form"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "↙" : "↗"}
            </button>
            <button type="button" className="icon-btn" title="Close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="create-dialog-body">
          <label>
            Project <span className="req">*</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              {filteredProjects.map((p) => {
                const c = clients.find((x) => x.id === p.client_id);
                return (
                  <option key={p.id} value={p.id}>
                    {c ? `${c.name} / ` : ""}
                    {p.name}
                  </option>
                );
              })}
            </select>
          </label>

          <label>
            Work type <span className="req">*</span>
            <select value={type} onChange={(e) => setType(e.target.value as Ticket["type"])}>
              <option value="task">Task</option>
              <option value="milestone">Epic / Milestone</option>
            </select>
          </label>

          <label className="span-2">
            Summary <span className="req">*</span>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What needs to be done?"
              required
              autoFocus
            />
          </label>

          {(expanded || type === "milestone") && (
            <>
              <label className="span-2">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description…"
                />
              </label>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Ticket["status"])}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </label>
              <label>
                Start date
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label>
                End date
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </>
          )}
        </div>

        {error && <p className="error pad">{error}</p>}
        <div className="create-dialog-foot">
          <button type="button" className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !projectId}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateSpaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (clientId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEscape(onClose, true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await client.createClient({ name, description });
    onCreated(r.client.id);
  }

  return (
    <div className="create-layer" onMouseDown={onClose}>
      <form className="create-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="create-dialog-head">
          <strong>Create space</strong>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="create-dialog-body">
          <label className="span-2">
            Name <span className="req">*</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="span-2">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="create-dialog-foot">
          <button type="button" className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateProjectUnderClientDialog({
  clientId,
  clients,
  onClose,
  onCreated,
}: {
  clientId?: string;
  clients?: Client[];
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("");
  const [spaceId, setSpaceId] = useState(clientId ?? clients?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  useEscape(onClose, true);
  const pickSpace = !clientId && (clients?.length ?? 0) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setBusy(true);
    const r = await client.createProject({ name, client_id: spaceId });
    onCreated(r.project.id);
  }

  return (
    <div className="create-layer" onMouseDown={onClose}>
      <form className="create-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="create-dialog-head">
          <strong>Create project</strong>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="create-dialog-body">
          {pickSpace && (
            <label className="span-2">
              Space <span className="req">*</span>
              <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} required>
                {clients!.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="span-2">
            Name <span className="req">*</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
        </div>
        <div className="create-dialog-foot">
          <button type="button" className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !spaceId}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function navItemClass(active: boolean) {
  return `nav-item ${active ? "open" : ""}`;
}

function TopNav({
  user,
  onLogout,
  onCreateIssue,
}: {
  user: User;
  onLogout: () => void;
  onCreateIssue: () => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQ, setSearchQ] = useState("");
  const close = () => setMenu(null);
  const path = location.pathname;
  const spacesActive = path === "/spaces" || path.startsWith("/clients/");
  const projectsActive = path === "/" || path.startsWith("/projects/");
  const workActive = path === "/your-work";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/search");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <header className="top-nav">
      <Link to="/" className="nav-brand" onClick={close}>
        <BrandMark />
        <span>{APP_NAME}</span>
      </Link>

      <Link to="/spaces" className={navItemClass(spacesActive)}>
        Spaces
      </Link>
      <Link to="/" className={navItemClass(projectsActive)}>
        Projects
      </Link>
      <Link to="/your-work" className={navItemClass(workActive)}>
        Your work
      </Link>

      <button type="button" className="btn-create" onClick={onCreateIssue}>
        Create
      </button>

      <div className="nav-spacer" />
      <input
        className="nav-search"
        placeholder="Search"
        aria-label="Search"
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const q = searchQ.trim();
            navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
          }
        }}
      />

      <MenuDropdown
        label={<span className="avatar-inline">{initials(user.name)}</span>}
        open={menu === "profile"}
        onToggle={() => setMenu(menu === "profile" ? null : "profile")}
        onClose={close}
        align="right"
      >
        <div className="menu-profile">
          <div className="avatar lg">{initials(user.name)}</div>
          <div>
            <div className="strong">{user.name}</div>
            <div className="muted">{user.email}</div>
          </div>
        </div>
        <div className="menu-sep" />
        <Link className="menu-item" to="/account" onClick={close}>
          Account
        </Link>
        {user.is_admin && (
          <Link className="menu-item" to="/admin" onClick={close}>
            Admin
          </Link>
        )}
        <div className="menu-sep" />
        <button
          type="button"
          className="menu-item btn-as-item"
          onClick={() => {
            close();
            onLogout();
          }}
        >
          Log out
        </button>
      </MenuDropdown>
    </header>
  );
}

function Sidebar({
  clients,
  activeClient,
  activeProject,
  view,
  collapsed,
  onToggle,
}: {
  clients: Client[];
  activeClient?: Client | null;
  activeProject?: Project | null;
  view: ViewMode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <button type="button" className="icon-btn side-toggle" onClick={onToggle} title="Expand">
          »
        </button>
      </aside>
    );
  }

  const base = activeProject ? `/projects/${activeProject.id}` : "";

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link to="/" className="back-link">
          ← Back to projects
        </Link>
        <button type="button" className="icon-btn" onClick={onToggle} title="Collapse sidebar">
          «
        </button>
      </div>

      {(activeProject || activeClient) && (
        <div className="sidebar-project">
          <div className={`project-icon ${activeProject ? "" : "client"}`}>
            {initials((activeProject ?? activeClient)!.name)}
          </div>
          <div className="meta">
            <div className="name">{(activeProject ?? activeClient)!.name}</div>
            <div className="sub">
              {activeProject ? "Project" : "Space"} · Member access
            </div>
          </div>
        </div>
      )}

      {activeProject && (
        <>
          <div className="side-section">Planning</div>
          <nav className="side-nav">
            <Link
              className={`side-link ${view === "timeline" ? "active" : ""}`}
              to={`${base}?view=timeline`}
            >
              <span className="side-ico">📅</span> Timeline
            </Link>
            <Link
              className={`side-link ${view === "backlog" ? "active" : ""}`}
              to={`${base}?view=backlog`}
            >
              <span className="side-ico">☰</span> Backlog
            </Link>
            <Link
              className={`side-link ${view === "board" ? "active" : ""}`}
              to={`${base}?view=board`}
            >
              <span className="side-ico">▦</span> Board
            </Link>
            <Link
              className={`side-link ${view === "list" ? "active" : ""}`}
              to={`${base}?view=list`}
            >
              <span className="side-ico">≡</span> List
            </Link>
          </nav>
          <div className="side-section">Settings</div>
          <nav className="side-nav">
            <Link className="side-link" to={`/projects/${activeProject.id}/settings/details`}>
              Project settings
            </Link>
          </nav>
        </>
      )}

      <div className="side-section">Spaces</div>
      <nav className="side-nav">
        {clients.map((c) => (
          <Link
            key={c.id}
            to={`/clients/${c.id}`}
            className={`side-link ${activeClient?.id === c.id && !activeProject ? "active" : ""}`}
          >
            <span className="project-icon client sm">{initials(c.name)}</span>
            {c.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function AppChrome({
  user,
  onLogout,
  clients,
  projects,
  activeClient,
  activeProject,
  view,
  children,
  createDefaultStatus,
}: {
  user: User;
  onLogout: () => void;
  clients: Client[];
  projects: Project[];
  activeClient?: Client | null;
  activeProject?: Project | null;
  view: ViewMode;
  children: React.ReactNode;
  createDefaultStatus?: Ticket["status"];
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createIssue, setCreateIssue] = useState(false);
  const [docked, setDocked] = useState(false);
  const navigate = useNavigate();
  const showSidebar = Boolean(activeClient || activeProject);

  return (
    <div className="app-shell">
      <TopNav user={user} onLogout={onLogout} onCreateIssue={() => setCreateIssue(true)} />
      <div className={`shell-body ${showSidebar ? "" : "no-sidebar"}`.trim()}>
        {showSidebar && (
          <Sidebar
            clients={clients}
            activeClient={activeClient}
            activeProject={activeProject}
            view={view}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
          />
        )}
        <main className="main">{children}</main>
      </div>

      {createIssue && (
        <CreateIssueDialog
          clients={clients}
          projects={projects}
          defaultProjectId={activeProject?.id}
          defaultClientId={activeClient?.id ?? activeProject?.client_id}
          defaultStatus={createDefaultStatus}
          docked={docked}
          onDock={() => setDocked((v) => !v)}
          onClose={() => setCreateIssue(false)}
          onCreated={(projectId, ticketId) => {
            setCreateIssue(false);
            navigate(`/projects/${projectId}?view=board&issue=${ticketId}`);
          }}
        />
      )}
    </div>
  );
}

/* —— Pages —— */

function ProjectsHome({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { clients, reload } = useClients();
  const projects = useAllProjects();
  const [createSpace, setCreateSpace] = useState(false);
  const [createProject, setCreateProject] = useState(false);
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();

  const q = filter.trim().toLowerCase();
  const shown = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  const spaceName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? "—";

  return (
    <AppChrome user={user} onLogout={onLogout} clients={clients} projects={projects} view="list">
      <div className="page-header">
        <div className="breadcrumb">
          <span>{APP_NAME}</span>
        </div>
        <div className="page-title-row">
          <h1>Projects</h1>
          <div className="row-gap">
            {user.is_admin && (
              <button type="button" className="btn-subtle" onClick={() => setCreateSpace(true)}>
                Create space
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={clients.length === 0}
              onClick={() => setCreateProject(true)}
            >
              Create project
            </button>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <input
          className="quick-filter"
          placeholder="Search projects"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="content-panel tableish cols-3">
        <div className="list-row head">
          <span>Name</span>
          <span>Space</span>
          <span>Role</span>
        </div>
        {shown.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}?view=board`} className="list-row linkish">
            <span className="name-cell">
              <span className="project-icon sm">{initials(p.name)}</span>
              {p.name}
            </span>
            <span className="muted">{spaceName(p.client_id)}</span>
            <span className="muted">{p.role ?? "member"}</span>
          </Link>
        ))}
        {shown.length === 0 && (
          <div className="empty">
            {clients.length === 0
              ? user.is_admin
                ? "Create a space to get started."
                : "Ask an admin to add you to a space."
              : "No projects yet."}
          </div>
        )}
      </div>
      {createSpace && (
        <CreateSpaceDialog
          onClose={() => setCreateSpace(false)}
          onCreated={async (id) => {
            setCreateSpace(false);
            await reload();
            navigate(`/clients/${id}`);
          }}
        />
      )}
      {createProject && (
        <CreateProjectUnderClientDialog
          clients={clients}
          onClose={() => setCreateProject(false)}
          onCreated={(pid) => navigate(`/projects/${pid}`)}
        />
      )}
    </AppChrome>
  );
}

function SpacesPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { clients, reload } = useClients();
  const projects = useAllProjects();
  const [createSpace, setCreateSpace] = useState(false);
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();
  const q = filter.trim().toLowerCase();
  const shown = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;

  return (
    <AppChrome user={user} onLogout={onLogout} clients={clients} projects={projects} view="list">
      <div className="page-header">
        <div className="breadcrumb">
          <span>{APP_NAME}</span>
        </div>
        <div className="page-title-row">
          <h1>Spaces</h1>
          {user.is_admin && (
            <button type="button" className="btn-primary" onClick={() => setCreateSpace(true)}>
              Create space
            </button>
          )}
        </div>
      </div>
      <div className="toolbar">
        <input
          className="quick-filter"
          placeholder="Search spaces"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="content-panel tableish cols-2">
        <div className="list-row head">
          <span>Name</span>
          <span>Role</span>
        </div>
        {shown.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="list-row linkish">
            <span className="name-cell">
              <span className="project-icon client sm">{initials(c.name)}</span>
              {c.name}
            </span>
            <span className="muted">{c.role}</span>
          </Link>
        ))}
        {shown.length === 0 && (
          <div className="empty">
            {user.is_admin ? "Create a space to get started." : "Ask an admin to add you to a space."}
          </div>
        )}
      </div>
      {createSpace && (
        <CreateSpaceDialog
          onClose={() => setCreateSpace(false)}
          onCreated={async (id) => {
            setCreateSpace(false);
            await reload();
            navigate(`/clients/${id}`);
          }}
        />
      )}
    </AppChrome>
  );
}

function ClientPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id = "" } = useParams();
  const { clients } = useClients();
  const allProjects = useAllProjects();
  const [org, setOrg] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      const [c, p] = await Promise.all([client.getClient(id), client.clientProjects(id)]);
      setOrg(c.client);
      setProjects(p.projects);
    })();
  }, [id]);

  if (!org) {
    return (
      <AppChrome user={user} onLogout={onLogout} clients={clients} projects={allProjects} view="list">
        <div className="empty">Loading…</div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      user={user}
      onLogout={onLogout}
      clients={clients}
      projects={allProjects}
      activeClient={org}
      view="list"
    >
      <div className="page-header">
        <div className="breadcrumb">
          <Link to="/">Projects</Link>
          <span>/</span>
          <span>{org.name}</span>
        </div>
        <div className="page-title-row">
          <h1>{org.name}</h1>
          <div className="row-gap">
            <Link className="btn-subtle" to={`/clients/${id}/settings/people`}>
              People
            </Link>
            <Link className="btn-subtle" to={`/clients/${id}/settings/details`} title="Space settings">
              ⚙️ Settings
            </Link>
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              Create project
            </button>
          </div>
        </div>
      </div>
      <div className="content-panel tableish">
        <div className="list-row head">
          <span>Name</span>
          <span>Type</span>
          <span></span>
        </div>
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="list-row linkish">
            <span className="name-cell">
              <span className="project-icon sm">{initials(p.name)}</span>
              {p.name}
            </span>
            <span className="muted">Project</span>
            <span className="muted">Open board</span>
          </Link>
        ))}
        {projects.length === 0 && <div className="empty">No projects yet.</div>}
      </div>
      {createOpen && (
        <CreateProjectUnderClientDialog
          clientId={id}
          onClose={() => setCreateOpen(false)}
          onCreated={(pid) => navigate(`/projects/${pid}`)}
        />
      )}
    </AppChrome>
  );
}

function ProjectWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qs = new URLSearchParams(location.search);
  const view = (qs.get("view") as ViewMode) || "board";
  const issueId = qs.get("issue");

  const { clients } = useClients();
  const allProjects = useAllProjects();
  const [project, setProject] = useState<Project | null>(null);
  const [org, setOrg] = useState<Client | null>(null);
  const [columns, setColumns] = useState<Record<Ticket["status"], Ticket[]>>({
    backlog: [],
    todo: [],
    in_progress: [],
    done: [],
  });
  const [timeline, setTimeline] = useState<Ticket[]>([]);
  const [milestones, setMilestones] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [issueMode, setIssueMode] = useState<IssueOpenMode>("sidebar");
  const [boardMenu, setBoardMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [inlineCreate, setInlineCreate] = useState<Ticket["status"] | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [listTickets, setListTickets] = useState<Ticket[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  async function refresh() {
    const [p, k, t, m, mem] = await Promise.all([
      client.project(id),
      client.kanban(id, includeArchived),
      client.timeline(id),
      client.tickets(id, { type: "milestone" }),
      client.projectMembers(id),
    ]);
    setProject(p.project);
    touchRecentProject(p.project.id);
    setColumns(k.columns);
    setTimeline(t.items);
    setMilestones(m.tickets);
    setMembers(mem.members);
    setOrg((await client.getClient(p.project.client_id)).client);
    if (issueId) {
      const all = [...Object.values(k.columns).flat(), ...m.tickets];
      const found = all.find((x) => x.id === issueId);
      if (found) {
        setSelected(found);
        touchRecentTicket(found.id);
      } else {
        try {
          const r = await client.getTicket(issueId);
          setSelected(r.ticket);
          touchRecentTicket(r.ticket.id);
        } catch {
          setSelected(null);
        }
      }
    }
  }

  async function loadList(reset = false) {
    setListLoading(true);
    try {
      const r = await client.tickets(id, {
        limit: 50,
        cursor: reset ? undefined : listCursor ?? undefined,
      });
      setListTickets((prev) => (reset ? r.tickets : [...prev, ...r.tickets]));
      setListCursor(r.next_cursor ?? null);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [id, issueId, includeArchived]);

  useEffect(() => {
    if (view === "list") {
      setListCursor(null);
      void loadList(true);
    }
  }, [id, view]);

  const filteredColumns = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return columns;
    const next = { ...columns };
    for (const s of STATUSES) {
      next[s] = (columns[s] ?? []).filter((t) => t.title.toLowerCase().includes(q));
    }
    return next;
  }, [columns, filter]);

  async function move(ticketId: string, status: Ticket["status"]) {
    const ticket =
      STATUSES.flatMap((s) => columns[s] ?? []).find((t) => t.id === ticketId) ?? null;
    await client.patchTicket(ticketId, {
      status,
      sort_order: (columns[status] ?? []).length,
      version: ticket?.version,
    });
    await refresh();
  }

  function memberName(userId: string | null) {
    if (!userId) return null;
    return members.find((m) => m.user_id === userId)?.name ?? null;
  }

  function openIssue(ticket: Ticket) {
    setSelected(ticket);
    navigate(`/projects/${id}?view=${view}&issue=${ticket.id}`, { replace: true });
  }

  function closeIssue() {
    setSelected(null);
    navigate(`/projects/${id}?view=${view}`, { replace: true });
  }

  async function submitInline(status: Ticket["status"]) {
    if (!inlineTitle.trim()) return;
    await client.createTicket(id, { title: inlineTitle.trim(), type: "task", status });
    setInlineTitle("");
    setInlineCreate(null);
    await refresh();
  }

  if (!project) {
    return (
      <AppChrome user={user} onLogout={onLogout} clients={clients} projects={allProjects} view={view}>
        <div className="empty">Loading…</div>
      </AppChrome>
    );
  }

  const projectRole = (project.role ?? "member") as "owner" | "member";

  const shell = (
    <>
      {!fullscreen && (
        <div className="page-header">
          <div className="breadcrumb">
            <Link to="/">Projects</Link>
            <span>/</span>
            {org && (
              <>
                <Link to={`/clients/${org.id}`}>{org.name}</Link>
                <span>/</span>
              </>
            )}
            <span>{project.name}</span>
          </div>
          <div className="page-title-row">
            <h1>
              {view === "board"
                ? "Board"
                : view === "backlog"
                  ? "Backlog"
                  : view === "timeline"
                    ? "Timeline"
                    : "List"}
            </h1>
            <div className="menu menu-right">
              <button type="button" className="btn-subtle" onClick={() => setBoardMenu((v) => !v)}>
                •••
              </button>
              {boardMenu && (
                <div className="menu-panel">
                  <button
                    type="button"
                    className="menu-item btn-as-item"
                    onClick={() => {
                      setIssueMode("sidebar");
                      setBoardMenu(false);
                    }}
                  >
                    Open work items in sidebar {issueMode === "sidebar" ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    className="menu-item btn-as-item"
                    onClick={() => {
                      setIssueMode("modal");
                      setBoardMenu(false);
                    }}
                  >
                    Open work items in modal {issueMode === "modal" ? "✓" : ""}
                  </button>
                  <div className="menu-sep" />
                  <button
                    type="button"
                    className="menu-item btn-as-item"
                    onClick={() => {
                      setFullscreen(true);
                      setBoardMenu(false);
                    }}
                  >
                    Enter full screen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        {(
          [
            ["board", "Board"],
            ["backlog", "Backlog"],
            ["timeline", "Timeline"],
            ["list", "List"],
          ] as const
        ).map(([v, label]) => (
          <Link
            key={v}
            className={`chip ${view === v ? "active" : ""}`}
            to={`/projects/${id}?view=${v}`}
          >
            {label}
          </Link>
        ))}
        <input
          className="quick-filter"
          placeholder="Search board"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {(view === "board" || view === "list") && (
          <label className="chip">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />{" "}
            Include archived Done
          </label>
        )}
        {fullscreen && (
          <button type="button" className="btn-subtle" onClick={() => setFullscreen(false)}>
            Exit full screen
          </button>
        )}
      </div>

      {view === "board" && (
        <div className="board-scroll">
          <div className="board">
            {STATUSES.map((status) => (
              <section
                key={status}
                className="board-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) void move(dragId, status);
                  setDragId(null);
                }}
              >
                <div className="board-col-head">
                  <h3>{STATUS_LABEL[status]}</h3>
                  <span className="count">{(filteredColumns[status] ?? []).length}</span>
                </div>
                <div className="board-col-body">
                  {(filteredColumns[status] ?? []).map((t) => (
                    <article
                      key={t.id}
                      className="issue-card"
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onClick={() => openIssue(t)}
                    >
                      <p className="title">{t.title}</p>
                      <div className="card-meta">
                        {t.priority !== "medium" && (
                          <span className={`prio-badge ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                        )}
                        {t.due_at && <span className="muted due">{t.due_at}</span>}
                      </div>
                      <div className="footer">
                        <span className="issue-key">
                          <span className={`type-icon ${t.type}`}>
                            {t.type === "task" ? "✓" : "◆"}
                          </span>
                          {issueKey(project.name, t.id)}
                        </span>
                        {t.assignee_id && (
                          <span className="avatar sm" title={memberName(t.assignee_id) ?? ""}>
                            {initials(memberName(t.assignee_id) ?? "?")}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                  {inlineCreate === status ? (
                    <form
                      className="inline-create"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitInline(status);
                      }}
                    >
                      <input
                        value={inlineTitle}
                        onChange={(e) => setInlineTitle(e.target.value)}
                        placeholder="What needs to be done?"
                        autoFocus
                      />
                      <div className="row-gap">
                        <button className="btn-primary" type="submit">
                          Create
                        </button>
                        <button
                          type="button"
                          className="btn-subtle"
                          onClick={() => setInlineCreate(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="create-in-col"
                      onClick={() => {
                        setInlineCreate(status);
                        setInlineTitle("");
                      }}
                    >
                      + Create
                    </button>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === "backlog" && (
        <div className="backlog">
          <div className="backlog-panel">
            <div className="backlog-head">
              <strong>Backlog</strong>
              <span className="count">{(columns.backlog ?? []).length}</span>
            </div>
            {(columns.backlog ?? [])
              .filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()))
              .map((t) => (
                <div key={t.id} className="backlog-row" onClick={() => openIssue(t)}>
                  <span className="issue-key">
                    <span className={`type-icon ${t.type}`}>✓</span>
                    {issueKey(project.name, t.id)}
                  </span>
                  <span className="grow">{t.title}</span>
                  <select
                    value={t.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void move(t.id, e.target.value as Ticket["status"])}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            {inlineCreate === "backlog" ? (
              <form
                className="inline-create pad"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitInline("backlog");
                }}
              >
                <input
                  value={inlineTitle}
                  onChange={(e) => setInlineTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                />
                <div className="row-gap">
                  <button className="btn-primary" type="submit">
                    Create
                  </button>
                  <button type="button" className="btn-subtle" onClick={() => setInlineCreate(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="create-in-col"
                onClick={() => setInlineCreate("backlog")}
              >
                + Create
              </button>
            )}
          </div>
          <div className="backlog-panel">
            <div className="backlog-head">
              <strong>Board issues</strong>
            </div>
            {(["todo", "in_progress", "done"] as const).flatMap((s) =>
              (columns[s] ?? []).map((t) => (
                <div key={t.id} className="backlog-row" onClick={() => openIssue(t)}>
                  <span className="issue-key">
                    <span className={`type-icon ${t.type}`}>✓</span>
                    {issueKey(project.name, t.id)}
                  </span>
                  <span className="grow">{t.title}</span>
                  <span className="muted">{STATUS_LABEL[t.status]}</span>
                </div>
              )),
            )}
          </div>
        </div>
      )}

      {view === "timeline" && (
        <div className="content-panel">
          {[...timeline, ...milestones.filter((m) => m.date_from && m.date_to)]
            .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
            .map((item) => (
              <div key={item.id} className="list-row" onClick={() => openIssue(item)}>
                <span className="muted">
                  {item.date_from ?? "—"} → {item.date_to ?? "—"}
                </span>
                <span>{item.title}</span>
                <span className="muted">{STATUS_LABEL[item.status]}</span>
              </div>
            ))}
        </div>
      )}

      {view === "list" && (
        <div className="content-panel tableish">
          <div className="list-row head list-issue">
            <span>Work</span>
            <span>Summary</span>
            <span>Status</span>
            <span>Assignee</span>
            <span>Due</span>
            <span>Priority</span>
          </div>
          {listTickets
            .filter((t) => !filter.trim() || t.title.toLowerCase().includes(filter.trim().toLowerCase()))
            .map((t) => (
              <div key={t.id} className="list-row list-issue" onClick={() => openIssue(t)}>
                <span className="issue-key">
                  <span className={`type-icon ${t.type}`}>{t.type === "task" ? "✓" : "◆"}</span>
                  {issueKey(project.name, t.id)}
                </span>
                <span>{t.title}</span>
                <span className="muted">{STATUS_LABEL[t.status]}</span>
                <span className="muted">{memberName(t.assignee_id) ?? "—"}</span>
                <span className="muted">{t.due_at ?? "—"}</span>
                <span className="muted">{PRIORITY_LABEL[t.priority]}</span>
              </div>
            ))}
          {listCursor && (
            <button
              type="button"
              className="btn-subtle"
              disabled={listLoading}
              onClick={() => void loadList(false)}
            >
              {listLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}

      {selected && (
        <IssuePanel
          mode={issueMode}
          user={user}
          project={project}
          projectRole={projectRole}
          members={members}
          ticket={selected}
          onClose={closeIssue}
          onChanged={(t) => {
            if (t) setSelected(t);
            void refresh();
          }}
          onDeleted={() => {
            closeIssue();
            void refresh();
          }}
        />
      )}
    </>
  );

  if (fullscreen) {
    return <div className="app-shell fullscreen-main">{shell}</div>;
  }

  return (
    <AppChrome
      user={user}
      onLogout={onLogout}
      clients={clients}
      projects={allProjects}
      activeClient={org}
      activeProject={project}
      view={view}
    >
      {shell}
    </AppChrome>
  );
}

export function App() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { clients } = useClients(!!user);
  const projects = useAllProjects(!!user);

  if (user === undefined) return <div className="empty">Loading…</div>;

  async function logout() {
    await client.logout();
    setUser(null);
    navigate("/login");
  }

  const onLogout = () => void logout();

  if (!user) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<AuthForm mode="login" onDone={(u) => { setUser(u); navigate("/"); }} />}
        />
        <Route
          path="/register"
          element={<AuthForm mode="register" onDone={(u) => { setUser(u); navigate("/"); }} />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  function settingsChrome(opts: {
    activeClient?: Client | null;
    activeProject?: Project | null;
    children: React.ReactNode;
  }) {
    return (
      <AppChrome
        user={user}
        onLogout={onLogout}
        clients={clients}
        projects={projects}
        activeClient={opts.activeClient}
        activeProject={opts.activeProject}
        view="list"
      >
        {opts.children}
      </AppChrome>
    );
  }

  function pageChrome(opts: {
    user: User;
    onLogout: () => void;
    clients: Client[];
    projects: Project[];
    view: "list";
    children: React.ReactNode;
  }) {
    return (
      <AppChrome
        user={opts.user}
        onLogout={opts.onLogout}
        clients={opts.clients}
        projects={opts.projects}
        view={opts.view}
      >
        {opts.children}
      </AppChrome>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/" element={<ProjectsHome user={user} onLogout={onLogout} />} />
      <Route path="/spaces" element={<SpacesPage user={user} onLogout={onLogout} />} />
      <Route
        path="/your-work"
        element={<YourWorkPage user={user} onLogout={onLogout} chrome={pageChrome} />}
      />
      <Route
        path="/account"
        element={
          <AccountPage
            user={user}
            onLogout={onLogout}
            onUserUpdate={setUser}
            chrome={pageChrome}
          />
        }
      />
      <Route
        path="/admin"
        element={<AdminPage user={user} chrome={(opts) => pageChrome({ ...opts, user, onLogout, clients, projects, view: "list" })} />}
      />
      <Route
        path="/search"
        element={<SearchPage user={user} onLogout={onLogout} chrome={pageChrome} />}
      />
      <Route
        path="/filters"
        element={<FiltersPage user={user} onLogout={onLogout} chrome={pageChrome} />}
      />
      <Route
        path="/filters/:id"
        element={<FiltersPage user={user} onLogout={onLogout} chrome={pageChrome} />}
      />
      <Route
        path="/dashboards"
        element={<DashboardsPage user={user} onLogout={onLogout} chrome={pageChrome} />}
      />
      <Route
        path="/dashboards/:id"
        element={<DashboardsPage user={user} onLogout={onLogout} chrome={pageChrome} />}
      />
      <Route path="/clients/:id" element={<ClientPage user={user} onLogout={onLogout} />} />
      <Route
        path="/clients/:id/settings/*"
        element={<ClientSettingsPage user={user} chrome={settingsChrome} />}
      />
      <Route path="/projects/:id" element={<ProjectWorkspace user={user} onLogout={onLogout} />} />
      <Route
        path="/projects/:id/settings/*"
        element={<ProjectSettingsPage user={user} chrome={settingsChrome} />}
      />
      <Route path="/browse/:ticketId" element={<BrowseIssuePage user={user} onLogout={onLogout} />} />
      <Route path="/teams" element={<TeamsPage user={user} onLogout={onLogout} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function TeamsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { clients } = useClients();
  const projects = useAllProjects();
  const [people, setPeople] = useState<
    Array<Member & { spaces: string[] }>
  >([]);

  useEffect(() => {
    void (async () => {
      const lists = await Promise.all(
        clients.map(async (c) => {
          const m = await client.clientMembers(c.id);
          return m.members.map((mem) => ({ mem, space: c.name }));
        }),
      );
      const map = new Map<string, Member & { spaces: string[] }>();
      for (const { mem, space } of lists.flat()) {
        const prev = map.get(mem.user_id);
        if (prev) prev.spaces.push(space);
        else map.set(mem.user_id, { ...mem, spaces: [space] });
      }
      setPeople([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, [clients]);

  return (
    <AppChrome user={user} onLogout={onLogout} clients={clients} projects={projects} view="list">
      <div className="page-header">
        <h1>Teams</h1>
      </div>
      <div className="content-panel tableish">
        <div className="list-row head">
          <span>Name</span>
          <span>Email</span>
          <span>Spaces</span>
        </div>
        {people.map((p) => (
          <div key={p.user_id} className="list-row">
            <span className="name-cell">
              <span className="avatar sm">{initials(p.name)}</span>
              {p.name}
            </span>
            <span className="muted">{p.email}</span>
            <span className="muted">{p.spaces.join(", ")}</span>
          </div>
        ))}
        {people.length === 0 && <div className="empty">No people in your spaces yet.</div>}
      </div>
    </AppChrome>
  );
}

function BrowseIssuePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const { clients } = useClients();
  const allProjects = useAllProjects();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const t = await client.getTicket(ticketId);
        touchRecentTicket(t.ticket.id);
        const [p, m] = await Promise.all([
          client.project(t.ticket.project_id),
          client.projectMembers(t.ticket.project_id),
        ]);
        setTicket(t.ticket);
        setProject(p.project);
        touchRecentProject(p.project.id);
        setMembers(m.members);
      } catch (err) {
        setError(err instanceof Error ? err.message : "error");
      }
    })();
  }, [ticketId]);

  if (error) {
    return (
      <AppChrome user={user} onLogout={onLogout} clients={clients} projects={allProjects} view="list">
        <div className="empty">{error}</div>
      </AppChrome>
    );
  }

  if (!ticket || !project) {
    return (
      <AppChrome user={user} onLogout={onLogout} clients={clients} projects={allProjects} view="list">
        <div className="empty">Loading…</div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      user={user}
      onLogout={onLogout}
      clients={clients}
      projects={allProjects}
      activeProject={project}
      view="list"
    >
      <div className="page-header">
        <div className="breadcrumb">
          <Link to={`/projects/${project.id}?view=board`}>Board</Link>
          <span>/</span>
          <span>{issueKey(project.name, ticket.id)}</span>
        </div>
      </div>
      <IssuePanel
        mode="page"
        user={user}
        project={project}
        projectRole={(project.role ?? "member") as "owner" | "member"}
        members={members}
        ticket={ticket}
        onClose={() => navigate(`/projects/${project.id}?view=board`)}
        onChanged={(t) => {
          if (t) setTicket(t);
        }}
        onDeleted={() => navigate(`/projects/${project.id}?view=board`)}
      />
    </AppChrome>
  );
}
