import React from "react";
import { QUESTION_STATUS as S } from "../../contexts/ExamContext";

/**
 * The five palette states, with the meaning spelled out.
 *
 * Shared between the pre-exam briefing and the live paper so a candidate learns
 * the vocabulary once and sees exactly the same marks during the exam.
 */
export const STATUS_SWATCH = {
  [S.ANSWERED]: "bg-status-answered",
  [S.NOT_ANSWERED]: "bg-status-unanswered",
  [S.MARKED]: "bg-status-marked",
  [S.ANSWERED_MARKED]: "bg-status-marked",
  [S.NOT_VISITED]: "bg-white border border-gray-300",
};

export const STATUS_ITEMS = [
  [S.ANSWERED, "Answered", "answered", "You have chosen an option."],
  [S.NOT_ANSWERED, "Not Answered", "notAnswered", "You opened the question but left it blank."],
  [S.MARKED, "Marked for Review", "marked", "Flagged to revisit. Not answered, so it earns nothing."],
  [S.ANSWERED_MARKED, "Answered & Marked", "answeredMarked", "Flagged to revisit — and still evaluated."],
  [S.NOT_VISITED, "Not Visited", "notVisited", "You have not opened this question yet."],
];

/** The swatch alone, with the tick that distinguishes answered-and-marked. */
export const StatusSwatch = ({ status, size = "h-4 w-4" }) => (
  <span className="relative inline-block shrink-0">
    <span className={`block ${size} rounded ${STATUS_SWATCH[status]}`} />
    {status === S.ANSWERED_MARKED && (
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -right-1 grid h-2.5 w-2.5 place-items-center
                   rounded-full bg-status-answered text-[6px] font-bold text-white ring-1 ring-white"
      >
        ✓
      </span>
    )}
  </span>
);

/** Explanatory form, for the briefing screen. */
const StatusLegend = ({ describe = false, counts }) => (
  <ul className={describe ? "space-y-3" : "space-y-2"}>
    {STATUS_ITEMS.map(([status, label, countKey, description]) => (
      <li key={label} className="flex items-start gap-3 text-sm">
        <span className="mt-0.5">
          <StatusSwatch status={status} />
        </span>
        {counts && (
          <span className="w-6 shrink-0 font-semibold text-gray-900 tabular">{counts[countKey]}</span>
        )}
        <span className="min-w-0">
          <span className="font-medium text-gray-900">{label}</span>
          {describe && <span className="block text-[13px] leading-snug text-gray-500">{description}</span>}
        </span>
      </li>
    ))}
  </ul>
);

export default StatusLegend;
