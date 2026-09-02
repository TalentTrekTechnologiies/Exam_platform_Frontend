import React, { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { FiFileText, FiRotateCcw } from "react-icons/fi";

/**
 * The editor a candidate writes their program in.
 *
 * Line numbers, syntax highlighting, bracket matching and real indentation,
 * dressed as an editor rather than a form field — because a bare text box is
 * what a candidate sees when they sit down, and it tells them the exam was
 * thrown together. That judgement is not unfair: they have used HackerRank,
 * and this is what they are comparing it against.
 *
 * CodeMirror rather than Monaco. Monaco is around two megabytes before a
 * language service and every machine in a hall fetches it within the same
 * minute; this is a fraction of that, loaded only when a coding question is
 * opened, and covers everything a one-hour round needs.
 *
 * Deliberately NOT included: autocomplete and linting. Suggesting the method a
 * candidate is trying to remember is doing the assessment for them, and an
 * examination is not the place to be helpful about it.
 */

const LANGUAGES = {
  python: { mode: python, file: "solution.py", label: "Python 3" },
  java:   { mode: java,   file: "Main.java",   label: "Java" },
  // C is close enough to C++ for highlighting; there is no separate C mode.
  cpp:    { mode: cpp,    file: "main.cpp",    label: "C++" },
  c:      { mode: cpp,    file: "main.c",      label: "C" },
};

const CodeEditor = ({ value, onChange, language, disabled, starterCode, onReset }) => {
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const meta = LANGUAGES[language] || { file: "solution.txt", label: language || "—" };

  const extensions = useMemo(() => (meta.mode ? [meta.mode()] : []), [meta]);

  const lines = value ? value.split("\n").length : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-exam border border-slate-700 bg-[#282c34]">

      {/* ── Tab bar ──────────────────────────────────────────────────────
          The file name is the language made concrete. It is also the one
          place a Java candidate is told their class must be Main, which is
          otherwise a compile error they cannot diagnose. */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-[#21252b] px-3">
        <div className="flex items-center gap-2 border-b-2 border-primary-500 px-2 py-2">
          <FiFileText className="text-slate-400" size={13} />
          <span className="font-mono text-[12px] text-slate-200">{meta.file}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {meta.label}
          </span>
          {starterCode != null && onReset && (
            <button
              onClick={onReset}
              disabled={disabled}
              title="Put the starting code back"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-slate-400
                         transition-colors hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40"
            >
              <FiRotateCcw size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      {/*
        data-code-editor marks this as the one region of a locked paper where
        the keyboard behaves like a keyboard. The exam blocks every key it does
        not use, which is right for multiple choice and would otherwise leave a
        candidate unable to type a single character of their solution.
      */}
      <div data-code-editor="true" className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={value}
          height="100%"
          theme={oneDark}
          extensions={extensions}
          editable={!disabled}
          onChange={onChange}
          onUpdate={(v) => {
            const pos = v.state.selection.main.head;
            const line = v.state.doc.lineAt(pos);
            setCursor({ line: line.number, col: pos - line.from + 1 });
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            indentOnInput: true,
            foldGutter: false,
            tabSize: 4,
            // Off on purpose: see the note above about doing the candidate's
            // recall for them.
            autocompletion: false,
            lintKeymap: false,
            searchKeymap: false,
          }}
        />
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-t border-slate-700 bg-[#21252b] px-3 py-1.5
                      font-mono text-[11px] text-slate-400">
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>{lines} line{lines === 1 ? "" : "s"} · UTF-8 · Spaces: 4</span>
      </div>
    </div>
  );
};

export default CodeEditor;
