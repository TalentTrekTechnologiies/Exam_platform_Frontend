import React, { useState, useRef } from "react";
import Layout from "../../components/Layout/Layout";
import { API_BASE, api, uploadUrl } from "../../lib/api";
import { FiUploadCloud, FiAlertTriangle, FiCheck, FiFileText, FiTrash2 } from "react-icons/fi";

/**
 * Importing a question paper from a document.
 *
 * The review table is the whole point. Document parsing is lossy — numbering
 * styles vary, options wrap, answer keys are often in a different file entirely
 * — and a mis-read answer key is the one error the system can never detect for
 * itself: it would mark every candidate confidently against the wrong answer.
 * So the parser only ever proposes, and nothing is saved until a person has
 * looked at every row.
 */

const LETTERS = ["A", "B", "C", "D"];

const ImportQuestions = () => {
  const examId = localStorage.getItem("examId");
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const fileRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setError(""); setSaved(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("examId", examId);
      const res = await fetch(`${API_BASE}/admin/question/import/preview`, {
        method: "POST", body: form,
      });
      const body = await res.json();
      if (!res.ok) { setError(body.message || "That file could not be read."); return; }

      setPreview(body);
      setRows(body.questions.map((q) => ({ ...q })));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const update = (i, field, value) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const remove = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  // A question with no key would be unmarkable, so importing is blocked until
  // every remaining row has one. This is the guard that makes the whole flow safe.
  const missingKeys = rows.filter((r) => !r.correctAnswer).length;
  const incomplete = rows.filter((r) => !r.questionText || !r.optionA || !r.optionB).length;
  const canImport = rows.length > 0 && missingKeys === 0 && incomplete === 0;

  const confirm = async () => {
    setBusy(true); setError("");
    try {
      const report = await api.post("/admin/question/import/confirm", { examId: Number(examId), questions: rows });
      setSaved(report);
      setPreview(null);
      setRows([]);
    } catch (e) {
      setError(e.message || "Could not save the questions.");
    } finally {
      setBusy(false);
    }
  };

  if (!examId) {
    return (
      <Layout title="Import Questions" subtitle="Read a question paper from PDF or Word">
        <div className="rounded-exam border border-gray-200 bg-white p-10 text-center text-gray-600">
          Open an exam first — questions are imported into the exam you are working on.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Import Questions" subtitle="Read a question paper from PDF or Word">
      {!preview && (
        <div className="rounded-exam border border-gray-200 bg-white p-8">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
            className="cursor-pointer rounded-exam border-2 border-dashed border-gray-300 px-6 py-14 text-center
                       transition-colors hover:border-primary-500 hover:bg-primary-50/40"
          >
            <FiUploadCloud className="mx-auto mb-3 text-3xl text-gray-400" />
            <p className="font-semibold text-gray-900">
              {busy ? "Reading the document…" : "Drop a question paper here, or click to choose"}
            </p>
            <p className="mt-1 text-sm text-gray-500">PDF or Word (.docx)</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />

          <div className="mt-6 rounded-exam bg-gray-50 px-5 py-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">What this reads</p>
            <p className="mt-1 leading-relaxed">
              Numbered questions (1. 2. 3.) with lettered options (A) B) C) D),
              answer keys written as <span className="mono">Answer: B</span>, section headings,
              and <span className="mono">[4 marks]</span> annotations. Everything it finds is shown
              for you to correct before anything is saved.
            </p>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <FiAlertTriangle className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {saved && (
            <div className="mt-4 flex items-start gap-2 rounded-exam border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
              <FiCheck className="mt-0.5 shrink-0" />
              <span>{saved.summary} {saved.errors?.length > 0 && `${saved.errors.length} row(s) were rejected.`}</span>
            </div>
          )}
        </div>
      )}

      {preview && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-exam border border-gray-200 bg-white px-5 py-4">
            <div>
              <p className="font-semibold text-gray-900">
                <FiFileText className="mr-2 inline" />{preview.sourceFileName}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {rows.length} question(s) found · review and correct before importing
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPreview(null); setRows([]); }} className="exam-action-quiet">
                Cancel
              </button>
              <button onClick={confirm} disabled={!canImport || busy} className="exam-action-primary">
                {busy ? "Importing…" : `Import ${rows.length} question(s)`}
              </button>
            </div>
          </div>

          {/* The blocker is stated plainly and blocks the button, rather than
              letting an unmarkable question slip into a live paper. */}
          {(missingKeys > 0 || incomplete > 0) && (
            <div className="mb-5 flex items-start gap-2 rounded-exam border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <span>
                {missingKeys > 0 && <><b>{missingKeys} question(s) have no correct answer set.</b> A question without a key cannot be marked. </>}
                {incomplete > 0 && <><b>{incomplete} question(s) are missing text or options.</b> </>}
                Fix or remove them to import.
              </span>
            </div>
          )}

          {preview.documentWarnings?.map((w) => (
            <div key={w} className="mb-3 rounded-exam border border-gray-200 bg-white px-5 py-3 text-sm text-gray-600">
              {w}
            </div>
          ))}

          <div className="space-y-4">
            {rows.map((q, i) => (
              <article key={i} className={`rounded-exam border bg-white p-5
                ${!q.correctAnswer ? "border-amber-300" : "border-gray-200"}`}>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <span className="exam-label">Question {q.sourceNumber || i + 1}</span>
                  <button
                    onClick={() => remove(i)}
                    title="Remove this question from the import"
                    className="text-gray-400 transition-colors hover:text-status-unanswered"
                  >
                    <FiTrash2 />
                  </button>
                </div>

                <textarea
                  value={q.questionText || ""}
                  onChange={(e) => update(i, "questionText", e.target.value)}
                  rows={2}
                  placeholder="Question text"
                  className="w-full rounded-exam border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
                />

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {LETTERS.map((L) => (
                    <label key={L} className={`flex items-center gap-2 rounded-exam border px-3 py-2
                      ${q.correctAnswer === L ? "border-status-answered bg-status-answeredSoft" : "border-gray-200"}`}>
                      <input
                        type="radio"
                        name={`key-${i}`}
                        checked={q.correctAnswer === L}
                        onChange={() => update(i, "correctAnswer", L)}
                        title="Mark as the correct answer"
                      />
                      <span className="w-4 shrink-0 text-xs font-bold text-gray-500">{L}</span>
                      <input
                        value={q[`option${L}`] || ""}
                        onChange={(e) => update(i, `option${L}`, e.target.value)}
                        placeholder={`Option ${L}`}
                        className="w-full bg-transparent text-sm outline-none"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <span className="exam-label">Marks</span>
                    <input type="number" value={q.marks ?? ""} onChange={(e) => update(i, "marks", e.target.value)}
                           className="w-16 rounded-exam border border-gray-300 px-2 py-1 tabular outline-none focus:border-primary-600" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="exam-label">Negative</span>
                    <input type="number" step="0.25" value={q.negativeMarks ?? ""} onChange={(e) => update(i, "negativeMarks", e.target.value)}
                           className="w-16 rounded-exam border border-gray-300 px-2 py-1 tabular outline-none focus:border-primary-600" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="exam-label">Section</span>
                    <input value={q.sectionName || ""} onChange={(e) => update(i, "sectionName", e.target.value)}
                           placeholder="e.g. Physics"
                           className="w-36 rounded-exam border border-gray-300 px-2 py-1 outline-none focus:border-primary-600" />
                  </label>
                </div>

                {q.images?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {q.images.map((img) => (
                      <img key={img} src={uploadUrl(img)} alt="" className="h-16 rounded border border-gray-200" />
                    ))}
                  </div>
                )}

                {q.issues?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {q.issues.map((issue) => (
                      <li key={issue} className="flex items-start gap-2 text-xs text-amber-800">
                        <FiAlertTriangle className="mt-0.5 shrink-0" /> {issue}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
};

export default ImportQuestions;
