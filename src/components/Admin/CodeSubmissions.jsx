import React, { useEffect, useState } from "react";
import { FiCode, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { api } from "../../lib/api";

/**
 * The programs candidates actually submitted.
 *
 * A score on its own is not reviewable. "Why did I get four marks" has no
 * answer without the code that earned them, an appeal cannot be judged on a
 * number, and a member of staff who suspects two candidates handed in the same
 * solution has nothing to compare. Every submission has been stored since the
 * coding round was built; until now nothing could read it back.
 *
 * Collapsed by default. A hall of five hundred candidates is five hundred
 * programs, and a page that renders them all at once is a page nobody opens
 * twice.
 */
const CodeSubmissions = ({ examId }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState({});

  useEffect(() => {
    if (!examId) return;
    api.get(`/admin/coding/exam/${examId}/submissions`)
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => { setRows([]); setError(e.message || "Could not load the submissions."); });
  }, [examId]);

  if (rows === null) {
    return <p className="px-5 py-4 text-sm text-gray-500">Loading submissions…</p>;
  }

  // Nothing to show on a paper with no coding questions, which is most of them.
  if (!rows.length && !error) return null;

  // Grouped by question, because staff review one problem across the cohort
  // rather than one candidate across the paper.
  const byQuestion = rows.reduce((acc, r) => {
    (acc[r.questionId] = acc[r.questionId] || { text: r.questionText, subs: [] }).subs.push(r);
    return acc;
  }, {});

  return (
    <div className="mt-6 overflow-hidden rounded-exam border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900">
          <FiCode /> Code submissions
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          What each candidate actually handed in, with the marks it earned.
        </p>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-900">{error}</p>
      )}

      {Object.entries(byQuestion).map(([qid, group]) => (
        <div key={qid} className="border-b border-gray-100 last:border-b-0">
          <p className="bg-gray-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {(group.text || `Question ${qid}`).slice(0, 90)}
            {group.text && group.text.length > 90 ? "…" : ""}
            <span className="ml-2 font-normal normal-case text-gray-400">
              {group.subs.length} submission{group.subs.length === 1 ? "" : "s"}
            </span>
          </p>

          {group.subs.map((r, i) => {
            const key = `${qid}-${r.hallTicket}-${i}`;
            const isOpen = !!open[key];
            const full = r.testsTotal > 0 && r.testsPassed === r.testsTotal;
            return (
              <div key={key} className="border-t border-gray-50">
                <button
                  onClick={() => setOpen((p) => ({ ...p, [key]: !p[key] }))}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-gray-50"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {isOpen ? <FiChevronDown className="shrink-0 text-gray-400" />
                            : <FiChevronRight className="shrink-0 text-gray-400" />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {r.hallTicket} <span className="font-normal text-gray-500">· {r.candidate}</span>
                      </span>
                      <span className="text-xs text-gray-400">{r.language || "—"}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-4 text-sm tabular">
                    <span className={full ? "text-status-answered" : "text-status-unanswered"}>
                      {r.testsPassed ?? 0}/{r.testsTotal ?? 0}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {r.awardedMarks == null ? "—" : r.awardedMarks}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-4">
                    {r.judgeMessage && (
                      <p className="mb-2 text-xs text-gray-500">{r.judgeMessage}</p>
                    )}
                    <pre className="overflow-x-auto rounded-exam bg-chrome p-4 font-mono text-[12px] leading-relaxed text-gray-100">
{r.sourceCode}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default CodeSubmissions;
