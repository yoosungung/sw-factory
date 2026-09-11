import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { client, type User } from "../api";
import { initials } from "../components/issue/IssuePanel";

export function AdminPage({
  user,
  chrome,
}: {
  user: User;
  chrome: (opts: { children: React.ReactNode }) => React.ReactNode;
}) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await client.adminUsers();
    setUsers(r.users);
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "error"));
  }, []);

  if (!user.is_admin) return <Navigate to="/" replace />;

  return chrome({
    children: (
      <div className="page-header">
        <div className="breadcrumb">
          <span>Admin</span>
        </div>
        <div className="page-title-row">
          <h1>Admin</h1>
        </div>
        {error && <p className="error">{error}</p>}
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const name = spaceName.trim();
            if (!name) return;
            setBusy(true);
            void client
              .createClient({ name })
              .then((r) => navigate(`/clients/${r.client.id}`))
              .catch((err) => {
                setError(err instanceof Error ? err.message : "error");
                setBusy(false);
              });
          }}
        >
          <input
            aria-label="New space name"
            placeholder="New space name"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            required
          />
          <button className="btn-primary" type="submit" disabled={busy}>
            Create space
          </button>
        </form>
        <div className="content-panel tableish cols-4">
          <div className="list-row head">
            <span>Name</span>
            <span>Email</span>
            <span>Admin</span>
            <span>Joined</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="list-row">
              <span className="name-cell">
                <span className="avatar sm">{initials(u.name)}</span>
                {u.name}
                {u.id === user.id ? " (you)" : ""}
              </span>
              <span className="muted">{u.email}</span>
              <span>
                <label className="row-gap">
                  <input
                    type="checkbox"
                    checked={u.is_admin}
                    onChange={(e) => {
                      const next = e.target.checked;
                      void client
                        .patchAdminUser(u.id, { is_admin: next })
                        .then(() => reload())
                        .catch((err) => setError(err instanceof Error ? err.message : "error"));
                    }}
                  />
                  admin
                </label>
              </span>
              <span className="muted">{u.created_at.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  });
}
