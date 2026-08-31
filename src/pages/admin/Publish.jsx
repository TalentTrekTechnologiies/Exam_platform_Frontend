import React, { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout/Layout";
import { api } from "../../lib/api";
import { FiCheckCircle, FiAlertTriangle, FiCopy, FiLink, FiLock, FiUnlock, FiFileText } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";

/**
 * Publishing an exam and sharing it with candidates.
 *
 * Publishing is a deliberate act, separate from creating: an exam is built over
 * days, and during all of that it must not be sittable. This screen shows
 * exactly what still stands in the way, and produces the one link an exam
 * officer hands out.
 */
const Publish = () => {
  // Publishing is the one irreversible-feeling act in the console, and the
  // screen never said which exam it was about to open. With two being built
  // at once that is a paper released before it is finished.
  const [examId, setExamId] = useState(() => localStorage.getItem("examId") || "");
  const [exams, setExams] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareResult, setPrepareResult] = useState("");

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      setStatus(await api.get(`/admin/exam/${examId}/publication`));
      setError("");
    } catch (e) {
      setError(e.message || "Could not load the exam.");
    }
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/admin/exam")
      .then((list) => setExams(Array.isArray(list) ? list : []))
      .catch(() => setExams([]));
  }, []);

  const switchExam = (id) => {
    if (!id || id === examId) return;
    localStorage.setItem("examId", id);
    setExamId(id);
    setStatus(null);
    setError("");
    setPrepareResult("");
  };

  /**
   * The action the readiness warning asks for, on the screen that asks for it.
   *
   * The warning said "Run Prepare Papers" and there was no way to do so from
   * here — it lives on the live monitor, which is not where anybody is
   * standing the night before an exam.
   */
  const preparePapers = async () => {
    if (preparing) return;
    setPreparing(true);
    setPrepareResult("");
    setError("");
    try {
      const r = await api.post(`/admin/exam/${examId}/prepare`, {});
      setPrepareResult(r.summary || "Papers prepared.");
      load();
    } catch (e) {
      setError(e.message || "Could not prepare papers.");
    } finally {
      setPreparing(false);
    }
  };

  const act = async (path) => {
    setBusy(true); setError("");
    try {
      setStatus(await api.post(`/admin/exam/${examId}/${path}`, {}));
    } catch (e) {
      setError(e.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(status.candidateLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the link and copy it manually.");
    }
  };

  if (!examId) {
    return (
      <Layout title="Publish Exam" subtitle="Open this exam to candidates and share the link">
        <ExamPicker what="Publishing" />
      </Layout>
    );
  }

  const ready = status && status.blockers?.length === 0;

  return (
    <Layout title="Publish Exam" subtitle="Open this exam to candidates and share the link">
      <div className="mb-5 min-w-0">
        <p className="exam-label mb-1">You are publishing</p>
        {exams.length > 1 ? (
          <select
            value={examId}
            onChange={(e) => switchExam(e.target.value)}
            aria-label="Which exam to publish"
            className="max-w-full rounded-exam border border-gray-300 bg-white px-3 py-2 text-lg font-semibold
                       text-gray-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
          >
            {!exams.some((e) => String(e.id) === String(examId)) && (
              <option value={examId}>{`Exam #${examId}`}</option>
            )}
            {exams.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.title || `Exam #${e.id}`}{e.published ? " — published" : ""}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="text-lg font-semibold text-gray-900">
            {exams.find((e) => String(e.id) === String(examId))?.title || `Exam #${examId}`}
          </h2>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <FiAlertTriangle className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {status && (
        <>
          <div className={`mb-5 rounded-exam border-t-2 border-x border-b border-gray-200 bg-white px-6 py-5
                           ${status.published ? "border-t-status-answered" : "border-t-gray-300"}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {status.published
                  ? <FiUnlock className="text-2xl text-status-answered" />
                  : <FiLock className="text-2xl text-gray-400" />}
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {status.published ? "Open to candidates" : "Not published"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {status.published
                      ? "Candidates with the link can sit this exam during its slot."
                      : "Nobody can sit this exam yet, whatever their slot says."}
                  </p>
                </div>
              </div>

              {status.published ? (
                <button onClick={() => act("unpublish")} disabled={busy} className="exam-action-quiet">
                  Close exam
                </button>
              ) : (
                <button onClick={() => act("publish")} disabled={busy || !ready} className="exam-action-primary">
                  {busy ? "Publishing…" : "Publish exam"}
                </button>
              )}
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-exam border border-gray-200 bg-gray-200 lg:grid-cols-5">
            {[
              // Counts describe the paper a candidate sits. Where questions are
              // drawn from a larger bank, the bank is named underneath rather
              // than left to look like questions that went missing.
              ["Questions", status.questionCount,
                status.questionBank > 0 ? `drawn from ${status.questionBank}` : null],
              ["Sections", status.sectionCount, null],
              ["Total marks", status.totalMarks, null],
              ["Candidates", status.candidateCount, null],
              ["Papers ready", status.preparedPapers, null],
            ].map(([label, value, hint]) => (
              <div key={label} className="bg-white px-5 py-4">
                <p className="exam-label">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular text-gray-900">{value}</p>
                {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
              </div>
            ))}
          </div>

          {status.blockers?.length > 0 && (
            <div className="mb-4 rounded-exam border border-red-200 bg-red-50 px-5 py-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900">
                <FiAlertTriangle /> Cannot publish yet
              </p>
              <ul className="space-y-1 text-sm text-red-900">
                {status.blockers.map((b) => <li key={b}>· {b}</li>)}
              </ul>
            </div>
          )}

          {status.warnings?.length > 0 && (
            <div className="mb-4 rounded-exam border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="mb-2 text-sm font-semibold text-amber-900">Worth checking</p>
              <ul className="space-y-1 text-sm text-amber-900">
                {status.warnings.map((w) => <li key={w}>· {w}</li>)}
              </ul>

              {status.candidateCount > 0 && status.preparedPapers < status.candidateCount && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-amber-200 pt-4">
                  <button
                    onClick={preparePapers}
                    disabled={preparing}
                    className="exam-action-primary flex items-center gap-2"
                  >
                    <FiFileText />
                    {preparing ? "Preparing…" : "Prepare papers now"}
                  </button>
                  <span className="text-xs text-amber-900">
                    Safe to re-run — papers already built are left alone, so late enrolments just get added.
                  </span>
                </div>
              )}
            </div>
          )}

          {prepareResult && (
            <div className="mb-4 rounded-exam border border-gray-200 bg-white px-5 py-4 text-sm text-gray-700">
              {prepareResult}
            </div>
          )}

          {status.published && status.candidateLink && (
            <div className="rounded-exam border border-gray-200 bg-white px-6 py-5">
              <p className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
                <FiLink /> Share this with candidates
              </p>
              <p className="mb-4 text-sm text-gray-500">
                They sign in with their hall ticket and name — nothing else to remember.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-exam bg-gray-50 px-4 py-3 text-sm text-gray-800">
                  {status.candidateLink}
                </code>
                <button onClick={copy} className="exam-action-primary flex items-center gap-2">
                  {copied ? <><FiCheckCircle /> Copied</> : <><FiCopy /> Copy link</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
};

export default Publish;
