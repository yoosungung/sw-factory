import { Link } from "react-router-dom";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
};

export function EmptyState({ title, description, actionLabel, onAction, actionHref }: Props) {
  return (
    <div className="empty-state" role="status" data-testid="empty-state">
      <div className="empty-state-icon" aria-hidden>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="12" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M14 20h20M14 26h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-desc">{description}</p>
      {actionLabel && actionHref && (
        <Link className="btn-primary empty-state-action" to={actionHref}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button type="button" className="btn-primary empty-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
