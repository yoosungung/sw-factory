import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { client, type Client, type Project, type User } from "./api";
import { AppChrome } from "./components/chrome/AppChrome";
import { AuthForm } from "./pages/Auth";
import { ProjectsHome, SpacesPage, ClientPage } from "./pages/Home";
import { ProjectWorkspace } from "./pages/ProjectWorkspace";
import { BrowseIssuePage, TeamsPage } from "./pages/Misc";
import { ClientSettingsPage, ProjectSettingsPage } from "./pages/Settings";
import { AdminPage } from "./pages/Admin";
import { AccountPage, SearchPage, YourWorkPage } from "./pages/Personal";
import { DashboardsPage, FiltersPage } from "./pages/Directory";
import { useAuth, useAllProjects, useClients } from "./hooks/useSession";

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
        hideSidebar
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
