import type { StatusCategory } from "./statuses";

/** ISO datetime or date → UTC calendar date (`YYYY-MM-DD`). */
export function utcDateFromIso(iso: string): string {
  return iso.slice(0, 10);
}

export function resolveTimelineDates(input: {
  existingFrom: string | null;
  existingTo: string | null;
  bodyHasFrom: boolean;
  bodyHasTo: boolean;
  bodyFrom?: string | null;
  bodyTo?: string | null;
  createdAtIso: string;
  nowIso: string;
  nextCategory: StatusCategory;
  /** `null` on create. */
  prevCategory: StatusCategory | null;
}): { date_from: string | null; date_to: string | null } {
  const nowDate = utcDateFromIso(input.nowIso);
  const createdDate = utcDateFromIso(input.createdAtIso);

  let date_from = input.bodyHasFrom ? (input.bodyFrom ?? null) : input.existingFrom;
  let date_to = input.bodyHasTo ? (input.bodyTo ?? null) : input.existingTo;

  if (!input.bodyHasFrom && date_from == null) {
    const firstBacklogEnter =
      input.nextCategory === "backlog" &&
      input.prevCategory !== null &&
      input.prevCategory !== "backlog";
    date_from = firstBacklogEnter ? nowDate : createdDate;
  }

  if (!input.bodyHasTo) {
    const firstDoneEnter =
      input.nextCategory === "done" && input.prevCategory !== "done";
    if (date_to == null) {
      date_to = nowDate;
    } else if (firstDoneEnter && date_to === createdDate) {
      date_to = nowDate;
    }
  }

  return { date_from, date_to };
}
