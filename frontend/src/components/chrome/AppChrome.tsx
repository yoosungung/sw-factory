import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Client, Project, User } from "../../api";
import { initials } from "../issue/IssuePanel";
import { APP_NAME, BrandMark } from "../../lib/brand";
import type { ViewMode } from "../../lib/view-mode";
import { useClickOutside, useEscape } from "../../hooks/useDom";
import { CreateIssueDialog } from "../create/CreateDialogs";
import { IconChevron } from "./icons";

export function MenuDropdown({
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

function navItemClass(active: boolean) {
  return `nav-item${active ? " active" : ""}`;
}

function SideRailLink({
  to,
  label,
  icon,
  active,
  collapsed,
}: {
  to: string;
  label: string;
  icon: string;
  active?: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      className={`side-link${active ? " active" : ""}`}
      to={to}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      <span className="side-ico" aria-hidden>
        {icon}
      </span>
      {collapsed ? null : label}
    </Link>
  );
}

export function TopNav({
  user,
  onLogout,
  onCreateIssue,
  activeClient,
  activeProject,
  view = "overview",
}: {
  user: User;
  onLogout: () => void;
  onCreateIssue: () => void;
  activeClient?: Client | null;
  activeProject?: Project | null;
  view?: ViewMode;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQ, setSearchQ] = useState("");
  const close = () => setMenu(null);
  const closeMobile = () => setMobileOpen(false);
  const path = location.pathname;
  const spacesActive = path === "/spaces" || path.startsWith("/clients/");
  const projectsActive = path === "/projects" || path.startsWith("/projects/");
  const workActive = path === "/" || path === "/your-work";
  const projectBase = activeProject ? `/projects/${activeProject.id}` : "";

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

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEscape(closeMobile, mobileOpen);

  return (
    <header className="top-nav">
      <button
        type="button"
        className="nav-hamburger icon-btn"
        aria-label="Menu"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        ☰
      </button>

      <Link to="/" className="nav-brand" onClick={close}>
        <BrandMark />
        <span>{APP_NAME}</span>
      </Link>

      <nav className="nav-desktop-links" aria-label="Primary">
        <Link to="/spaces" className={navItemClass(spacesActive)}>
          Spaces
        </Link>
        <Link to="/projects" className={navItemClass(projectsActive)}>
          Projects
        </Link>
        <Link to="/" className={navItemClass(workActive)}>
          Your work
        </Link>
        <button type="button" className="btn-create" onClick={onCreateIssue}>
          Create
        </button>
      </nav>

      <div className="nav-spacer" />
      <div className="nav-search-wrap">
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
        <kbd className="nav-search-hint" aria-hidden>
          {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
            ? "⌘K"
            : "Ctrl+K"}
        </kbd>
      </div>

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

      {mobileOpen && (
        <>
          <div className="mobile-nav-backdrop" onClick={closeMobile} />
          <div className="mobile-nav-drawer" role="dialog" aria-label="Navigation">
            <Link to="/spaces" className="mobile-nav-item" onClick={closeMobile}>
              Spaces
            </Link>
            <Link to="/projects" className="mobile-nav-item" onClick={closeMobile}>
              Projects
            </Link>
            <Link to="/" className="mobile-nav-item" onClick={closeMobile}>
              Your work
            </Link>
            <button
              type="button"
              className="mobile-nav-item btn-as-item"
              onClick={() => {
                closeMobile();
                onCreateIssue();
              }}
            >
              Create
            </button>

            {activeProject && (
              <>
                <div className="mobile-nav-section">Work</div>
                <Link
                  to={projectBase}
                  className={`mobile-nav-item${view === "overview" ? " active" : ""}`}
                  onClick={closeMobile}
                >
                  Overview
                </Link>
                <Link
                  to={`${projectBase}?view=board`}
                  className={`mobile-nav-item${view !== "overview" ? " active" : ""}`}
                  onClick={closeMobile}
                >
                  Tickets
                </Link>
                <div className="mobile-nav-section">Settings</div>
                <Link
                  to={`/projects/${activeProject.id}/settings/details`}
                  className="mobile-nav-item"
                  onClick={closeMobile}
                >
                  Project settings
                </Link>
              </>
            )}

            {activeClient && !activeProject && (
              <>
                <div className="mobile-nav-section">Settings</div>
                <Link
                  to={`/clients/${activeClient.id}/settings/details`}
                  className="mobile-nav-item"
                  onClick={closeMobile}
                >
                  Space settings
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </header>
  );
}

export function Sidebar({
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
  const [spaceOpen, setSpaceOpen] = useState(false);
  const spaceRef = useClickOutside(() => setSpaceOpen(false));
  const base = activeProject ? `/projects/${activeProject.id}` : "";
  const spaceLabel = activeClient?.name ?? clients.find((c) => c.id === activeProject?.client_id)?.name ?? "Space";
  const workNav = activeProject ? (
    <>
      <SideRailLink
        to={base}
        label="Overview"
        icon="▦"
        active={view === "overview"}
        collapsed={collapsed}
      />
      <SideRailLink
        to={`${base}?view=board`}
        label="Tickets"
        icon="☰"
        active={view !== "overview"}
        collapsed={collapsed}
      />
    </>
  ) : null;
  const settingsNav = activeProject ? (
    <SideRailLink
      to={`/projects/${activeProject.id}/settings/details`}
      label="Project settings"
      icon="⚙"
      collapsed={collapsed}
    />
  ) : activeClient ? (
    <SideRailLink
      to={`/clients/${activeClient.id}/settings/details`}
      label="Space settings"
      icon="⚙"
      collapsed={collapsed}
    />
  ) : null;

  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <button
          type="button"
          className="icon-btn side-toggle"
          onClick={onToggle}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <IconChevron dir="right" />
        </button>
        {(workNav || settingsNav) && (
          <nav className="side-nav side-rail" aria-label="Sidebar">
            {workNav}
            {settingsNav}
          </nav>
        )}
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link to="/projects" className="back-link">
          ← Back to projects
        </Link>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggle}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <IconChevron dir="left" />
        </button>
      </div>

      <div className="space-switcher" ref={spaceRef}>
        <button
          type="button"
          className="space-switcher-btn"
          onClick={() => setSpaceOpen((v) => !v)}
          aria-expanded={spaceOpen}
        >
          <span className="project-icon client sm">{initials(spaceLabel)}</span>
          <span className="space-switcher-label">{spaceLabel}</span>
          <span className="chev">▾</span>
        </button>
        {spaceOpen && (
          <div className="menu-panel space-switcher-panel">
            <div className="menu-title">Spaces</div>
            {clients.map((c) => (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="menu-item"
                onClick={() => setSpaceOpen(false)}
              >
                <span className="project-icon client sm">{initials(c.name)}</span>
                {c.name}
              </Link>
            ))}
            {clients.length === 0 && <div className="menu-empty">No spaces</div>}
          </div>
        )}
      </div>

      {activeProject && (
        <div className="sidebar-project">
          <div className="project-icon">{initials(activeProject.name)}</div>
          <div className="meta">
            <div className="name">{activeProject.name}</div>
            <div className="sub">Project · Member access</div>
          </div>
        </div>
      )}

      {activeProject && (
        <>
          <div className="side-section">Work</div>
          <nav className="side-nav">{workNav}</nav>
          <div className="side-section">Settings</div>
          <nav className="side-nav">{settingsNav}</nav>
        </>
      )}

      {activeClient && !activeProject && (
        <>
          <div className="side-section">Settings</div>
          <nav className="side-nav">{settingsNav}</nav>
        </>
      )}
    </aside>
  );
}

export function AppChrome({
  user,
  onLogout,
  clients,
  projects,
  activeClient,
  activeProject,
  view,
  children,
  createDefaultStatus = "backlog",
  hideSidebar = false,
}: {
  user: User;
  onLogout: () => void;
  clients: Client[];
  projects: Project[];
  activeClient?: Client | null;
  activeProject?: Project | null;
  view: ViewMode;
  children: React.ReactNode;
  createDefaultStatus?: string;
  hideSidebar?: boolean;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createIssue, setCreateIssue] = useState(false);
  const [docked, setDocked] = useState(false);
  const navigate = useNavigate();
  const showSidebar = !hideSidebar && Boolean(activeClient || activeProject);
  const openCreate = () => setCreateIssue(true);

  return (
    <div className="app-shell">
      <TopNav
        user={user}
        onLogout={onLogout}
        onCreateIssue={openCreate}
        activeClient={activeClient}
        activeProject={activeProject}
        view={view}
      />
      <div
        className={`shell-body ${showSidebar ? "" : "no-sidebar"} ${showSidebar && sidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}
      >
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
