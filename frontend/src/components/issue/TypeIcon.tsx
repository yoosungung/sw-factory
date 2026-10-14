import type { Ticket } from "../../api";

/** Unified ticket type glyph — color stays on `.type-icon.{task|milestone}`. */
export function TypeIcon({ type }: { type: Ticket["type"] }) {
  return <span className={`type-icon ${type}`}>✓</span>;
}
