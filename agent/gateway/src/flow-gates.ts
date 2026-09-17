import type { FlowGates } from "./schedule";

export async function fetchFlowGates(opts: {
  factoryBaseUrl: string;
  sessionCookie: string;
  fetchImpl?: typeof fetch;
}): Promise<FlowGates | null> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const url = `${opts.factoryBaseUrl.replace(/\/$/, "")}/api/agent/flow-gates`;
  try {
    const res = await fetchFn(url, {
      headers: { Cookie: opts.sessionCookie },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<FlowGates>;
    return {
      in_progress: !!json.in_progress,
      flow_active: !!json.flow_active,
    };
  } catch {
    return null;
  }
}
