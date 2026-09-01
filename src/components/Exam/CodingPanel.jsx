import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiPlay, FiCheckCircle, FiXCircle, FiLoader, FiSave } from "react-icons/fi";
import { examApi } from "../../lib/api";

/**
 * A coding question, as the candidate sits it.
 *
 * The statement above, the editor below, and two distinct actions that are
 * deliberately not the same button:
 *
 *   Run     — compiles against the SAMPLE cases only and shows the output.
 *             Awards nothing, says nothing about standing.
 *   Submit  — marked against every case, including the hidden ones, and stored.
 *
 * Marking at submit rather than at the final whistle is a load decision that
 * shows up here as a design one: the candidate gets their case count back
 * immediately, so "submitted" means something they can see, and the server
 * never has five thousand programs to compile in the same minute.
 *
 * A plain textarea, not an embedded IDE. Monaco is about two megabytes before
 * a language service, fetched by every machine in a hall within the same
 * minute; a monospace textarea that handles Tab covers what a one-hour round
 * needs. Worth revisiting if candidates ask for it, not before.
 */

/** Spaces per Tab. Four, because the starter code is written that way. */
const INDENT = "    ";

const statusTone = (ok) =>
  ok ? "text-status-answered" : "text-status-unanswered";

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
  const editorRef = useRef(null);

  // Moving between questions must not carry the previous one's code or its
  // results across — the panel is reused, so it is reset explicitly.
  useEffect(() => {
    setSource(savedCode?.sourceCode ?? question.starterCode ?? "");
    setLanguage(savedCode?.language || languages[0]?.id || "");
    setResult(null);
    setError("");
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Tab indents instead of leaving the editor.
   *
   * Without this the first Tab a candidate presses moves focus to the Run
   * button and their cursor is gone — in a language where indentation is the
   * syntax.
   */
  const onKeyDown = (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.target;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = source.slice(0, start) + INDENT + source.slice(end);
    setSource(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + INDENT.length;
    });
  };

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

  return (
    <article className="mx-auto max-w-stem">
      <header className="mb-6 flex items-baseline justify-between gap-6 border-b border-gray-200 pb-4">
        <h2 className="text-[15px] font-semibold text-gray-900">
          Question {question.displayNumber}
          <span className="ml-3 rounded bg-primary-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
            Coding
          </span>
        </h2>
        <div className="flex items-center gap-4 text-[13px] font-medium tabular">
          <span className="text-status-answered">+{question.marks}</span>
        </div>
      </header>

      <div className="text-question whitespace-pre-wrap text-gray-900">
        {question.questionText}
      </div>

      {question.constraintsText && (
        <section className="mt-6">
          <h3 className="exam-label mb-2">Constraints</h3>
          <pre className="overflow-x-auto rounded-exam border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-800">
{question.constraintsText}
          </pre>
        </section>
      )}

      {(question.sampleInput || question.sampleOutput) && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="exam-label mb-2">Sample input</h3>
            <pre className="overflow-x-auto rounded-exam border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-800">
{question.sampleInput}
            </pre>
          </div>
          <div>
            <h3 className="exam-label mb-2">Sample output</h3>
            <pre className="overflow-x-auto rounded-exam border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-800">
{question.sampleOutput}
            </pre>
          </div>
        </section>
      )}

      {question.sampleExplanation && (
        <section className="mt-4">
          <h3 className="exam-label mb-2">Explanation</h3>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
            {question.sampleExplanation}
          </p>
        </section>
      )}

      {/* ── Editor ─────────────────────────────────────────────────────────── */}
      <section className="mt-8">
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

        {/*
          data-code-editor marks this as the one place in a locked paper where
          typing is allowed. The exam blocks every key it does not use, which is
          right for multiple choice and would leave a candidate unable to write
          a single character here.
        */}
        <textarea
          ref={editorRef}
          data-code-editor="true"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          rows={16}
          className="w-full resize-y rounded-exam border border-gray-300 bg-chrome p-4 font-mono text-[13px]
                     leading-relaxed text-gray-100 outline-none focus:border-primary-600
                     disabled:opacity-60"
          style={{ tabSize: 4, whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto" }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => act("run")}
            disabled={disabled || busy}
            className="exam-action-quiet flex items-center gap-2"
          >
            {running ? <FiLoader className="animate-spin" /> : <FiPlay />}
            {running ? "Running…" : "Run"}
          </button>
          <button
            onClick={() => act("submit")}
            disabled={disabled || busy}
            className="exam-action-primary flex items-center gap-2"
          >
            {submitting ? <FiLoader className="animate-spin" /> : <FiSave />}
            {submitting ? "Submitting…" : "Submit answer"}
          </button>
          <span className="text-xs text-gray-500">
            Run checks the sample cases only. Submit is marked against every case and saved.
          </span>
        </div>
      </section>

      {error && (
        <div className="mt-4 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-6 rounded-exam border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">
              {result.kind === "submit" ? "Submitted" : "Sample run"}
              <span className={`ml-3 tabular ${statusTone(result.total > 0 && result.passed === result.total)}`}>
                {result.passed}/{result.total} passed
              </span>
            </p>
            {result.kind === "submit" && result.marks != null && (
              <span className="text-sm font-semibold tabular text-gray-900">
                {result.marks} mark{result.marks === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {result.message && (
            <p className="border-b border-gray-100 px-5 py-3 text-[13px] text-gray-700">
              {result.message}
            </p>
          )}

          {/* Only ever the sample cases. A hidden case that failed is counted
              in the total above and never shown, because showing it is the key. */}
          <ul className="divide-y divide-gray-100">
            {(result.cases || []).map((c, i) => (
              <li key={i} className="px-5 py-3">
                <p className={`flex items-center gap-2 text-[13px] font-semibold ${statusTone(c.passed)}`}>
                  {c.passed ? <FiCheckCircle /> : <FiXCircle />}
                  Sample case {i + 1}
                </p>
                {!c.passed && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="exam-label mb-1">Expected</p>
                      <pre className="overflow-x-auto rounded bg-gray-50 px-3 py-2 text-[12px] text-gray-800">
{c.expected ?? ""}
                      </pre>
                    </div>
                    <div>
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
            <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
              Your answer is saved. You can change it and submit again at any time before the
              exam ends — the last submission is the one that counts.
            </p>
          )}
        </section>
      )}
    </article>
  );
};

export default CodingPanel;
