import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiAlertCircle } from "react-icons/fi";
import { useExam } from "../../contexts/ExamContext";
import { examApi, api, uploadUrl } from "../../lib/api";
import StatusLegend from "../../components/Exam/StatusLegend";

const initialsOf = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "—";

const RULES = [
  "The timer runs on our server. Closing the browser, losing power or losing your connection does not stop it.",
  "Your answers are saved the moment you choose them — there is no separate save step.",
  "The paper must be taken in fullscreen. Leaving fullscreen, switching tabs or opening another application is recorded.",
  "Three violations will submit your exam automatically.",
  "You may revisit and change any answer until you submit.",
  "Once you submit, the paper closes and cannot be reopened.",
];

const Instructions = () => {
  const navigate = useNavigate();
  const { beginAttempt } = useExam();

  const [exam, setExam] = useState(null);
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [showVideo, setShowVideo] = useState(false);

  const candidateName = localStorage.getItem("studentName") || "Candidate";
  const hallTicket = localStorage.getItem("hallTicket") || "";

  useEffect(() => {
    const examId = localStorage.getItem("student_examId");
    if (!examId) {
      navigate("/verify", { replace: true });
      return;
    }

    Promise.all([
      examApi.examInfo(examId),
      // The briefing is still useful without the structure, so a failure here
      // must not block a candidate from starting.
      api.get(`/student/exam-structure/${examId}`).catch(() => null),
    ])
      .then(([info, shape]) => { setExam({ id: examId, ...info }); setStructure(shape); })
      .catch((e) => setError(e.message || "Could not load the exam details."))
      .finally(() => setLoading(false));
  }, [navigate]);

  const startExam = async () => {
    if (starting) return;
    setStarting(true);
    setError("");

    try {
      const data = await examApi.start(Number(localStorage.getItem("studentId")), Number(exam.id));
      beginAttempt(data.attemptId);
      navigate("/exam", { replace: true });
    } catch (e) {
      setShowVideo(false);
      setError(e.message || "Could not start the exam. Contact your invigilator.");
      setStarting(false);
    }
  };

  const handleBegin = () => {
    if (!exam) return;
    if (exam.introVideo) setShowVideo(true);
    else startExam();
  };

  if (loading) {
    return (
      <div className="grid h-screen place-items-center text-sm font-medium text-gray-500">
        Loading your exam details…
      </div>
    );
  }

  const marking =
    structure?.marksPerQuestion != null
      ? `+${structure.marksPerQuestion}${structure.negativePerQuestion ? ` / −${structure.negativePerQuestion}` : ""}`
      : "Varies by question";

  return (
    <div className="min-h-screen bg-gray-50" onContextMenu={(e) => e.preventDefault()}>

      {showVideo && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-chrome">
          <video
            src={uploadUrl(exam.introVideo)}
            autoPlay
            onEnded={() => { setShowVideo(false); startExam(); }}
            // A missing or unplayable video must never trap the candidate.
            onError={() => { setShowVideo(false); startExam(); }}
            className="w-[80%] rounded-exam shadow-2xl"
          />
          <p className="mt-4 text-sm text-gray-400">Please watch this briefing before starting.</p>
        </div>
      )}

      <header className="flex h-14 items-center gap-3 bg-chrome px-6">
        {exam?.collegeLogo && (
          <img
            src={uploadUrl(exam.collegeLogo)}
            alt=""
            className="h-8 w-8 rounded bg-white/95 object-contain p-0.5"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold leading-tight text-white">
            {exam?.title || "Examination"}
          </h1>
          <p className="truncate text-[11px] leading-tight text-gray-400">{exam?.collegeName}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">

        {/* Candidate */}
        <section className="mb-8 flex items-center gap-4 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-exam bg-chrome text-sm font-semibold text-white">
            {initialsOf(candidateName)}
          </div>
          <div className="min-w-0">
            <p className="exam-label">Candidate</p>
            <p className="truncate text-lg font-semibold leading-tight text-gray-900">{candidateName}</p>
            <p className="text-sm text-gray-500 tabular">{hallTicket}</p>
          </div>
        </section>

        {/* Paper at a glance */}
        <section className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-exam border border-gray-200 bg-gray-200 sm:grid-cols-4">
          {[
            ["Duration", exam?.duration ? `${exam.duration} min` : "—"],
            ["Questions", structure?.totalQuestions ?? "—"],
            ["Total marks", structure?.totalMarks ?? "—"],
            ["Marking", marking],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-4">
              <p className="exam-label">{label}</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 tabular">{value}</p>
            </div>
          ))}
        </section>

        {/* Structure */}
        {structure?.sections?.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-exam border border-gray-200 bg-white">
            <h2 className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">
              Paper structure
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left exam-label">Section</th>
                  <th className="px-6 py-3 text-right exam-label">Questions</th>
                  <th className="px-6 py-3 text-right exam-label">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {structure.sections.map((s) => (
                  <tr key={s.name}>
                    <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-3 text-right tabular text-gray-700">{s.questionCount}</td>
                    <td className="px-6 py-3 text-right tabular text-gray-700">{s.marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* The legend, taught before the paper rather than discovered during it. */}
        <section className="mb-8 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Reading the question palette
          </h2>
          <StatusLegend describe />
        </section>

        {/* Rules */}
        <section className="mb-8 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Before you begin</h2>
          <ol className="space-y-3">
            {RULES.map((rule, i) => (
              <li key={rule} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                <span className="shrink-0 font-semibold tabular text-gray-400">{i + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-exam border border-red-200 bg-red-50 px-5 py-4">
            <FiAlertCircle className="mt-0.5 shrink-0 text-status-unanswered" />
            <p className="text-sm font-medium text-red-900">{error}</p>
          </div>
        )}

        {/* Commit */}
        <section className="flex flex-col gap-5 rounded-exam bg-chrome px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-500 bg-transparent text-primary-500"
            />
            <span className="text-sm leading-snug text-gray-300">
              I confirm I am {candidateName} and I have read the instructions above.
            </span>
          </label>

          <button
            onClick={handleBegin}
            disabled={!agreed || starting || !exam}
            className="shrink-0 rounded-exam bg-white px-8 py-3 text-sm font-semibold text-chrome
                       transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {starting ? "Starting…" : <>Begin exam <FiArrowRight className="ml-1 inline" /></>}
          </button>
        </section>

        <p className="mt-4 text-center text-xs text-gray-400">
          Your time starts the moment you begin.
        </p>
      </main>
    </div>
  );
};

export default Instructions;
