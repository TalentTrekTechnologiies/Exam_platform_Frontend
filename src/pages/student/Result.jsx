import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCheckCircle, FiXCircle, FiMinusCircle, FiAlertCircle, FiAward, FiClock, FiHome,
} from "react-icons/fi";
import { examApi, ApiError, clearStudentSession } from "../../lib/api";

/**
 * The scorecard.
 *
 * The last thing every candidate sees, and the only part of a mock exam that
 * has any lasting value — a score alone tells a student nothing they can act on.
 * Rank, percentile and how the cohort fared in each section are what turn this
 * from a verdict into something they can revise from.
 */

const formatDuration = (seconds) => {
  // Only a genuinely absent value is unknown. Zero is a real duration, and
  // rendering it as "—" made a fast submission look like broken data.
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return "under a minute";
};

const ordinal = (n) => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const Stat = ({ label, value, tone = "text-gray-900", hint }) => (
  <div className="bg-white px-5 py-4">
    <p className="exam-label">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
  </div>
);

const Result = () => {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const attemptId = localStorage.getItem("attemptId");
    if (!attemptId) { navigate("/verify", { replace: true }); return; }

    examApi.result(attemptId)
      .then(setResult)
      .catch((e) => {
        if (e instanceof ApiError && e.code === "RESULT_NOT_READY") {
          setError("Your exam is still in progress. Submit it to see your result.");
        } else {
          setError(e.message || "We could not load your result.");
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center text-sm font-medium text-gray-500">
        Calculating your performance…
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <FiAlertCircle className="text-4xl text-amber-500" />
        <h1 className="text-lg font-semibold text-gray-900">Result unavailable</h1>
        <p className="max-w-md text-sm text-gray-500">{error}</p>
        <button onClick={() => { clearStudentSession(); navigate("/verify"); }} className="exam-action-primary px-6">
          Back to start
        </button>
      </div>
    );
  }

  const questions = result.questions || [];
  const visible = questions.filter((q) => {
    if (filter === "correct") return q.correct;
    if (filter === "incorrect") return q.attempted && !q.correct;
    if (filter === "skipped") return !q.attempted;
    return true;
  });

  const optionText = (q, letter) => {
    const option = (q.options || []).find((o) => o.id === letter);
    if (!option) return letter;
    return option.text ? `${letter}. ${option.text}` : letter;
  };

  const FILTERS = [
    ["all", `All (${questions.length})`],
    ["correct", `Correct (${result.correct})`],
    ["incorrect", `Incorrect (${result.incorrect})`],
    ["skipped", `Skipped (${result.unanswered})`],
  ];

  // Rank is withheld by the server until the cohort is big enough to mean
  // anything, so its absence is expected rather than a failure.
  const hasRank = result.rank != null && result.totalRanked > 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-14 items-center justify-between bg-chrome px-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold leading-tight text-white">
            {result.examTitle || "Examination"}
          </h1>
          <p className="truncate text-[11px] leading-tight text-gray-400">
            {result.studentName}{result.hallTicket ? ` · ${result.hallTicket}` : ""}
          </p>
        </div>
        <span className="exam-label text-gray-400">Result</span>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 lg:px-6 lg:py-10">

        {/* Headline. Negative marking means a score can legitimately be below
            zero, so this never clamps it — a candidate must see what happened. */}
        <section className="mb-5 rounded-exam border border-gray-200 bg-white px-6 py-8 text-center">
          <FiAward className="mx-auto mb-3 text-2xl text-primary-600" />
          <div className="text-5xl font-semibold tabular text-gray-900">
            {Number(result.score).toFixed(2)}
            <span className="text-2xl text-gray-300"> / {Number(result.maxScore).toFixed(0)}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {Number(result.percentage).toFixed(1)}% · finished in {formatDuration(result.timeTakenSeconds)}
          </p>

          {hasRank && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t border-gray-100 pt-6">
              <div>
                <p className="text-2xl font-semibold tabular text-gray-900">
                  {ordinal(result.rank)}
                </p>
                <p className="exam-label mt-0.5">of {result.totalRanked} candidates</p>
              </div>
              {result.percentile != null && (
                <div>
                  <p className="text-2xl font-semibold tabular text-primary-700">
                    {result.percentile.toFixed(1)}
                  </p>
                  <p className="exam-label mt-0.5">percentile</p>
                </div>
              )}
              {result.topScore != null && (
                <div>
                  <p className="text-2xl font-semibold tabular text-gray-500">
                    {Number(result.topScore).toFixed(0)}
                  </p>
                  <p className="exam-label mt-0.5">highest score</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-exam border border-gray-200 bg-gray-200 lg:grid-cols-4">
          <Stat label="Correct" value={result.correct} tone="text-status-answered" />
          <Stat label="Incorrect" value={result.incorrect} tone="text-status-unanswered" />
          <Stat label="Skipped" value={result.unanswered} tone="text-gray-400" />
          <Stat
            label="Cohort average"
            value={result.cohortAverage != null ? Number(result.cohortAverage).toFixed(1) : "—"}
            hint={result.cohortAverage != null ? `you scored ${Number(result.score).toFixed(1)}` : undefined}
          />
        </section>

        {result.sections?.length > 0 && (
          <section className="mb-5 rounded-exam border border-gray-200 bg-white px-6 py-5">
            <h2 className="mb-1 font-semibold text-gray-900">Section by section</h2>
            <p className="mb-5 text-sm text-gray-500">
              Where your marks came from, and where they went.
            </p>

            <div className="space-y-5">
              {result.sections.map((s) => {
                const pct = s.maxScore > 0 ? (Math.max(0, s.score) / s.maxScore) * 100 : 0;
                const avgPct = s.cohortAverage != null && s.maxScore > 0
                  ? (Math.max(0, s.cohortAverage) / s.maxScore) * 100 : null;
                const ahead = s.cohortAverage != null && s.score > s.cohortAverage;

                return (
                  <div key={`${s.sectionId}-${s.sectionName}`}>
                    <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-900">{s.sectionName || "General"}</span>
                      <span className="tabular font-semibold text-gray-900">
                        {Number(s.score).toFixed(2)}
                        <span className="text-gray-300"> / {Number(s.maxScore).toFixed(0)}</span>
                      </span>
                    </div>

                    {/* The cohort marker is the point of this bar: a bare score
                        cannot tell a student whether they did well. */}
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
                      {avgPct != null && (
                        <span
                          title={`Cohort average: ${s.cohortAverage}`}
                          className="absolute top-0 h-full w-0.5 bg-chrome"
                          style={{ left: `${Math.min(99.5, avgPct)}%` }}
                        />
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-status-answered">{s.correct} correct</span>
                      <span className="text-status-unanswered">{s.incorrect} incorrect</span>
                      <span className="text-gray-400">{s.unanswered} skipped</span>
                      {s.cohortAverage != null && (
                        <span className={ahead ? "font-medium text-status-answered" : "text-gray-500"}>
                          average {Number(s.cohortAverage).toFixed(1)}
                          {ahead ? " — you were above it" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mb-6 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <h2 className="mb-4 font-semibold text-gray-900">Response sheet</h2>

          <div className="mb-5 flex flex-wrap gap-2">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-exam px-4 py-2 text-xs font-semibold transition-colors ${
                  filter === key ? "bg-primary-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">Nothing in this category.</p>
          )}

          <div className="space-y-3">
            {visible.map((q) => {
              const skipped = !q.attempted;
              const tone = skipped
                ? "border-gray-200 bg-gray-50"
                : q.correct
                  ? "border-status-answered/30 bg-status-answeredSoft/40"
                  : "border-status-unanswered/30 bg-status-unansweredSoft/40";

              return (
                <article key={q.id} className={`rounded-exam border px-5 py-4 ${tone}`}>
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium leading-relaxed text-gray-900">
                      Q{q.displayNumber}. {q.questionText}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-xs font-semibold tabular ${
                        q.awarded > 0 ? "text-status-answered"
                          : q.awarded < 0 ? "text-status-unanswered" : "text-gray-400"}`}>
                        {q.awarded > 0 ? "+" : ""}{Number(q.awarded).toFixed(2)}
                      </span>
                      {skipped ? <FiMinusCircle className="text-gray-400" />
                        : q.correct ? <FiCheckCircle className="text-status-answered" />
                        : <FiXCircle className="text-status-unanswered" />}
                    </div>
                  </div>

                  {q.sectionName && <p className="mt-1 exam-label">{q.sectionName}</p>}

                  <div className="mt-3 space-y-1 text-sm">
                    <p className="text-gray-600">
                      Your answer:{" "}
                      <span className={skipped ? "italic text-gray-400"
                        : q.correct ? "font-semibold text-status-answered" : "font-semibold text-status-unanswered"}>
                        {skipped ? "Not answered" : optionText(q, q.yourAnswer)}
                      </span>
                    </p>
                    {!q.correct && (
                      <p className="font-semibold text-status-answered">
                        Correct answer: {optionText(q, q.correctAnswer)}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="pb-10 text-center">
          <button
            onClick={() => { clearStudentSession(); navigate("/verify", { replace: true }); }}
            className="exam-action-primary inline-flex items-center gap-2 px-8 py-3"
          >
            <FiHome /> Finish
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <FiClock /> Submitted {result.endTime ? new Date(result.endTime).toLocaleString() : ""}
          </p>
        </div>
      </main>
    </div>
  );
};

export default Result;
