import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { client, type Client, type Project, type User } from "../api";
import { initials } from "../components/issue/IssuePanel";
import { AppChrome } from "../components/chrome/AppChrome";
import { CreateProjectUnderClientDialog, CreateSpaceDialog } from "../components/create/CreateDialogs";
import { APP_NAME } from "../lib/brand";
import { useAllProjects, useClients } from "../hooks/useSession";

export function ProjectsHome({ user, onLogout }: { user: User; onLogout: () => void }) {
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

export function SpacesPage({ user, onLogout }: { user: User; onLogout: () => void }) {
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

export function ClientPage({ user, onLogout }: { user: User; onLogout: () => void }) {
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
