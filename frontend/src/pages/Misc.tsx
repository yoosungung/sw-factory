import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { client, type Member, type Project, type Ticket, type User } from "../api";
import { IssuePanel, initials, issueKey } from "../components/issue/IssuePanel";
import { AppChrome } from "../components/chrome/AppChrome";
import { useAllProjects, useClients } from "../hooks/useSession";
import { touchRecentProject, touchRecentTicket } from "../lib/recent";

export function TeamsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
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

export function BrowseIssuePage({ user, onLogout }: { user: User; onLogout: () => void }) {
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
