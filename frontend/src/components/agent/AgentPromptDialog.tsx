import { useState } from "react";
import { ApiError, client, type Member } from "../../api";
import { useEscape } from "../../hooks/useDom";

export function AgentPromptDialog({
  projectId,
  members,
  defaultTicketId,
  onClose,
}: {
  projectId: string;
  members: Member[];
  defaultTicketId?: string | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState(members[0]?.name ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState<{ id: string; at: string } | null>(null);

  useEscape(onClose, true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim() || !prompt.trim()) {
      setError("Target and prompt are required");
      return;
    }
    setBusy(true);
    setError("");
    setAck(null);
    try {
      const body: {
        project_id: string;
        target: string;
        prompt: string;
        ticket_id?: string;
      } = {
        project_id: projectId,
        target: target.trim(),
        prompt,
      };
      if (defaultTicketId) body.ticket_id = defaultTicketId;
      const res = await client.postAgentPrompt(body);
      setAck(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(typeof err.body.error === "string" ? err.body.error : err.message);
      } else {
        setError(err instanceof Error ? err.message : "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="create-layer" onMouseDown={onClose}>
      <form
        className="create-dialog"
        aria-label="Agent prompt"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="create-dialog-head">
          <strong>Prompt agent</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="create-dialog-body">
          <label>
            Target
            <select
              aria-label="Target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            >
              {members.length === 0 && <option value="">No members</option>}
              {members.map((m) => (
                <option key={m.user_id} value={m.name}>
                  {m.name}
                  {m.lane ? ` (${m.lane})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Prompt
            <textarea
              aria-label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the agent do?"
              rows={5}
              required
            />
          </label>
          {defaultTicketId ? (
            <p className="muted span-2">
              Scoped to issue <code>{defaultTicketId}</code>
            </p>
          ) : (
            <p className="muted span-2">No ticket scope (ticketless wake).</p>
          )}
          {error && <p className="error span-2">{error}</p>}
          {ack && (
            <p className="ok span-2" role="status">
              Queued event <code>{ack.id}</code> at <code>{ack.at}</code>
            </p>
          )}
        </div>
        <div className="create-dialog-foot">
          <button type="button" className="btn-subtle" onClick={onClose}>
            {ack ? "Close" : "Cancel"}
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !!ack}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
