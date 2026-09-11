import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  client,
  type Client,
  type Member,
  type Project,
  type ProjectStatus,
  type Ticket,
  type User,
} from "../api";
import {
  IssuePanel,
  issueKey,
  initials,
  statusLabel,
  PRIORITY_LABEL,
  type IssueOpenMode,
} from "../components/issue/IssuePanel";
import { EmptyState } from "../components/EmptyState";
import { AppChrome } from "../components/chrome/AppChrome";
import { dueClass } from "../lib/due";
import type { ViewMode } from "../lib/view-mode";
import { useAllProjects, useClients } from "../hooks/useSession";
import { touchRecentProject, touchRecentTicket } from "../lib/recent";

export function ProjectWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qs = new URLSearchParams(location.search);
  const view = (qs.get("view") as ViewMode) || "board";
  const issueId = qs.get("issue");
  const issueUiParam = qs.get("issueUi");

  const { clients } = useClients();
  const allProjects = useAllProjects();
  const [project, setProject] = useState<Project | null>(null);
  const [org, setOrg] = useState<Client | null>(null);
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [columns, setColumns] = useState<Record<string, Ticket[]>>({});
  const [timeline, setTimeline] = useState<Ticket[]>([]);
  const [milestones, setMilestones] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [issueMode, setIssueMode] = useState<IssueOpenMode>(
    issueUiParam === "modal" ? "modal" : "sidebar",
  );
  const [boardMenu, setBoardMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [listTickets, setListTickets] = useState<Ticket[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const statusLabels = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.key, s.label])),
    [statuses],
  );
  const statusKeys = useMemo(() => statuses.map((s) => s.key), [statuses]);
  const backlogKeys = useMemo(
    () => statuses.filter((s) => s.category === "backlog").map((s) => s.key),
    [statuses],
  );
  const boardIssueKeys = useMemo(
    () => statuses.filter((s) => s.category !== "backlog").map((s) => s.key),
    [statuses],
  );

  useEffect(() => {
    if (issueUiParam === "modal") setIssueMode("modal");
    else if (issueUiParam === "sidebar" || issueUiParam === null) {
      if (issueUiParam === "sidebar") setIssueMode("sidebar");
    }
  }, [issueUiParam]);

  function applyIssueMode(mode: "sidebar" | "modal") {
    setIssueMode(mode);
    const params = new URLSearchParams(location.search);
    if (mode === "modal") params.set("issueUi", "modal");
    else params.delete("issueUi");
    const q = params.toString();
    navigate(`/projects/${id}${q ? `?${q}` : ""}`, { replace: true });
  }

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
    setStatuses(k.statuses);
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
    const next: Record<string, Ticket[]> = {};
    for (const s of statusKeys) {
      next[s] = (columns[s] ?? []).filter((t) => t.title.toLowerCase().includes(q));
    }
    return next;
  }, [columns, filter, statusKeys]);

  async function move(ticketId: string, status: string) {
    const ticket =
      statusKeys.flatMap((s) => columns[s] ?? []).find((t) => t.id === ticketId) ?? null;
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

  function labelFor(key: string) {
    return statusLabel(key, statusLabels);
  }

  if (!project) {
    return (
      <AppChrome user={user} onLogout={onLogout} clients={clients} projects={allProjects} view={view}>
        <div className="empty">Loading…</div>
      </AppChrome>
    );
  }

  const projectRole = (project.role ?? "member") as "owner" | "member";
  const backlogTickets = backlogKeys.flatMap((k) => columns[k] ?? []);

  const shell = (
    <>
      {!fullscreen && (
        <div className="page-header">
          <div className="breadcrumb">
            <Link to="/projects">Projects</Link>
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
                      applyIssueMode("sidebar");
                      setBoardMenu(false);
                    }}
                  >
                    Open work items in sidebar {issueMode === "sidebar" ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    className="menu-item btn-as-item"
                    onClick={() => {
                      applyIssueMode("modal");
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
        <div className="view-segment" role="tablist" aria-label="Project views">
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
              role="tab"
              aria-selected={view === v}
              className={`view-seg ${view === v ? "active" : ""}`}
              to={`/projects/${id}?view=${v}`}
            >
              {label}
            </Link>
          ))}
        </div>
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
            {statuses.map((st) => (
              <section
                key={st.key}
                className="board-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) void move(dragId, st.key);
                  setDragId(null);
                }}
              >
                <div className="board-col-head">
                  <h3>{st.label}</h3>
                  <span className="count">{(filteredColumns[st.key] ?? []).length}</span>
                </div>
                <div className="board-col-body">
                  {(filteredColumns[st.key] ?? []).map((t) => (
                    <article
                      key={t.id}
                      className="issue-card"
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onClick={() => openIssue(t)}
                    >
                      <div className="card-meta">
                        <span className="issue-key">
                          <span className={`type-icon ${t.type}`}>
                            {t.type === "task" ? "✓" : "◆"}
                          </span>
                          {issueKey(project.name, t.id)}
                        </span>
                        <span className={`prio-badge ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                      </div>
                      <p className="title">{t.title}</p>
                      <div className="footer">
                        {t.due_at ? (
                          <span className={dueClass(t.due_at)}>{t.due_at}</span>
                        ) : (
                          <span />
                        )}
                        {t.assignee_id ? (
                          <span className="avatar sm" title={memberName(t.assignee_id) ?? ""}>
                            {initials(memberName(t.assignee_id) ?? "?")}
                          </span>
                        ) : (
                          <span />
                        )}
                      </div>
                    </article>
                  ))}
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
              <span className="count">{backlogTickets.length}</span>
            </div>
            {backlogTickets
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
                    onChange={(e) => void move(t.id, e.target.value)}
                  >
                    {statuses.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            {backlogTickets.length === 0 && (
              <EmptyState
                title="Backlog is empty"
                description="Work items you create show up here so you can plan what comes next on the board."
              />
            )}
          </div>
          <div className="backlog-panel">
            <div className="backlog-head">
              <strong>Board issues</strong>
            </div>
            {boardIssueKeys.flatMap((s) =>
              (columns[s] ?? []).map((t) => (
                <div key={t.id} className="backlog-row" onClick={() => openIssue(t)}>
                  <span className="issue-key">
                    <span className={`type-icon ${t.type}`}>✓</span>
                    {issueKey(project.name, t.id)}
                  </span>
                  <span className="grow">{t.title}</span>
                  <span className="muted">{labelFor(t.status)}</span>
                </div>
              )),
            )}
          </div>
        </div>
      )}

      {view === "timeline" && (
        <div className="content-panel">
          {(() => {
            const items = [...timeline, ...milestones.filter((m) => m.date_from && m.date_to)].filter(
              (item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx,
            );
            if (items.length === 0) {
              return (
                <EmptyState
                  title="Timeline is empty"
                  description="Work items you create show up here so you can see the project schedule."
                />
              );
            }
            return items.map((item) => (
              <div key={item.id} className="list-row" onClick={() => openIssue(item)}>
                <span className="muted">
                  {item.date_from ?? "—"} → {item.date_to ?? "—"}
                </span>
                <span>{item.title}</span>
                <span className="muted">{labelFor(item.status)}</span>
              </div>
            ));
          })()}
        </div>
      )}

      {view === "list" && (
        <div className="content-panel tableish">
          {(() => {
            const rows = listTickets.filter(
              (t) => !filter.trim() || t.title.toLowerCase().includes(filter.trim().toLowerCase()),
            );
            if (rows.length === 0) {
              return (
                <EmptyState
                  title="List is empty"
                  description="Work items you create show up here so you can scan the project in one table."
                />
              );
            }
            return (
              <>
                <div className="list-row head list-issue">
                  <span>Work</span>
                  <span>Summary</span>
                  <span>Status</span>
                  <span>Assignee</span>
                  <span>Due</span>
                  <span>Priority</span>
                </div>
                {rows.map((t) => (
                  <div key={t.id} className="list-row list-issue" onClick={() => openIssue(t)}>
                    <span className="issue-key">
                      <span className={`type-icon ${t.type}`}>{t.type === "task" ? "✓" : "◆"}</span>
                      {issueKey(project.name, t.id)}
                    </span>
                    <span>{t.title}</span>
                    <span className="muted">{labelFor(t.status)}</span>
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
              </>
            );
          })()}
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
