export type FactoryClientOptions = {
  baseUrl: string;
  cookie: string;
  fetchImpl?: typeof fetch;
};

export class FactoryClient {
  constructor(private opts: FactoryClientOptions) {}

  private get fetchFn() {
    return this.opts.fetchImpl ?? fetch;
  }

  private url(path: string): string {
    return `${this.opts.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Cookie", this.opts.cookie);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return this.fetchFn(this.url(path), { ...init, headers });
  }

  async getTicket(id: string) {
    const res = await this.request(`/api/tickets/${id}`);
    if (!res.ok) throw new Error(`get_ticket ${res.status}`);
    return res.json();
  }

  async listTickets(projectId: string, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query);
    const res = await this.request(`/api/projects/${projectId}/tickets?${qs}`);
    if (!res.ok) throw new Error(`list_tickets ${res.status}`);
    return res.json();
  }

  async createTicket(projectId: string, body: Record<string, unknown>) {
    const res = await this.request(`/api/projects/${projectId}/tickets`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create_ticket ${res.status}`);
    return res.json();
  }

  async updateTicket(id: string, body: Record<string, unknown>) {
    const res = await this.request(`/api/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`update_ticket ${res.status}`);
    return res.json();
  }

  async getComments(ticketId: string) {
    const res = await this.request(`/api/tickets/${ticketId}/comments`);
    if (!res.ok) throw new Error(`get_comments ${res.status}`);
    return res.json();
  }

  async addComment(ticketId: string, body: string) {
    const res = await this.request(`/api/tickets/${ticketId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`add_comment ${res.status}`);
    return res.json();
  }

  async editComment(commentId: string, body: string) {
    const res = await this.request(`/api/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`edit_comment ${res.status}`);
    return res.json();
  }

  async listProjects() {
    const res = await this.request(`/api/projects`);
    if (!res.ok) throw new Error(`list_projects ${res.status}`);
    return res.json();
  }

  async getProject(id: string) {
    const res = await this.request(`/api/projects/${id}`);
    if (!res.ok) throw new Error(`get_project ${res.status}`);
    return res.json();
  }

  async listProjectMembers(projectId: string) {
    const res = await this.request(`/api/projects/${projectId}/members`);
    if (!res.ok) throw new Error(`list_project_members ${res.status}`);
    return res.json();
  }

  async search(q: string) {
    const res = await this.request(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`search ${res.status}`);
    return res.json();
  }
}

export async function loginFactory(opts: {
  baseUrl: string;
  email: string;
  password: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(`${opts.baseUrl.replace(/\/$/, "")}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: opts.email, password: opts.password }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const set = res.headers.get("Set-Cookie") ?? "";
  const m = /lt_session=[^;]+/.exec(set);
  if (!m) throw new Error("login missing session cookie");
  return m[0];
}
