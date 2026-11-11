import { useEffect, useId, useRef, useState } from "react";
import { client, type Ticket } from "../../api";

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterRecentOpenTickets(
  tickets: Ticket[],
  opts: { excludeIds: string[]; now?: Date; days?: number },
): Ticket[] {
  const exclude = new Set(opts.excludeIds.filter(Boolean));
  const now = opts.now ?? new Date();
  const days = opts.days ?? 7;
  const cutoff = now.getTime() - days * DAY_MS;
  return tickets.filter((t) => {
    if (exclude.has(t.id)) return false;
    const created = Date.parse(t.created_at);
    if (Number.isNaN(created) || created < cutoff) return false;
    return true;
  });
}

function matchesQuery(t: Ticket, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return t.title.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle);
}

function shortLabel(t: Ticket) {
  return `${t.id.slice(0, 8)} ${t.title}`;
}

export function TicketPicker({
  projectId,
  excludeIds,
  disabled,
  ariaLabel,
  placeholder = "Search recent tickets or paste id…",
  confirmLabel,
  onPick,
}: {
  projectId: string;
  excludeIds: string[];
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  confirmLabel: string;
  onPick: (id: string) => void;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const excludeKey = excludeIds.join(",");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Ticket[]>([]);
  const [searchHits, setSearchHits] = useState<Ticket[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setCandidates([]);
    setSearchHits([]);
  }, [projectId, excludeKey]);

  async function ensureCandidates() {
    if (loadedRef.current) return;
    setLoading(true);
    try {
      const res = await client.tickets(projectId, { exclude_done: true, limit: 100 });
      setCandidates(
        filterRecentOpenTickets(res.tickets, {
          excludeIds: excludeKey.split(",").filter(Boolean),
        }),
      );
      loadedRef.current = true;
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchHits([]);
      return;
    }
    const local = candidates.filter((t) => matchesQuery(t, trimmed));
    if (local.length > 0) {
      setSearchHits([]);
      return;
    }
    setLoading(true);
    const exclude = new Set(excludeKey.split(",").filter(Boolean));
    const handle = window.setTimeout(() => {
      void client
        .search(trimmed, 20)
        .then((res) => {
          setSearchHits(
            res.tickets.filter((t) => t.project_id === projectId && !exclude.has(t.id)),
          );
        })
        .catch(() => setSearchHits([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [q, candidates, projectId, excludeKey]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const trimmed = q.trim();
  const localHits = candidates.filter((t) => matchesQuery(t, trimmed));
  const hits = localHits.length > 0 ? localHits : searchHits;
  const showMenu = open && (loading || trimmed.length > 0 || candidates.length > 0);

  function pick(id: string) {
    const next = id.trim();
    if (!next) return;
    onPick(next);
    setQ("");
    setOpen(false);
    setSearchHits([]);
  }

  return (
    <div className="deps-add ticket-picker" ref={wrapRef}>
      <div className="user-search" style={{ flex: 1 }}>
        <input
          type="search"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showMenu && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={q}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            void ensureCandidates();
          }}
        />
        {showMenu && (
          <ul id={listId} className="user-search-menu" role="listbox">
            {loading && <li className="muted">Loading…</li>}
            {!loading && hits.length === 0 && trimmed.length > 0 && (
              <li className="muted">No matches — paste full id to confirm</li>
            )}
            {!loading &&
              hits.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-label={shortLabel(t)}
                    disabled={disabled}
                    onClick={() => pick(t.id)}
                  >
                    <span>{shortLabel(t)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="btn-subtle sm"
        disabled={disabled || !trimmed}
        aria-label={confirmLabel}
        onClick={() => pick(trimmed)}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
