import { useEffect, useId, useRef, useState } from "react";
import { client } from "../api";

export type UserHit = { id: string; email: string; name: string };

export function UserSearchField({
  excludeIds,
  value,
  onChange,
}: {
  excludeIds: string[];
  value: UserHit | null;
  onChange: (user: UserHit | null) => void;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const excludeKey = excludeIds.join(",");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const exclude = new Set(excludeKey.split(",").filter(Boolean));
    const handle = window.setTimeout(() => {
      void client
        .searchUsers(trimmed)
        .then((res) => {
          setHits(res.users.filter((u) => !exclude.has(u.id)));
          setOpen(true);
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [q, value, excludeKey]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    return (
      <div className="user-search selected">
        <span>
          {value.name} <span className="muted">({value.email})</span>
        </span>
        <button
          type="button"
          className="btn-subtle sm"
          onClick={() => {
            onChange(null);
            setQ("");
            setHits([]);
          }}
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="user-search" ref={wrapRef}>
      <input
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        required
      />
      {open && q.trim().length >= 2 && (
        <ul id={listId} className="user-search-menu" role="listbox">
          {loading && <li className="muted">Searching…</li>}
          {!loading && hits.length === 0 && (
            <li className="muted">No matching registered users</li>
          )}
          {!loading &&
            hits.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  onClick={() => {
                    onChange(u);
                    setOpen(false);
                    setHits([]);
                  }}
                >
                  <span>{u.name}</span>
                  <span className="muted">{u.email}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
