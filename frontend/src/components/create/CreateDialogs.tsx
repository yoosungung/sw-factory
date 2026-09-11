import { useEffect, useMemo, useState } from "react";
import {
  client,
  type Client,
  type Member,
  type Project,
  type ProjectStatus,
  type Ticket,
  type TicketPriority,
} from "../../api";
import { PRIORITY_LABEL, PRIORITIES } from "../issue/IssuePanel";
import { useEscape } from "../../hooks/useDom";

export function CreateIssueDialog({
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
  defaultStatus?: string;
  docked: boolean;
  onDock: () => void;
  onClose: () => void;
  onCreated: (projectId: string, ticketId: string) => void;
}) {
  const [projectId, setProjectId] = useState(
    defaultProjectId ?? projects[0]?.id ?? "",
  );
  const [type, setType] = useState<Ticket["type"]>("task");
  const [status, setStatus] = useState(defaultStatus ?? "backlog");
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
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
      setStatuses([]);
      return;
    }
    void client.projectMembers(projectId).then((r) => setMembers(r.members));
    void client.projectStatuses(projectId).then((r) => {
      setStatuses(r.statuses);
      const backlog = r.statuses.find((s) => s.category === "backlog");
      if (defaultStatus && r.statuses.some((s) => s.key === defaultStatus)) {
        setStatus(defaultStatus);
      } else if (backlog) {
        setStatus(backlog.key);
      } else if (r.statuses[0]) {
        setStatus(r.statuses[0].key);
      }
    });
  }, [projectId, defaultStatus]);

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
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {statuses.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
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

export function CreateSpaceDialog({
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

export function CreateProjectUnderClientDialog({
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
