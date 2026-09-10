import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  client,
  type Comment,
  type FileMeta,
  type Member,
  type Project,
  type Ticket,
  type TicketPriority,
  type User,
} from "../../api";

const STATUSES: Ticket["status"][] = ["backlog", "todo", "in_progress", "done"];
const STATUS_LABEL: Record<Ticket["status"], string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<"comments" | "history" | "files">("comments");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<
    Awaited<ReturnType<typeof client.ticketActivities>>["activities"]
  >([]);
  useEscape(onClose, mode !== "page");

  useEffect(() => {
    setTicket(initial);
    setTitle(initial.title);
    setDescription(initial.description);
    void Promise.all([
      client.comments(initial.id),
      client.listFiles(initial.id),
      client.ticketActivities(initial.id),
    ]).then(([c, f, a]) => {
      setComments(c.comments);
      setFiles(f.files);
      setActivities(a.activities);
    });
  }, [initial]);

  const canDelete = ticket.created_by === user.id || projectRole === "owner";

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
    setComments((await client.comments(ticket.id)).comments);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    // Prefer direct upload for files > 256KB
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
        <span className="issue-key">
          <span className={`type-icon ${ticket.type}`}>{ticket.type === "task" ? "✓" : "◆"}</span>
          {key}
        </span>
        <div className="row-gap">
          {mode !== "page" && (
            <Link className="icon-btn" to={`/browse/${ticket.id}`} title="Open full page">
              ↗
            </Link>
          )}
          {mode !== "page" && (
            <button type="button" className="icon-btn" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="drawer-body">
        <input
          className="issue-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== ticket.title) void save({ title: title.trim() });
          }}
        />
        {error && <p className="error">{error}</p>}
        <div className="field-grid">
          <div className="label">Status</div>
          <select
            value={ticket.status}
            onChange={(e) => void save({ status: e.target.value as Ticket["status"] })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <div className="label">Priority</div>
          <select
            value={ticket.priority}
            onChange={(e) => void save({ priority: e.target.value as TicketPriority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>

          <div className="label">Assignee</div>
          <select
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

          <div className="label">Due date</div>
          <input
            type="date"
            value={ticket.due_at ?? ""}
            onChange={(e) => void save({ due_at: e.target.value || null })}
          />

          <div className="label">Type</div>
          <div>{ticket.type === "task" ? "Task" : "Milestone"}</div>
          <div className="label">Project</div>
          <div>{project.name}</div>
          {(ticket.date_from || ticket.date_to) && (
            <>
              <div className="label">Dates</div>
              <div>
                {ticket.date_from ?? "—"} → {ticket.date_to ?? "—"}
              </div>
            </>
          )}
          {assignee && (
            <>
              <div className="label">Assigned</div>
              <div className="name-cell">
                <span className="avatar sm">{initials(assignee.name)}</span>
                {assignee.name}
              </div>
            </>
          )}
        </div>

        <section>
          <h3 className="section-title">Description</h3>
          <textarea
            className="issue-desc"
            value={description}
            placeholder="Add a description…"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== ticket.description) void save({ description });
            }}
          />
        </section>

        <section>
          <h3 className="section-title">Activity</h3>
          <div className="activity-tabs">
            <button
              type="button"
              className={`chip ${tab === "comments" ? "active" : ""}`}
              onClick={() => setTab("comments")}
            >
              Comments
            </button>
            <button
              type="button"
              className={`chip ${tab === "history" ? "active" : ""}`}
              onClick={() => setTab("history")}
            >
              History
            </button>
            <button
              type="button"
              className={`chip ${tab === "files" ? "active" : ""}`}
              onClick={() => setTab("files")}
            >
              Files
            </button>
          </div>

          {tab === "comments" && (
            <>
              <form className="comment-form" onSubmit={(e) => void postComment(e)}>
                <textarea
                  placeholder="Add a comment…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
                <div>
                  <button className="btn-primary" type="submit">
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
                              setComments((await client.comments(ticket.id)).comments);
                            })
                          }
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div>{c.body}</div>
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

        {canDelete && (
          <section className="danger-block">
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => void removeTicket()}
            >
              Delete issue
            </button>
            <p className="muted">Only the author or project owner can delete.</p>
          </section>
        )}
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

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog">
        {content}
      </aside>
    </>
  );
}

export { issueKey, initials, STATUS_LABEL, PRIORITY_LABEL, STATUSES, PRIORITIES };
