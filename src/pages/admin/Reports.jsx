import React, { useState, useEffect, useMemo } from "react";
import Layout from "../../components/Layout/Layout";
import { api } from "../../lib/api";
import CodeSubmissions from "../../components/Admin/CodeSubmissions";
import { FiDownload, FiInbox, FiSearch, FiEye, FiEyeOff, FiAlertTriangle } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";
import * as XLSX from "xlsx";

/**
 * One row per candidate, as staff hand results on: who they are, which
 * branch and year, which exam, the marks and the percentage. The same table
 * goes to both Excel and CSV so the two never disagree.
 *
 * Branch and Year only appear when somebody in the exam has one. An entrance
 * test sat by outside candidates (KGCET) has neither, and two empty columns
 * in every row read as missing data rather than as not applying.
 */
const ALL_COLUMNS = [
  { title: "Rank",         width: 6,  value: (c) => (c.submitted ? c.rank : "") },
  { title: "Hall Ticket",  width: 16, value: (c) => c.hallTicket ?? "" },
  { title: "Name",         width: 28, value: (c) => c.name ?? "" },
  { title: "Branch",       width: 12, value: (c) => c.branch ?? "", optional: "branch" },
  { title: "Year",         width: 8,  value: (c) => c.year ?? "", optional: "year" },
  { title: "Exam",         width: 28, value: (c, d) => d.examTitle ?? "" },
  { title: "Marks",        width: 8,  value: (c) => (c.submitted ? c.score : "") },
  { title: "Out Of",       width: 8,  value: (c, d) => d.totalMarks ?? "" },
  { title: "Percentage",   width: 11, value: (c) => (c.submitted && c.percentage != null ? c.percentage : "") },
  { title: "Status",       width: 22, value: (c) => (c.submitted ? "Submitted" : "Absent / not submitted") },
  { title: "Submitted At", width: 22, value: (c) => (c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "") },
];

/** Whether anyone in this exam has a value for `key` ("branch", "year"). */
const anyoneHas = (data, key) => (data?.candidates ?? []).some((c) => String(c[key] ?? "").trim());

const resultColumns = (data) => ALL_COLUMNS.filter((col) => !col.optional || anyoneHas(data, col.optional));

const resultTable = (data) => {
  const cols = resultColumns(data);
  return {
    cols,
    rows: [cols.map((c) => c.title), ...(data?.candidates ?? []).map((c) => cols.map((col) => col.value(c, data)))],
  };
};

/** A file name from the exam's title: "Mech Mock 1 - results". */
const fileBase = (data, examId) =>
  `${(data?.examTitle || `exam-${examId}`).replace(/[\\/:*?"<>|]+/g, " ").trim()} - results`;

/**
 * Results for a finished exam.
 *
 * The reporting counterpart to Live Monitor: Monitor is "what is happening now",
 * this is "how did the cohort do". A ranked table plus the headline numbers that
 * turn a pile of raw scores into something staff can hand back and act on.
 *
 * This file was previously a stale copy of an old QuestionManagement — it pulled
 * addQuestion/deleteQuestion from the exam context, which no longer exist, so the
 * page was the wrong UI and its buttons would have crashed on click.
 */

const Reports = () => {
  // Which exam's results are on screen. Separate from the exam being built,
  // so looking back at last year's results does not change what "Questions"
  // or "Add Candidates" would open next.
  const [viewing, setViewing] = useState(() => localStorage.getItem("examId"));
  const examId = viewing;
  const [allExams, setAllExams] = useState(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState("");

  useEffect(() => {
    if (!examId) { setLoading(false); return; }
    let live = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const report = await api.get(`/admin/report/${examId}`);
        if (live) setData(report);
      } catch (e) {
        if (live) setError(e.message || "Could not load the results for this exam.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [examId]);

  // Every exam this college has run, so a past paper can be opened directly
  // instead of only whichever one happens to be current.
  useEffect(() => {
    (async () => {
      try {
        const list = await api.get("/admin/report");
        setAllExams(Array.isArray(list) ? list : []);
        // Nothing open yet? Show the most recent exam rather than an empty page.
        setViewing((current) => current || (list[0] ? String(list[0].examId) : null));
      } catch {
        setAllExams([]);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    const list = data?.candidates ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (c) => c.name?.toLowerCase().includes(needle) || c.hallTicket?.toLowerCase().includes(needle)
    );
  }, [data, query]);

  // Built from data already in hand — no separate endpoint, and it exports the
  // real results (rank, marks, percentage), not the roster.
  // An entrance test with only outside candidates has no branch or year.
  const showBranchYear = anyoneHas(data, "branch") || anyoneHas(data, "year");

  const exportCsv = () => {
    const escape = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = resultTable(data).rows.map((r) => r.map(escape).join(",")).join("\r\n");
    // The byte-order mark is what makes Excel read the file as UTF-8. Without
    // it, a name in Telugu opens as a row of question marks.
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase(data, examId)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const { cols, rows: table } = resultTable(data);
    const sheet = XLSX.utils.aoa_to_sheet(table);
    sheet["!cols"] = cols.map((c) => ({ wch: c.width }));
    // Keeps the heading row in view while scrolling a long class list.
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Results");
    XLSX.writeFile(book, `${fileBase(data, examId)}.xlsx`);
  };

  if (!examId) {
    return (
      <Layout title="Results" subtitle="How the cohort did">
        <ExamPicker what="Results" />
      </Layout>
    );
  }

  const summary = [
    ["Candidates", data?.totalCandidates ?? "—"],
    ["Submitted", data?.submittedCount ?? "—"],
    ["Not submitted", data?.notSubmittedCount ?? "—"],
    ["Average score", data?.averageScore ?? "—"],
    ["Top score", data?.topScore ?? "—"],
  ];

  /**
   * Announcing results, or withdrawing them again.
   *
   * Scores are held from candidates until this is pressed. Staff have seen
   * every mark on this page throughout — the hold exists so a college can
   * moderate before it announces, not to keep anything from the people
   * running the exam.
   */
  const setReleased = async (release) => {
    if (!examId) return;
    if (!release && !window.confirm(
      "Withdraw the results?\n\nCandidates who have already seen their scorecard "
      + "will stop being able to open it."
    )) return;

    setReleasing(true);
    setReleaseError("");
    try {
      const state = await api.post(
        `/admin/exam/${examId}/${release ? "release-results" : "hold-results"}`, {});
      setData((d) => (d ? { ...d, resultsReleased: state.resultsReleased } : d));
      setAllExams((list) => (list || []).map((e) =>
        String(e.examId) === String(examId)
          ? { ...e, resultsReleased: state.resultsReleased } : e));
    } catch (e) {
      setReleaseError(e.message || "Could not change whether results are out.");
    } finally {
      setReleasing(false);
    }
  };

  const released = data?.resultsReleased === true;

  return (
    <Layout title="Results" subtitle={data?.examTitle || "How the cohort did"}>

      {data && (
        <div className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-exam border px-5 py-4
                         ${released ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 text-lg ${released ? "text-green-700" : "text-amber-700"}`}>
              {released ? <FiEye /> : <FiEyeOff />}
            </span>
            <div>
              <p className={`text-sm font-semibold ${released ? "text-green-900" : "text-amber-900"}`}>
                {released ? "Results are out" : "Results are held"}
              </p>
              <p className={`mt-0.5 text-xs ${released ? "text-green-800" : "text-amber-800"}`}>
                {released
                  ? "Candidates can open their own scorecard. Everything on this page stays visible to staff either way."
                  : "Candidates are told their paper was received, and nothing more. Release them once the marks are settled."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReleased(!released)}
            disabled={releasing}
            className={released ? "exam-action-quiet" : "exam-action-primary"}
          >
            {releasing ? "Working…" : released ? "Withdraw results" : "Release results"}
          </button>
        </div>
      )}

      {releaseError && (
        <div className="mb-5 flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          <FiAlertTriangle className="mt-0.5 shrink-0" /> {releaseError}
        </div>
      )}

      {/* Which exam's results these are, and every other exam to hand.
          The screen could previously only ever show whichever exam happened to
          be open, so a past paper was unreachable without rebuilding it. */}
      {allExams && allExams.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-exam border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">Exams</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Choose one to see its results. Looking back here does not change the exam you are building.
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {allExams.map((e) => {
                  const open = String(e.examId) === String(viewing);
                  return (
                    <tr
                      key={e.examId}
                      onClick={() => setViewing(String(e.examId))}
                      className={`cursor-pointer ${open ? "bg-primary-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-5 py-2.5">
                        <span className={`block truncate font-semibold ${open ? "text-primary-800" : "text-gray-900"}`}>
                          {e.examTitle}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {e.startDate ? String(e.startDate).replace("T", " ").slice(0, 16) : "no date"}
                          {e.published ? "" : " · not published"}
                          {e.published && !e.resultsReleased ? " · results held" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {e.submittedCount}/{e.totalCandidates} sat
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {e.averageScore == null ? "—" : `avg ${e.averageScore}`}
                      </td>
                      <td className="px-5 py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {e.topScore == null ? "—" : `top ${e.topScore}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-exam border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          Loading results…
        </div>
      ) : error ? (
        <div className="rounded-exam border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          {error}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-exam border border-gray-200 bg-gray-200 sm:grid-cols-5">
            {summary.map(([label, value]) => (
              <div key={label} className="bg-white px-5 py-4">
                <p className="exam-label">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 tabular">{value}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or hall ticket…"
                className="h-11 w-72 rounded-exam border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportExcel}
                disabled={!data?.candidates?.length}
                className="exam-action-primary flex h-11 items-center gap-2"
              >
                <FiDownload /> Download Excel
              </button>
              <button
                onClick={exportCsv}
                disabled={!data?.candidates?.length}
                className="exam-action-quiet flex h-11 items-center gap-2"
              >
                <FiDownload /> CSV
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-exam border border-gray-200 bg-white">
            {rows.length === 0 ? (
              <div className="p-12 text-center">
                <FiInbox className="mx-auto mb-3 text-3xl text-gray-300" />
                <p className="font-semibold text-gray-900">
                  {data?.candidates?.length ? "Nothing matches that search." : "No candidates yet."}
                </p>
                {!data?.candidates?.length && (
                  <p className="mt-1 text-sm text-gray-500">
                    Results appear here once candidates have submitted.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="exam-label px-5 py-3 text-right">Rank</th>
                      <th className="exam-label px-5 py-3">Hall ticket</th>
                      <th className="exam-label px-5 py-3">Candidate</th>
                      {showBranchYear && <th className="exam-label px-5 py-3">Branch / Year</th>}
                      <th className="exam-label px-5 py-3 text-right">Marks</th>
                      <th className="exam-label px-5 py-3 text-right">%</th>
                      <th className="exam-label px-5 py-3">Status</th>
                      <th className="exam-label px-5 py-3">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((c) => (
                      <tr key={c.hallTicket} className="transition-colors hover:bg-gray-50">
                        <td className="tabular px-5 py-3 text-right font-semibold text-gray-900">
                          {c.submitted ? c.rank : "—"}
                        </td>
                        <td className="tabular px-5 py-3 text-gray-700">{c.hallTicket}</td>
                        <td className="px-5 py-3 text-gray-900">{c.name}</td>
                        {showBranchYear && (
                          <td className="px-5 py-3 text-sm text-gray-600">
                            {[c.branch, c.year].filter(Boolean).join(" · ") || "—"}
                          </td>
                        )}
                        <td className="tabular px-5 py-3 text-right text-gray-900">
                          {c.submitted ? `${c.score}${data?.totalMarks ? ` / ${data.totalMarks}` : ""}` : "—"}
                        </td>
                        <td className="tabular px-5 py-3 text-right text-gray-900">
                          {c.submitted && c.percentage != null ? `${c.percentage}%` : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-exam px-2 py-1 text-xs font-semibold ${
                            c.submitted
                              ? "bg-status-answeredSoft text-status-answered"
                              : "bg-status-unseenSoft text-status-unseen"
                          }`}>
                            {c.submitted ? "Submitted" : "Not submitted"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500">
                          {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Renders nothing on a paper with no coding questions, which is
              most of them. */}
          <CodeSubmissions examId={examId} />
        </>
      )}
    </Layout>
  );
};

export default Reports;
