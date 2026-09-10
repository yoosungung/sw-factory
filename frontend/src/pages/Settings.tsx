import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { client, type Client, type Member, type Project, type User } from "../api";
import { initials } from "../components/issue/IssuePanel";

function SettingsNav({
  base,
  section,
  items,
  isOwner,
}: {
  base: string;
  section: string;
  items: Array<{ path: string; label: string; ownerOnly?: boolean }>;
  isOwner: boolean;
}) {
  return (
    <nav className="settings-nav">
      {items
        .filter((i) => !i.ownerOnly || isOwner)
        .map((i) => (
          <Link
            key={i.path}
            className={`side-link ${section === i.path ? "active" : ""}`}
            to={`${base}/${i.path}`}
          >
            {i.label}
          </Link>
        ))}
    </nav>
  );
}

function PeopleTable({
  members,
  isOwner,
  currentUserId,
  onRole,
  onRemove,
  addSlot,
}: {
  members: Member[];
  isOwner: boolean;
  currentUserId: string;
  onRole: (userId: string, role: "owner" | "member") => void;
  onRemove: (userId: string) => void;
  addSlot: React.ReactNode;
}) {
  return (
    <div className="content-panel tableish">
      <div className="list-row head">
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span></span>
      </div>
      {members.map((m) => (
        <div key={m.user_id} className="list-row">
          <span className="name-cell">
            <span className="avatar sm">{initials(m.name)}</span>
            {m.name}
            {m.user_id === currentUserId ? " (you)" : ""}
          </span>
          <span className="muted">{m.email}</span>
          <span>
            {isOwner ? (
              <select
                value={m.role}
                onChange={(e) => onRole(m.user_id, e.target.value as "owner" | "member")}
              >
                <option value="owner">owner</option>
                <option value="member">member</option>
              </select>
            ) : (
              m.role
            )}
          </span>
          <span>
            {isOwner && (
              <button type="button" className="btn-subtle sm" onClick={() => onRemove(m.user_id)}>
                Remove
              </button>
            )}
          </span>
        </div>
      ))}
      {isOwner && addSlot}
      {!isOwner && (
        <p className="muted pad">Only owners can invite, change roles, or remove people.</p>
      )}
    </div>
  );
}

export function ClientSettingsPage({
  user,
  chrome,
}: {
  user: User;
  chrome: (opts: {
    activeClient?: Client | null;
    children: React.ReactNode;
  }) => React.ReactNode;
}) {
  const { id = "", "*": rest } = useParams();
  const section = (rest ?? "details").split("/")[0] || "details";
  const navigate = useNavigate();
  const [org, setOrg] = useState<Client | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "member">("member");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function reload() {
    const [c, m] = await Promise.all([client.getClient(id), client.clientMembers(id)]);
    setOrg(c.client);
    setName(c.client.name);
    setDescription(c.client.description);
    setMembers(m.members);
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "error"));
  }, [id]);

  if (!org) {
    return chrome({ children: <div className="empty">Loading…</div> });
  }

  const isOwner = org.role === "owner";
  const base = `/clients/${id}/settings`;

  if (section === "danger" && !isOwner) {
    return <Navigate to={`${base}/details`} replace />;
  }

  return chrome({
    activeClient: org,
    children: (
      <div className="settings-layout">
        <aside className="settings-side">
          <Link to={`/clients/${id}`} className="back-link">
            ← Back to space
          </Link>
          <h2>Space settings</h2>
          <SettingsNav
            base={base}
            section={section}
            isOwner={isOwner}
            items={[
              { path: "details", label: "Details" },
              { path: "people", label: "People" },
              { path: "danger", label: "Danger zone", ownerOnly: true },
            ]}
          />
        </aside>
        <div className="settings-main">
          {error && <p className="error">{error}</p>}
          {msg && <p className="ok">{msg}</p>}

          {section === "details" && (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void client
                  .patchClient(id, { name, description })
                  .then((r) => {
                    setOrg({ ...org, ...r.client });
                    setMsg("Saved");
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "error"));
              }}
            >
              <h1>Details</h1>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <button className="btn-primary" type="submit">
                Save
              </button>
            </form>
          )}

          {section === "people" && (
            <>
              <h1>People</h1>
              <PeopleTable
                members={members}
                isOwner={isOwner}
                currentUserId={user.id}
                onRole={(userId, role) =>
                  void client
                    .addClientMember(id, { user_id: userId, role })
                    .then(() => reload())
                    .catch((err) => setError(err instanceof Error ? err.message : "error"))
                }
                onRemove={(userId) =>
                  void client
                    .removeClientMember(id, userId)
                    .then(() => reload())
                    .catch((err) => setError(err instanceof Error ? err.message : "error"))
                }
                addSlot={
                  <form
                    className="list-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void client
                        .addClientMember(id, { user_id: inviteUserId.trim(), role: inviteRole })
                        .then(() => {
                          setInviteUserId("");
                          return reload();
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : "error"));
                    }}
                  >
                    <input
                      placeholder="User id to invite"
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      required
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "owner" | "member")}
                    >
                      <option value="member">member</option>
                      <option value="owner">owner</option>
                    </select>
                    <button className="btn-primary" type="submit">
                      Add people
                    </button>
                    <span />
                  </form>
                }
              />
            </>
          )}

          {section === "danger" && isOwner && (
            <div className="danger-block">
              <h1>Danger zone</h1>
              <p>Delete this space and all its projects. Type the space name to confirm.</p>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={org.name}
              />
              <button
                type="button"
                className="btn-danger"
                disabled={confirmName !== org.name}
                onClick={() =>
                  void client
                    .deleteClient(id)
                    .then(() => navigate("/"))
                    .catch((err) => setError(err instanceof Error ? err.message : "error"))
                }
              >
                Delete space
              </button>
            </div>
          )}
        </div>
      </div>
    ),
  });
}

export function ProjectSettingsPage({
  user,
  chrome,
}: {
  user: User;
  chrome: (opts: {
    activeClient?: Client | null;
    activeProject?: Project | null;
    children: React.ReactNode;
  }) => React.ReactNode;
}) {
  const { id = "", "*": rest } = useParams();
  const section = (rest ?? "details").split("/")[0] || "details";
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [org, setOrg] = useState<Client | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [clientMembers, setClientMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "member">("member");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function reload() {
    const p = await client.project(id);
    setProject(p.project);
    setName(p.project.name);
    setDescription(p.project.description);
    const [m, c, cm] = await Promise.all([
      client.projectMembers(id),
      client.getClient(p.project.client_id),
      client.clientMembers(p.project.client_id),
    ]);
    setMembers(m.members);
    setOrg(c.client);
    setClientMembers(cm.members);
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "error"));
  }, [id]);

  if (!project) {
    return chrome({ children: <div className="empty">Loading…</div> });
  }

  const isOwner = project.role === "owner";
  const base = `/projects/${id}/settings`;
  const available = clientMembers.filter(
    (cm) => !members.some((m) => m.user_id === cm.user_id),
  );

  if (section === "danger" && !isOwner) {
    return <Navigate to={`${base}/details`} replace />;
  }

  return chrome({
    activeClient: org,
    activeProject: project,
    children: (
      <div className="settings-layout">
        <aside className="settings-side">
          <Link to={`/projects/${id}?view=board`} className="back-link">
            ← Back to project
          </Link>
          <h2>Project settings</h2>
          <SettingsNav
            base={base}
            section={section}
            isOwner={isOwner}
            items={[
              { path: "details", label: "Details" },
              { path: "people", label: "People" },
              { path: "board", label: "Board" },
              { path: "danger", label: "Danger zone", ownerOnly: true },
            ]}
          />
        </aside>
        <div className="settings-main">
          {error && <p className="error">{error}</p>}
          {msg && <p className="ok">{msg}</p>}

          {section === "details" && (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void client
                  .patchProject(id, { name, description })
                  .then((r) => {
                    setProject({ ...project, ...r.project });
                    setMsg("Saved");
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "error"));
              }}
            >
              <h1>Details</h1>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label>
                Space
                <input value={org?.name ?? ""} disabled />
              </label>
              <button className="btn-primary" type="submit">
                Save
              </button>
            </form>
          )}

          {section === "people" && (
            <>
              <h1>People</h1>
              <PeopleTable
                members={members}
                isOwner={isOwner}
                currentUserId={user.id}
                onRole={(userId, role) =>
                  void client
                    .addProjectMember(id, { user_id: userId, role })
                    .then(() => reload())
                    .catch((err) => setError(err instanceof Error ? err.message : "error"))
                }
                onRemove={(userId) =>
                  void client
                    .removeProjectMember(id, userId)
                    .then(() => reload())
                    .catch((err) => setError(err instanceof Error ? err.message : "error"))
                }
                addSlot={
                  <form
                    className="list-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!inviteUserId) return;
                      void client
                        .addProjectMember(id, { user_id: inviteUserId, role: inviteRole })
                        .then(() => {
                          setInviteUserId("");
                          return reload();
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : "error"));
                    }}
                  >
                    <select
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      required
                    >
                      <option value="">Select space member…</option>
                      {available.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "owner" | "member")}
                    >
                      <option value="member">member</option>
                      <option value="owner">owner</option>
                    </select>
                    <button className="btn-primary" type="submit" disabled={!inviteUserId}>
                      Add people
                    </button>
                    <span />
                  </form>
                }
              />
            </>
          )}

          {section === "board" && (
            <div>
              <h1>Board</h1>
              <p className="muted">
                Columns are fixed: Backlog, To Do, In Progress, Done. Custom columns are not
                supported.
              </p>
              <ul className="board-col-list">
                <li>Backlog</li>
                <li>To Do</li>
                <li>In Progress</li>
                <li>Done</li>
              </ul>
            </div>
          )}

          {section === "danger" && isOwner && (
            <div className="danger-block">
              <h1>Danger zone</h1>
              <p>Delete this project and all issues. Type the project name to confirm.</p>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={project.name}
              />
              <button
                type="button"
                className="btn-danger"
                disabled={confirmName !== project.name}
                onClick={() =>
                  void client
                    .deleteProject(id)
                    .then(() => navigate(org ? `/clients/${org.id}` : "/"))
                    .catch((err) => setError(err instanceof Error ? err.message : "error"))
                }
              >
                Delete project
              </button>
            </div>
          )}
        </div>
      </div>
    ),
  });
}
