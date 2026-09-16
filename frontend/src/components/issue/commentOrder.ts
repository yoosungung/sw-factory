import type { Comment } from "../../api";

/** Issue UI display order: newest comment first (API remains ASC). */
export function commentsNewestFirst(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
