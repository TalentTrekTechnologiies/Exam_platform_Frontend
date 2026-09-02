import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";

/**
 * The editor a candidate writes their program in.
 *
 * Line numbers, syntax highlighting, bracket matching and real indentation —
 * because a textarea is what a candidate sees when they sit down, and a
 * textarea says the exam was thrown together. That judgement is not unfair:
 * they have used HackerRank, and this is what they are comparing it against.
 *
 * CodeMirror rather than Monaco. Monaco is around two megabytes before a
 * language service and every machine in a hall fetches it within the same
 * minute; this is a fraction of that, loaded only when a coding question is
 * actually opened, and covers everything a one-hour round needs.
 *
 * Deliberately NOT included: autocomplete and linting. Suggesting the method a
 * candidate is trying to remember is doing the assessment for them, and an
 * examination is not the place to be helpful about it.
 */

const EXTENSIONS = {
  python: python,
  java: java,
  cpp: cpp,
  // C is close enough to C++ for highlighting; there is no separate C mode.
  c: cpp,
};

const CodeEditor = ({ value, onChange, language, disabled, height = "420px" }) => {
  const extensions = useMemo(() => {
    const build = EXTENSIONS[language];
    return build ? [build()] : [];
  }, [language]);

  return (
    <div
      // The exam blocks every key it does not use, which would leave a
      // candidate unable to type a single character in here. This marks the one
      // region where the keyboard behaves like a keyboard.
      data-code-editor="true"
      className="overflow-hidden rounded-exam border border-gray-700"
    >
      <CodeMirror
        value={value}
        height={height}
        theme={oneDark}
        extensions={extensions}
        editable={!disabled}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          tabSize: 4,
          // Off on purpose: see the note above about doing the candidate's
          // recall for them.
          autocompletion: false,
          lintKeymap: false,
          searchKeymap: false,
        }}
      />
    </div>
  );
};

export default CodeEditor;
