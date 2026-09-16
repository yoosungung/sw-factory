import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  client,
  type Comment,
  type FileMeta,
  type Member,
  type Project,
  type ProjectStatus,
  type Ticket,
  type TicketPriority,
  type User,
} from "../../api";
import { commentsNewestFirst } from "./commentOrder";
import { RichContent } from "./RichContent";

const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function statusLabel(key: string, map?: Record<string, string>): string {
  if (map?.[key]) return map[key];
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function labelsFromStatuses(statuses: ProjectStatus[]): Record<string, string> {
  return Object.fromEntries(statuses.map((s) => [s.key, s.label]));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function issueKey(prefix: string, id: string) {
  const p = (prefix.replace(/[^A-Za-z0-9]/g, "").slice(0, 3) || "LT").toUpperCase();
  const n = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${p}-${n}`;
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

function BadgePicker({
  className,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  className: string;
  label: string;
  value: string;
  options: string[];
  labels: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className={`badge-picker ${className}`} ref={ref}>
      <button
        type="button"
        className={`badge-picker-btn ${className}-btn ${value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`prio-badge ${value}`}>{labels[value]}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <ul className="badge-picker-menu" role="listbox" aria-label={label}>
          {options.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={opt === value}
                className={`badge-picker-option ${opt === value ? "selected" : ""}`}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <span className={`prio-badge ${opt}`}>{labels[opt]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AutoResizeTitle({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="issue-title-input"
      rows={1}
      value={value}
      placeholder="Issue title…"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export type IssueOpenMode = "sidebar" | "modal" | "page";

type Props = {
  mode: IssueOpenMode;
  user: User;
  project: Project;
  projectRole: "owner" | "member";
  members: Member[];
  ticket: Ticket;
  onClose: () => void;
  onChanged: (ticket?: Ticket) => void;
  onDeleted: () => void;
};

export function IssuePanel({
  mode,
  user,
  project,
  projectRole,
  members,
  ticket: initial,
  onClose,
  onChanged,
  onDeleted,
}: Props) {
  const [ticket, setTicket] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [editingDesc, setEditingDesc] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<"comments" | "history" | "files">("comments");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<
    Awaited<ReturnType<typeof client.ticketActivities>>["activities"]
  >([]);
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  useEscape(onClose, mode !== "page");

  useEffect(() => {
    void client.projectStatuses(project.id).then((r) => setStatuses(r.statuses));
  }, [project.id]);

  useEffect(() => {
    setTicket(initial);
    setTitle(initial.title);
    setDescription(initial.description);
    setEditingDesc(false);
    void Promise.all([
      client.comments(initial.id),
      client.listFiles(initial.id),
      client.ticketActivities(initial.id),
    ]).then(([c, f, a]) => {
      setComments(commentsNewestFirst(c.comments));
      setFiles(f.files);
      setActivities(a.activities);
    });
  }, [initial]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const canDelete = ticket.created_by === user.id || projectRole === "owner";
  const statusKeys = statuses.map((s) => s.key);
  const statusLabels = labelsFromStatuses(statuses);

  async function save(patch: Parameters<typeof client.patchTicket>[1]) {
    setError("");
    try {
      const r = await client.patchTicket(ticket.id, { ...patch, version: ticket.version });
      setTicket(r.ticket);
      setActivities((await client.ticketActivities(ticket.id)).activities);
      onChanged(r.ticket);
      return r.ticket;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Someone else updated this issue. Reloading…");
        const fresh = await client.getTicket(ticket.id);
        setTicket(fresh.ticket);
        setTitle(fresh.ticket.title);
        setDescription(fresh.ticket.description);
        onChanged(fresh.ticket);
        return fresh.ticket;
      }
      setError(err instanceof Error ? err.message : "error");
      throw err;
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    await client.addComment(ticket.id, body);
    setBody("");
    setComments(commentsNewestFirst((await client.comments(ticket.id)).comments));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 256 * 1024) {
      await client.uploadFileDirect(ticket.id, file);
    } else {
      await client.uploadFile(ticket.id, file);
    }
    setFiles((await client.listFiles(ticket.id)).files);
    e.target.value = "";
  }

  async function removeTicket() {
    if (!canDelete || !confirm("Delete this issue? This cannot be undone.")) return;
    setBusy(true);
    try {
      await client.deleteTicket(ticket.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      setBusy(false);
    }
  }

  const key = issueKey(project.name, ticket.id);
  const assignee = members.find((m) => m.user_id === ticket.assignee_id);

  const content = (
    <>
      <div className="drawer-top">
        <div className="issue-header-left">
          <Link
            className="project-breadcrumb-link"
            to={`/projects/${project.id}?view=board`}
            title={`Go to ${project.name} board`}
          >
            {project.name}
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="issue-key">
            <span className={`type-icon ${ticket.type}`}>{ticket.type === "task" ? "✓" : "◆"}</span>
            {key}
          </span>
        </div>
        <div className="row-gap">
          {mode !== "page" && (
            <Link className="icon-btn" to={`/browse/${ticket.id}`} title="Open full page">
              ↗
            </Link>
          )}
          {mode !== "page" && (
            <button type="button" className="icon-btn" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="drawer-body">
        <div className="issue-layout">
          <div className="issue-main">
            <AutoResizeTitle
              value={title}
              onChange={setTitle}
              onBlur={() => {
                if (title.trim() && title !== ticket.title) void save({ title: title.trim() });
              }}
            />
            {error && <p className="error">{error}</p>}

            <section className="issue-desc-section">
              <h3 className="section-title">Description</h3>
              {editingDesc ? (
                <textarea
                  ref={descRef}
                  className="issue-desc"
                  value={description}
                  placeholder="Add a description (Markdown)…"
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => {
                    if (description !== ticket.description) void save({ description });
                    setEditingDesc(false);
                  }}
                />
              ) : (
                <div
                  className="issue-desc-view"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a")) return;
                    setEditingDesc(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditingDesc(true);
                    }
                  }}
                >
                  {description.trim() ? (
                    <RichContent source={description} />
                  ) : (
                    <span className="muted">Add a description…</span>
                  )}
                </div>
              )}
            </section>

            <section className="issue-activity-section">
              <div className="activity-tabs">
                <button
                  type="button"
                  className={`activity-tab chip ${tab === "comments" ? "active" : ""}`}
                  onClick={() => setTab("comments")}
                >
                  Comments {comments.length > 0 && <span className="tab-pill">{comments.length}</span>}
                </button>
                <button
                  type="button"
                  className={`activity-tab chip ${tab === "history" ? "active" : ""}`}
                  onClick={() => setTab("history")}
                >
                  History
                </button>
                <button
                  type="button"
                  className={`activity-tab chip ${tab === "files" ? "active" : ""}`}
                  onClick={() => setTab("files")}
                >
                  Files {files.length > 0 && <span className="tab-pill">{files.length}</span>}
                </button>
              </div>

              {tab === "comments" && (
                <>
                  <form className="comment-form" onSubmit={(e) => void postComment(e)}>
                    <textarea
                      placeholder="Add a comment (Markdown)…"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      required
                    />
                    <div className="comment-form-actions">
                      <button className="btn-primary" type="submit" disabled={!body.trim()}>
                        Save
                      </button>
                    </div>
                  </form>
                  {comments.map((c) => (
                    <div key={c.id} className="comment">
                      <div className="avatar">{initials(c.author_name)}</div>
                      <div className="bubble">
                        <div className="comment-head">
                          <strong>{c.author_name}</strong>
                          {(c.author_id === user.id || projectRole === "owner") && (
                            <button
                              type="button"
                              className="btn-subtle sm"
                              onClick={() =>
                                void client.deleteComment(c.id).then(async () => {
                                  setComments(
                                    commentsNewestFirst((await client.comments(ticket.id)).comments),
                                  );
                                })
                              }
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <RichContent source={c.body} />
                        <div className="muted">{new Date(c.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {tab === "history" && (
                <div className="history-list">
                  {activities.map((a) => (
                    <div key={a.id} className="list-row">
                      <span>
                        <strong>{a.field}</strong>: {a.old_val ?? "—"} → {a.new_val ?? "—"}
                      </span>
                      <span className="muted">{new Date(a.at).toLocaleString()}</span>
                    </div>
                  ))}
                  {activities.length === 0 && <p className="muted">No history yet.</p>}
                </div>
              )}

              {tab === "files" && (
                <>
                  <input type="file" onChange={(e) => void onUpload(e)} />
                  {files.map((f) => (
                    <div key={f.id} className="file-row">
                      <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                        {f.filename}
                      </a>
                      <span className="muted">{Math.round(f.size / 1024)} KB</span>
                      <button
                        type="button"
                        className="btn-subtle sm"
                        onClick={() =>
                          void client.deleteFile(f.id).then(async () => {
                            setFiles((await client.listFiles(ticket.id)).files);
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {files.length === 0 && <p className="muted">No attachments yet.</p>}
                </>
              )}
            </section>
          </div>

          <aside className="issue-aside">
            <div className="properties-panel">
              <h4 className="properties-title">Details</h4>
              <div className="field-grid">
                <div className="label">Status</div>
                <BadgePicker
                  className="status-picker"
                  label="Status"
                  value={ticket.status}
                  options={statusKeys.length ? statusKeys : [ticket.status]}
                  labels={statusKeys.length ? statusLabels : { [ticket.status]: statusLabel(ticket.status) }}
                  onChange={(status) => void save({ status })}
                />

                <div className="label">Priority</div>
                <BadgePicker
                  className="prio-picker"
                  label="Priority"
                  value={ticket.priority}
                  options={PRIORITIES}
                  labels={PRIORITY_LABEL}
                  onChange={(priority) => void save({ priority: priority as TicketPriority })}
                />

                <div className="label">Assignee</div>
                <div className="assignee-select-wrap">
                  {assignee && (
                    <span className="avatar sm" title={assignee.name}>
                      {initials(assignee.name)}
                    </span>
                  )}
                  <select
                    className="prop-select"
                    value={ticket.assignee_id ?? ""}
                    onChange={(e) =>
                      void save({ assignee_id: e.target.value ? e.target.value : null })
                    }
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="label">Due date</div>
                <input
                  type="date"
                  className="prop-date-input"
                  value={ticket.due_at ?? ""}
                  onChange={(e) => void save({ due_at: e.target.value || null })}
                />

                <div className="label">Type</div>
                <div className="prop-val">
                  <span className={`prop-type-badge ${ticket.type}`}>
                    {ticket.type === "task" ? "Task" : "Milestone"}
                  </span>
                </div>

                <div className="label">Project</div>
                <div className="prop-val">
                  <span className="prop-project-name">{project.name}</span>
                </div>

                {(ticket.date_from || ticket.date_to) && (
                  <>
                    <div className="label">Dates</div>
                    <div className="prop-val date-range">
                      {ticket.date_from ?? "—"} → {ticket.date_to ?? "—"}
                    </div>
                  </>
                )}
              </div>
            </div>

            {canDelete && (
              <div className="issue-danger-action">
                <button
                  type="button"
                  className="btn-delete-subtle"
                  disabled={busy}
                  onClick={() => void removeTicket()}
                  title="Only author or project owner can delete"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Delete issue
                </button>
                <span className="danger-hint">Only author or project owner can delete.</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );

  if (mode === "page") {
    return <div className="issue-page">{content}</div>;
  }

  if (mode === "modal") {
    return (
      <div className="issue-modal-layer" onMouseDown={onClose}>
        <div className="issue-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog">
          {content}
        </div>
      </div>
    );
  }

  // Non-modal inspector: no backdrop dim; board stays interactive
  return (
    <aside className="drawer" role="dialog">
      {content}
    </aside>
  );
}

export { issueKey, initials, statusLabel, PRIORITY_LABEL, PRIORITIES };
