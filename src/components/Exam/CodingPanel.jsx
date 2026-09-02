import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiPlay, FiCheckCircle, FiXCircle, FiLoader, FiSave, FiTerminal } from "react-icons/fi";
import { examApi } from "../../lib/api";

/**
 * A coding question, as the candidate sits it.
 *
 * Two panes: the problem on the left, the editor and its console on the right —
 * the shape every candidate already knows from HackerRank, and the shape they
 * judge an exam platform against before they have read a word of the question.
 * The first version put a textarea under the statement and staff called it a
 * notepad, which was fair.
 *
 * Two actions, deliberately not one button:
 *
 *   Run     — compiles against the SAMPLE cases only and shows the output.
 *             Awards nothing, says nothing about standing.
 *   Submit  — marked against every case, hidden ones included, and stored.
 *
 * Marking at submit rather than at the final whistle is a load decision that
 * shows up here as a design one: the candidate sees their case count straight
 * away, so "submitted" means something, and the server never has five thousand
 * programs to compile in the same minute.
 */

// Split out so the editor and its language modes are fetched only when a
// candidate actually opens a coding question — an ordinary paper never
// downloads any of it.
const CodeEditor = lazy(() => import("./CodeEditor"));

const CodingPanel = ({ question, attemptId, savedCode, onSaved, disabled }) => {
  const languages = useMemo(() => question.languages || [], [question.languages]);

  const [language, setLanguage] = useState(
    () => savedCode?.language || languages[0]?.id || "",
  );
  const [source, setSource] = useState(
    () => savedCode?.sourceCode ?? question.starterCode ?? "",
  );
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Moving between questions must not carry the previous one's code or its
  // results across — the panel is reused, so it is reset explicitly.
  useEffect(() => {
    setSource(savedCode?.sourceCode ?? question.starterCode ?? "");
    setLanguage(savedCode?.language || languages[0]?.id || "");
    setResult(null);
    setError("");
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (kind) => {
    if (disabled || running || submitting) return;
    const setBusy = kind === "run" ? setRunning : setSubmitting;
    setBusy(true);
    setError("");
    try {
      const r = kind === "run"
        ? await examApi.runCode(attemptId, question.id, language, source)
        : await examApi.submitCode(attemptId, question.id, language, source);
      setResult({ ...r, kind });
      if (kind === "submit") onSaved?.({ sourceCode: source, language });
    } catch (e) {
      setError(e.message || "That could not be run. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const busy = running || submitting;
  const allPassed = result && result.total > 0 && result.passed === result.total;

  return (
    <div className="grid gap-5 lg:grid-cols-2">

      {/* ── The problem ─────────────────────────────────────────────────── */}
      <section className="min-w-0 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
        <header className="mb-4 flex items-baseline justify-between gap-4 border-b border-gray-200 pb-3">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Question {question.displayNumber}
            <span className="ml-2 rounded bg-primary-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
              Coding
            </span>
          </h2>
          <span className="text-[13px] font-medium tabular text-status-answered">
            +{question.marks}
          </span>
        </header>

        <div className="text-question whitespace-pre-wrap text-gray-900">
          {question.questionText}
        </div>

        {question.constraintsText && (
          <>
            <h3 className="exam-label mb-2 mt-6">Constraints</h3>
            <pre className="overflow-x-auto rounded-exam border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-800">
{question.constraintsText}
            </pre>
          </>
        )}

        {(question.sampleInput || question.sampleOutput) && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <h3 className="exam-label mb-2">Sample input</h3>
              <pre className="overflow-x-auto rounded-exam border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-800">
{question.sampleInput}
              </pre>
            </div>
            <div className="min-w-0">
              <h3 className="exam-label mb-2">Sample output</h3>
              <pre className="overflow-x-auto rounded-exam border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-800">
{question.sampleOutput}
              </pre>
            </div>
          </div>
        )}

        {question.sampleExplanation && (
          <>
            <h3 className="exam-label mb-2 mt-4">Explanation</h3>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
              {question.sampleExplanation}
            </p>
          </>
        )}
      </section>

      {/* ── The editor and its console ──────────────────────────────────── */}
      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h3 className="exam-label">Your solution</h3>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={disabled || busy}
            aria-label="Language"
            className="rounded-exam border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium
                       text-gray-900 focus:border-primary-600 focus:outline-none disabled:opacity-50"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>{l.label || l.id}</option>
            ))}
          </select>
        </div>

        <Suspense fallback={
          <div className="grid h-[420px] place-items-center rounded-exam border border-gray-700 bg-chrome text-sm text-gray-400">
            Loading the editor…
          </div>
        }>
          <CodeEditor
            value={source}
            onChange={setSource}
            language={language}
            disabled={disabled}
          />
        </Suspense>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => act("run")} disabled={disabled || busy}
                  className="exam-action-quiet flex items-center gap-2">
            {running ? <FiLoader className="animate-spin" /> : <FiPlay />}
            {running ? "Running…" : "Run"}
          </button>
          <button onClick={() => act("submit")} disabled={disabled || busy}
                  className="exam-action-primary flex items-center gap-2">
            {submitting ? <FiLoader className="animate-spin" /> : <FiSave />}
            {submitting ? "Submitting…" : "Submit answer"}
          </button>
          <span className="text-xs text-gray-500">
            Run checks the sample cases. Submit is marked against every case and saved.
          </span>
        </div>

        {error && (
          <div className="mt-3 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
            {error}
          </div>
        )}

        {/* ── Console ──────────────────────────────────────────────────── */}
        {result && (
          <div className="mt-4 overflow-hidden rounded-exam border border-gray-200">
            <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold
                            ${allPassed ? "bg-status-answeredSoft text-status-answered"
                                        : "bg-status-unansweredSoft text-status-unanswered"}`}>
              <span className="flex items-center gap-2">
                <FiTerminal />
                {result.kind === "submit" ? "Submitted" : "Sample run"}
                <span className="tabular">· {result.passed}/{result.total} passed</span>
              </span>
              {result.kind === "submit" && result.marks != null && (
                <span className="tabular">{result.marks} mark{result.marks === 1 ? "" : "s"}</span>
              )}
            </div>

            {result.message && (
              <p className="border-b border-gray-100 bg-white px-4 py-2.5 text-[13px] text-gray-700">
                {result.message}
              </p>
            )}

            {/* Sample cases only. A hidden case that failed is counted in the
                total above and never shown — showing it is the answer key. */}
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto bg-white">
              {(result.cases || []).map((c, i) => (
                <li key={i} className="px-4 py-3">
                  <p className={`flex items-center gap-2 text-[13px] font-semibold
                                ${c.passed ? "text-status-answered" : "text-status-unanswered"}`}>
                    {c.passed ? <FiCheckCircle /> : <FiXCircle />}
                    Sample case {i + 1}
                  </p>
                  {!c.passed && (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="exam-label mb-1">Expected</p>
                        <pre className="overflow-x-auto rounded bg-gray-50 px-3 py-2 text-[12px] text-gray-800">
{c.expected ?? ""}
                        </pre>
                      </div>
                      <div className="min-w-0">
                        <p className="exam-label mb-1">Your output</p>
                        <pre className="overflow-x-auto rounded bg-gray-50 px-3 py-2 text-[12px] text-gray-800">
{c.actual ?? c.stderr ?? ""}
                        </pre>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {result.kind === "submit" && (
              <p className="border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
                Saved. You can change it and submit again before the section ends — the last
                submission is the one that counts.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default CodingPanel;
