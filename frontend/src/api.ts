export type User = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  is_admin: boolean;
};

export type MemberLane = "pm" | "ta" | "qa" | "aa" | "km" | "developer";

export type Member = {
  user_id: string;
  role: "owner" | "member";
  lane?: MemberLane | null;
  email: string;
  name: string;
};

export type Client = {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  role?: "owner" | "member";
};

export type Project = {
  id: string;
  client_id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  role?: "owner" | "member";
};

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type StatusCategory = "backlog" | "active" | "done";

export type ProjectStatus = {
  key: string;
  label: string;
  category: StatusCategory;
  sort_order: number;
};

export type Ticket = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  type: "task" | "milestone";
  status: string;
  priority: TicketPriority;
  sort_order: number;
  milestone_id: string | null;
  assignee_id: string | null;
  due_at: string | null;
  date_from: string | null;
  date_to: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
};

export type FileMeta = { id: string; filename: string; size: number; mime?: string };

export type TicketActivity = {
  id: string;
  ticket_id: string;
  actor_id: string;
  field: string;
  old_val: string | null;
  new_val: string | null;
  at: string;
};

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `http_${status}`);
    this.status = status;
    this.body = body;
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export type TicketPatch = Partial<
  Pick<
    Ticket,
    | "title"
    | "description"
    | "type"
    | "status"
    | "priority"
    | "sort_order"
    | "assignee_id"
    | "due_at"
    | "milestone_id"
    | "date_from"
    | "date_to"
    | "version"
  >
>;

export const client = {
  me: () => api<{ user: User }>("/api/auth/me"),
  register: (body: { email: string; password: string; name: string }) =>
    api<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  updateProfile: (body: { name?: string; email?: string }) =>
    api<{ user: User }>("/api/users/me", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    api<{ ok: boolean }>("/api/auth/password", { method: "POST", body: JSON.stringify(body) }),
  searchUsers: (q: string, limit = 10) =>
    api<{ users: Array<{ id: string; email: string; name: string }> }>(
      `/api/users/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  search: (q: string, limit = 20) =>
    api<{ clients: Client[]; projects: Project[]; tickets: Ticket[] }>(
      `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  clients: () => api<{ clients: Client[] }>("/api/clients"),
  createClient: (body: { name: string; description?: string }) =>
    api<{ client: Client }>("/api/clients", { method: "POST", body: JSON.stringify(body) }),
  getClient: (id: string) => api<{ client: Client }>(`/api/clients/${id}`),
  patchClient: (id: string, body: { name?: string; description?: string }) =>
    api<{ client: Client }>(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteClient: (id: string) =>
    api<{ ok: boolean }>(`/api/clients/${id}`, { method: "DELETE" }),
  clientProjects: (id: string) => api<{ projects: Project[] }>(`/api/clients/${id}/projects`),
  clientMembers: (id: string) => api<{ members: Member[] }>(`/api/clients/${id}/members`),
  addClientMember: (id: string, body: { user_id?: string; email?: string; role: "owner" | "member" }) =>
    api<{ member: Member }>(`/api/clients/${id}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  removeClientMember: (id: string, userId: string) =>
    api<{ ok: boolean }>(`/api/clients/${id}/members/${userId}`, { method: "DELETE" }),

  projects: (clientId?: string) =>
    api<{ projects: Project[] }>(
      `/api/projects${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}`,
    ),
  createProject: (body: { name: string; description?: string; client_id: string }) =>
    api<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  project: (id: string) => api<{ project: Project }>(`/api/projects/${id}`),
  patchProject: (
    id: string,
    body: { name?: string; description?: string; client_id?: string },
  ) =>
    api<{ project: Project }>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProject: (id: string) =>
    api<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  projectMembers: (id: string) => api<{ members: Member[] }>(`/api/projects/${id}/members`),
  addProjectMember: (
    id: string,
    body: { user_id?: string; email?: string; role: "owner" | "member"; lane?: MemberLane | null },
  ) =>
    api<{ member: Member }>(`/api/projects/${id}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchProjectMember: (
    id: string,
    userId: string,
    body: { role?: "owner" | "member"; lane?: MemberLane | null },
  ) =>
    api<{ member: Member }>(`/api/projects/${id}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeProjectMember: (id: string, userId: string) =>
    api<{ ok: boolean }>(`/api/projects/${id}/members/${userId}`, { method: "DELETE" }),
  projectStatuses: (id: string) =>
    api<{ statuses: ProjectStatus[] }>(`/api/projects/${id}/statuses`),
  putProjectStatuses: (
    id: string,
    body: {
      statuses: Array<{ key: string; label: string; category: StatusCategory; sort_order?: number }>;
      migrate?: Record<string, string>;
    },
  ) =>
    api<{ statuses: ProjectStatus[] }>(`/api/projects/${id}/statuses`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  tickets: (
    projectId: string,
    query?: {
      type?: string;
      status?: string;
      assignee_id?: string;
      created_by?: string;
      cursor?: string;
      limit?: number;
    },
  ) => {
    const q = new URLSearchParams();
    if (query?.type) q.set("type", query.type);
    if (query?.status) q.set("status", query.status);
    if (query?.assignee_id) q.set("assignee_id", query.assignee_id);
    if (query?.created_by) q.set("created_by", query.created_by);
    if (query?.cursor) q.set("cursor", query.cursor);
    if (query?.limit) q.set("limit", String(query.limit));
    const qs = q.toString();
    return api<{ tickets: Ticket[]; next_cursor?: string | null }>(
      `/api/projects/${projectId}/tickets${qs ? `?${qs}` : ""}`,
    );
  },
  createTicket: (
    projectId: string,
    body: Partial<Ticket> & { title: string; type: Ticket["type"] },
  ) =>
    api<{ ticket: Ticket }>(`/api/projects/${projectId}/tickets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getTicket: (id: string) => api<{ ticket: Ticket }>(`/api/tickets/${id}`),
  patchTicket: (id: string, body: TicketPatch) =>
    api<{ ticket: Ticket }>(`/api/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTicket: (id: string) =>
    api<{ ok: boolean }>(`/api/tickets/${id}`, { method: "DELETE" }),
  ticketActivities: (id: string) =>
    api<{ activities: TicketActivity[] }>(`/api/tickets/${id}/activities`),
  kanban: (projectId: string, includeArchived = false) =>
    api<{ columns: Record<string, Ticket[]>; statuses: ProjectStatus[] }>(
      `/api/projects/${projectId}/kanban${includeArchived ? "?include_archived=true" : ""}`,
    ),
  timeline: (projectId: string) =>
    api<{ items: Ticket[] }>(`/api/projects/${projectId}/timeline`),

  comments: (ticketId: string) =>
    api<{ comments: Comment[] }>(`/api/tickets/${ticketId}/comments`),
  addComment: (ticketId: string, body: string) =>
    api<{ comment: Comment }>(`/api/tickets/${ticketId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  deleteComment: (id: string) =>
    api<{ ok: boolean }>(`/api/comments/${id}`, { method: "DELETE" }),

  listFiles: (ticketId: string) =>
    api<{ files: FileMeta[] }>(`/api/tickets/${ticketId}/files`),
  uploadFile: (ticketId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<{ file: FileMeta }>(`/api/tickets/${ticketId}/files`, {
      method: "POST",
      body: form,
    });
  },
  /** Direct upload for larger files (M7 / FE6). */
  uploadFileDirect: async (ticketId: string, file: File) => {
    const meta = await api<{
      upload_url: string;
      r2_key: string;
    }>(`/api/tickets/${ticketId}/files/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
      }),
    });
    const put = await fetch(meta.upload_url, {
      method: "PUT",
      body: file,
      credentials: "include",
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!put.ok) throw new ApiError(put.status, { error: "upload_failed" });
    return api<{ file: FileMeta }>(`/api/tickets/${ticketId}/files/confirm`, {
      method: "POST",
      body: JSON.stringify({
        r2_key: meta.r2_key,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
      }),
    });
  },
  deleteFile: (id: string) =>
    api<{ ok: boolean }>(`/api/files/${id}`, { method: "DELETE" }),

  adminUsers: () => api<{ users: User[] }>("/api/admin/users"),
  patchAdminUser: (id: string, body: { is_admin: boolean }) =>
    api<{ user: User }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
