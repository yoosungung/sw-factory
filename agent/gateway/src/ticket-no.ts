/**
 * Display ticket key — same algorithm as frontend `issueKey`
 * (e.g. project "sw-factory" + id ea2d1b81-… → "SWF-EA2D").
 */
export function formatTicketNo(projectName: string, ticketId: string): string {
  const p = (projectName.replace(/[^A-Za-z0-9]/g, "").slice(0, 3) || "LT").toUpperCase();
  const n = ticketId.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${p}-${n}`;
}

const projectNameCache = new Map<string, string>();

/** Test helper. */
export function clearProjectNameCache(): void {
  projectNameCache.clear();
}

/**
 * Resolve UI-style `ticket_no` for gateway tick logs.
 * Uses GET /api/projects/:id (cached). Ticketless → null.
 */
export async function resolveTicketNo(opts: {
  factoryBaseUrl: string;
  sessionCookie: string;
  projectId: string | null;
  ticketId: string | null;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  if (!opts.ticketId) return null;

  let projectName = "";
  if (opts.projectId) {
    const cached = projectNameCache.get(opts.projectId);
    if (cached !== undefined) {
      projectName = cached;
    } else {
      const fetchFn = opts.fetchImpl ?? fetch;
      try {
        const res = await fetchFn(`${opts.factoryBaseUrl}/api/projects/${opts.projectId}`, {
          headers: { Cookie: opts.sessionCookie },
        });
        if (res.ok) {
          const json = (await res.json()) as { project?: { name?: string } };
          projectName = json.project?.name ?? "";
        }
      } catch {
        projectName = "";
      }
      projectNameCache.set(opts.projectId, projectName);
    }
  }

  return formatTicketNo(projectName, opts.ticketId);
}
