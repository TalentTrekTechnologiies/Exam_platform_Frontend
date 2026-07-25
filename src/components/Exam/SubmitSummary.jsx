import React from "react";
import { FiAlertTriangle } from "react-icons/fi";

/**
 * The confirmation every real exam portal shows before a candidate commits:
 * a section-by-section tally, so nobody submits while a whole subject is blank.
 *
 * Answered-and-marked counts as answered here, because it is evaluated.
 */
/**
 * Mutually exclusive, in the same order as the palette legend, so every question
 * appears in exactly one column and the row reconciles to the total.
 *
 * An earlier version folded "answered & marked" into both Answered and Marked,
 * which made a 5-question section read as 3 + 1 + 0 — a candidate checking their
 * work would not be able to account for the missing question.
 */
const COLUMNS = [
  ["Questions", (t, total) => total, "text-gray-900"],
  ["Answered", (t) => t.answered, "text-status-answered"],
  ["Not Answered", (t) => t.notAnswered, "text-status-unanswered"],
  ["Marked", (t) => t.marked, "text-status-marked"],
  ["Answered & Marked", (t) => t.answeredMarked, "text-status-marked"],
  ["Not Visited", (t) => t.notVisited, "text-gray-500"],
];

const SubmitSummary = ({ sections, counts, questionCount, timeLeftLabel, error, busy, onCancel, onConfirm }) => {
  const answered = counts.answered + counts.answeredMarked;
  const remaining = questionCount - answered;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-chrome/70 p-4 backdrop-blur-sm">
      {/* Six columns need the room — at 2xl the headers collided into each other. */}
      <div className="w-full max-w-3xl overflow-hidden rounded-exam bg-white shadow-2xl">

        <header className="border-b border-gray-200 px-8 py-6">
          <h2 className="text-xl font-semibold text-gray-900">Submit your exam?</h2>
          <p className="mt-1 text-sm text-gray-500">
            Review your progress below. Once submitted, you cannot return to the paper.
          </p>
        </header>

        <div className="max-h-[46vh] overflow-x-auto overflow-y-auto px-8 py-6">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 align-bottom">
                <th className="pb-3 pr-6 text-left exam-label">Section</th>
                {COLUMNS.map(([label]) => (
                  <th key={label} className="whitespace-pre-line pb-3 pl-4 text-right exam-label">
                    {label.replace(" & ", "\n& ").replace("Not ", "Not\n")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sections.map((section) => (
                <tr key={`${section.name}-${section.startIndex}`}>
                  <td className="py-3 pr-6 font-medium text-gray-900">{section.name}</td>
                  {COLUMNS.map(([label, get, tone]) => (
                    <td key={label} className={`py-3 pl-4 text-right font-semibold tabular ${tone}`}>
                      {get(section.tally, section.total)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td className="pt-3 pr-6 font-semibold text-gray-900">Total</td>
                {COLUMNS.map(([label, get, tone]) => (
                  <td key={label} className={`pt-3 pl-4 text-right font-bold tabular ${tone}`}>
                    {get(counts, questionCount)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>

          {remaining > 0 && (
            <div className="mt-6 flex items-start gap-3 rounded-exam border border-amber-200 bg-amber-50 px-4 py-3">
              <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">
                <span className="font-semibold">
                  {remaining} question{remaining === 1 ? "" : "s"} left unanswered.
                </span>{" "}
                {timeLeftLabel && <>You still have {timeLeftLabel} remaining.</>}
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm font-medium text-status-unanswered">{error}</p>
          )}
        </div>

        <footer className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-8 py-5">
          <button onClick={onCancel} disabled={busy} className="exam-action-quiet px-6">
            Return to paper
          </button>
          <button onClick={onConfirm} disabled={busy} className="exam-action px-6 bg-status-unanswered border-status-unanswered text-white hover:opacity-90">
            {busy ? "Submitting…" : "Submit exam"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SubmitSummary;
