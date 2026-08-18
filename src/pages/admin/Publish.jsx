import React, { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout/Layout";
import { api } from "../../lib/api";
import { FiCheckCircle, FiAlertTriangle, FiCopy, FiLink, FiLock, FiUnlock } from "react-icons/fi";
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
  const examId = localStorage.getItem("examId");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
              ["Questions", status.questionCount],
              ["Sections", status.sectionCount],
              ["Total marks", status.totalMarks],
              ["Candidates", status.candidateCount],
              ["Papers ready", status.preparedPapers],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-5 py-4">
                <p className="exam-label">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular text-gray-900">{value}</p>
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
