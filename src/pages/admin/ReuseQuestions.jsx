import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import ExamPicker from "../../components/Admin/ExamPicker";
import { api, uploadUrl } from "../../lib/api";
import {
  FiArrowLeft, FiCheck, FiAlertTriangle, FiInbox, FiCopy, FiChevronRight,
} from "react-icons/fi";

/**
 * Building this year's paper out of previous ones.
 *
 * Questions are COPIED, never shared. The new exam gets rows of its own, so
 * pulling a question in and then deciding against it cannot reach back and
 * alter a paper that has already been sat — an old exam's results have to stay
 * exactly as they were marked.
 */
export default function ReuseQuestions() {
  const navigate = useNavigate();
  const examId = localStorage.getItem("examId");

  const [exams, setExams] = useState(null);
  const [openExam, setOpenExam] = useState(null);   // the paper being browsed
  const [questions, setQuestions] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        setExams(await api.get(`/admin/question/library?excludeExamId=${examId}`));
      } catch (e) {
        setNotice({ tone: "error", text: e.message || "Could not load your earlier exams." });
        setExams([]);
      }
    })();
  }, [examId]);

  const browse = async (exam) => {
    setOpenExam(exam);
    setLoading(true);
    setPicked(new Set());
    try {
      const list = await api.get(`/admin/question/${exam.examId}`);
      setQuestions(Array.isArray(list) ? list : []);
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "Could not load that paper." });
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const allPicked = questions.length > 0 && picked.size === questions.length;
  const toggleAll = () =>
    setPicked(allPicked ? new Set() : new Set(questions.map((q) => q.id)));

  const copy = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const report = await api.post("/admin/question/copy", {
        targetExamId: Number(examId),
        questionIds: [...picked],
      });
      setNotice({
        tone: report.errors?.length ? "warn" : "ok",
        text: report.summary,
        lines: (report.errors || []).slice(0, 10).map((e) => e.reason),
      });
      setPicked(new Set());
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "Those questions could not be copied." });
    } finally {
      setBusy(false);
    }
  };

  const tone = {
    ok: "border-green-200 bg-green-50 text-green-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
  };

  const preview = (q) =>
    (q.questionText || "").trim() || (q.questionImage ? "(picture question)" : "(no text)");

  if (!examId) {
    return (
      <Layout title="Reuse questions" subtitle="Build this paper from earlier ones">
        <ExamPicker what="Reusing questions" />
      </Layout>
    );
  }

  return (
    <Layout title="Reuse questions" subtitle="Build this paper from earlier ones">
      {notice && (
        <div className={`mb-5 flex items-start gap-2 rounded-exam border px-5 py-4 text-sm ${tone[notice.tone]}`}>
          {notice.tone === "ok" ? <FiCheck className="mt-0.5 shrink-0" />
                                : <FiAlertTriangle className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold">{notice.text}</p>
            {notice.lines?.map((l, i) => <p key={i} className="mt-0.5 text-xs">{l}</p>)}
            {notice.tone === "ok" && (
              <button onClick={() => navigate("/admin/questions")}
                      className="mt-3 text-sm font-semibold underline">
                Back to the question bank
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Choosing which earlier paper to take from ──────────────────── */}
      {!openExam && (
        exams === null ? (
          <div className="rounded-exam border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            Loading your earlier exams…
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-exam border border-gray-200 bg-white p-10 text-center">
            <FiInbox className="mx-auto mb-3 text-3xl text-gray-300" />
            <p className="font-semibold text-gray-900">No earlier exams to reuse from yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
              Once you have built a paper, its questions can be pulled into later exams from here.
            </p>
            <button onClick={() => navigate("/admin/questions")} className="exam-action-quiet mx-auto mt-5">
              Back to the question bank
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-exam border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-5">
              <p className="font-semibold text-gray-900">Which exam do you want to take questions from?</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Questions are copied, so anything you pull in can be edited or removed here without
                touching the exam it came from.
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {exams.map((e) => (
                <li key={e.examId}>
                  <button onClick={() => browse(e)}
                          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-gray-900">{e.examTitle}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {e.questionCount} question{e.questionCount === 1 ? "" : "s"}
                        {e.published ? " · published" : " · not published"}
                        {e.startDate ? ` · ${String(e.startDate).replace("T", " ").slice(0, 10)}` : ""}
                      </span>
                    </span>
                    <FiChevronRight className="shrink-0 text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* ── Picking questions out of it ────────────────────────────────── */}
      {openExam && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-exam border border-gray-200 bg-white px-5 py-4">
            <div className="min-w-0">
              <button onClick={() => { setOpenExam(null); setQuestions([]); setPicked(new Set()); }}
                      className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline">
                <FiArrowLeft /> All exams
              </button>
              <p className="truncate font-semibold text-gray-900">{openExam.examTitle}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {picked.size} of {questions.length} selected
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleAll} disabled={questions.length === 0} className="exam-action-quiet">
                {allPicked ? "Clear selection" : "Select all"}
              </button>
              <button onClick={copy} disabled={busy || picked.size === 0} className="exam-action-primary flex items-center gap-2">
                <FiCopy /> {busy ? "Copying…" : `Copy ${picked.size} into this exam`}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-exam border border-gray-200 bg-white">
            {loading ? (
              <div className="p-10 text-center text-sm text-gray-500">Loading that paper…</div>
            ) : questions.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">That exam has no questions.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {questions.map((q, i) => (
                  <li key={q.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={picked.has(q.id)}
                        onChange={() => toggle(q.id)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-900">
                          <span className="mr-2 text-gray-400">{i + 1}.</span>
                          {preview(q)}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {/* A coding question has no A/B/C/D to name, and
                              printing "Answer" with a blank after it reads as
                              a question missing its key rather than one that
                              never had one. */}
                          {q.type === "CODING" ? (
                            <span className="mr-1 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                              Coding
                            </span>
                          ) : (
                            <>Answer {q.correctAnswer} · </>
                          )}
                          {q.marks ?? 1} mark{(q.marks ?? 1) === 1 ? "" : "s"}
                          {q.type !== "CODING" && q.negativeMarks ? ` · −${q.negativeMarks} wrong` : ""}
                          {q.type === "CODING" ? " · test cases copy with it" : ""}
                        </span>
                      </span>
                      {q.questionImage && (
                        <img src={uploadUrl(q.questionImage)} alt=""
                             className="h-10 w-16 shrink-0 rounded border border-gray-200 object-contain" />
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
