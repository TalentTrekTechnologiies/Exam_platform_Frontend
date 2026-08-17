import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import Modal from "../../components/UI/Modal";
import { API_BASE, api, uploadUrl } from "../../lib/api";
import {
  FiEdit2, FiTrash2, FiPlus, FiSearch, FiImage, FiX, FiUploadCloud,
  FiAlertTriangle, FiCheck, FiInbox, FiFileText,
} from "react-icons/fi";

/**
 * The question bank for one exam.
 *
 * This is where staff spend most of their time, and where the most damaging
 * mistakes are made — not crashes, but quiet ones: an answer key pointing at a
 * blank option, a section left twenty questions short, a marking scheme that
 * silently differs between typed and imported questions. None of those announce
 * themselves at build time; they surface on exam day, against real candidates.
 * So this screen is built to make the shape of the paper visible and to refuse
 * the saves that cannot be recovered from.
 */

const LETTERS = ["A", "B", "C", "D"];

const emptyForm = (defaults) => ({
  text: "",
  options: ["", "", "", ""],
  optionImages: [null, null, null, null],
  correctAnswer: "",
  sectionId: "",
  imagePreview: null,
  marks: defaults.marks,
  negativeMarks: defaults.negativeMarks,
});

const QuestionManagement = () => {
  const navigate = useNavigate();
  const examId = localStorage.getItem("examId");

  const [questions, setQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [csvFile, setCsvFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);

  /**
   * The exam's default marking scheme, used to seed new questions.
   *
   * Read defensively: a malformed value here used to throw inside the save
   * handler, which meant a corrupt localStorage entry took out the ability to
   * add questions at all, with nothing on screen to explain why.
   */
  const defaults = useMemo(() => {
    let rules = {};
    try {
      rules = JSON.parse(localStorage.getItem("examRules")) || {};
    } catch {
      rules = {};
    }
    return {
      marks: Number(rules.positiveMarks) || 1,
      negativeMarks: rules.negativeMarking ? Math.abs(Number(rules.negativeMarks) || 0) : 0,
    };
  }, []);

  const [formData, setFormData] = useState(() => emptyForm(defaults));

  useEffect(() => {
    if (!examId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [secs, qs] = await Promise.all([
          api.get(`/admin/section/${examId}`),
          api.get(`/admin/question/${examId}`),
        ]);
        setSections(Array.isArray(secs) ? secs : []);
        setQuestions(Array.isArray(qs) ? qs : []);
      } catch (e) {
        setNotice({ tone: "error", title: "Could not load this exam's questions.", detail: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const reloadQuestions = async () => {
    try {
      const qs = await api.get(`/admin/question/${examId}`);
      setQuestions(Array.isArray(qs) ? qs : []);
    } catch {
      /* the list is stale, not wrong — the save itself already reported. */
    }
  };

  const sectionName = (id) => sections.find((s) => s.id === id)?.name || "Unassigned";

  // ── Paper shape ─────────────────────────────────────────────────────────
  // A per-section tally with the marks each section carries. Staff building an
  // EAMCET or NQT paper work to a blueprint (40 Physics, 40 Chemistry, 80
  // Maths); without this they are counting rows by hand.
  const coverage = useMemo(() => {
    const bySection = new Map();
    let totalMarks = 0;
    for (const q of questions) {
      const key = q.sectionId ?? null;
      const entry = bySection.get(key) || { id: key, count: 0, marks: 0 };
      entry.count += 1;
      entry.marks += Number(q.marks) || 0;
      bySection.set(key, entry);
      totalMarks += Number(q.marks) || 0;
    }
    // Sections with no questions yet still belong in the list — an empty
    // section is exactly the gap this summary exists to reveal.
    for (const s of sections) if (!bySection.has(s.id)) bySection.set(s.id, { id: s.id, count: 0, marks: 0 });
    return { rows: [...bySection.values()], totalMarks };
  }, [questions, sections]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return questions.filter((q) => {
      const matchesSearch = !needle || q.questionText?.toLowerCase().includes(needle);
      const matchesSection = sectionFilter === "all" || String(q.sectionId) === sectionFilter;
      return matchesSearch && matchesSection;
    });
  }, [questions, search, sectionFilter]);

  // ── Uploads ─────────────────────────────────────────────────────────────

  const uploadImage = async (file) => {
    if (!file) return null;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE}/upload/logo`, { method: "POST", body });
      const parsed = await res.json();
      if (!res.ok) { setFormError(parsed.message || "That image could not be uploaded."); return null; }
      return parsed.filename;
    } catch {
      setFormError("Could not reach the server to upload that image.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile) { setNotice({ tone: "warn", title: "Choose a CSV file first." }); return; }
    setImporting(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", csvFile);
      body.append("examId", examId);
      const res = await fetch(`${API_BASE}/admin/question/upload`, { method: "POST", body });
      const report = await res.json();

      if (!res.ok) {
        setNotice({ tone: "error", title: report.message || "That file could not be imported." });
        return;
      }

      // Which rows were rejected, and why. A silent "success" on a file where
      // every row failed is how a paper ends up short on exam day.
      setNotice({
        tone: report.errors?.length ? "warn" : "ok",
        title: report.summary,
        lines: (report.errors || []).slice(0, 15).map((e) => `Line ${e.line}: ${e.reason}`),
        more: report.skipped > 15 ? report.skipped - 15 : 0,
      });
      setCsvFile(null);
      reloadQuestions();
    } catch {
      setNotice({ tone: "error", title: "Could not reach the server." });
    } finally {
      setImporting(false);
    }
  };

  // ── Saving ──────────────────────────────────────────────────────────────

  /**
   * Refuses the saves that produce an unanswerable question.
   *
   * The last check is the one that matters: an answer key pointing at an empty
   * option cannot be detected later. Marking would run confidently, and every
   * candidate would be graded against a choice that was never on their screen.
   */
  const validate = () => {
    const filled = formData.options.map((o, i) => Boolean((o || "").trim()) || Boolean(formData.optionImages[i]));

    if (!formData.text.trim() && !formData.imagePreview) return "The question needs text, or an image to stand in for it.";
    // Section deliberately optional. The flow no longer routes through the
    // Sections screen — imports create sections from the paper itself — so
    // demanding one here would block anyone typing their first question into a
    // brand-new exam. Unsectioned questions group under "General", which the
    // scorecard and results already handle.
    if (filled.filter(Boolean).length < 2) return "A question needs at least two options.";
    if (!formData.correctAnswer) return "Mark which option is correct — a question without a key cannot be marked.";

    const keyIndex = LETTERS.indexOf(formData.correctAnswer);
    if (!filled[keyIndex]) {
      return `Option ${formData.correctAnswer} is marked correct but is empty. Candidates would be graded against a blank choice.`;
    }
    if (!(Number(formData.marks) > 0)) return "Marks must be greater than zero.";
    return null;
  };

  const handleSave = async (addAnother) => {
    const problem = validate();
    if (problem) { setFormError(problem); return; }

    setFormError("");
    setSaving(true);

    const payload = {
      examId: Number(examId),
      // Number("") is 0, not null — sending 0 would point the question at a
      // section id that cannot exist.
      sectionId: formData.sectionId ? Number(formData.sectionId) : null,
      questionText: formData.text,
      questionImage: formData.imagePreview || null,
      optionA: formData.options[0], optionB: formData.options[1],
      optionC: formData.options[2], optionD: formData.options[3],
      optionAImage: formData.optionImages[0] || null, optionBImage: formData.optionImages[1] || null,
      optionCImage: formData.optionImages[2] || null, optionDImage: formData.optionImages[3] || null,
      correctAnswer: formData.correctAnswer.toUpperCase(),
      marks: Number(formData.marks),
      negativeMarks: Math.abs(Number(formData.negativeMarks) || 0),
    };

    try {
      if (editing) await api.put(`/admin/question/${editing.id}`, payload);
      else await api.post("/admin/question", payload);

      await reloadQuestions();

      if (addAnother) {
        // Keep the section and marking scheme — consecutive questions almost
        // always share both, and re-picking them each time is the slowest part
        // of typing a paper by hand.
        const { sectionId, marks, negativeMarks } = formData;
        setFormData({ ...emptyForm(defaults), sectionId, marks, negativeMarks });
        setEditing(null);
        setNotice({ tone: "ok", title: "Question saved. Add the next one." });
      } else {
        setModalOpen(false);
      }
    } catch (e) {
      // Previously an `if (res.ok)` with no else branch: a rejected save closed
      // the dialog and looked exactly like a successful one.
      setFormError(e.message || "The server rejected this question.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q) => {
    const preview = (q.questionText || "").slice(0, 70);
    if (!window.confirm(`Delete this question?\n\n"${preview}${q.questionText?.length > 70 ? "…" : ""}"\n\nThis cannot be undone.`)) return;
    try {
      await api.del(`/admin/question/${q.id}`);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    } catch (e) {
      setNotice({ tone: "error", title: "That question could not be deleted.", detail: e.message });
    }
  };

  const openEditor = (q) => {
    setFormError("");
    if (q) {
      setEditing(q);
      setFormData({
        text: q.questionText || "",
        options: [q.optionA || "", q.optionB || "", q.optionC || "", q.optionD || ""],
        optionImages: [q.optionAImage, q.optionBImage, q.optionCImage, q.optionDImage],
        correctAnswer: q.correctAnswer || "",
        sectionId: q.sectionId ?? "",
        imagePreview: q.questionImage || null,
        marks: q.marks ?? defaults.marks,
        negativeMarks: q.negativeMarks ?? defaults.negativeMarks,
      });
    } else {
      setEditing(null);
      setFormData(emptyForm(defaults));
    }
    setModalOpen(true);
  };

  const setField = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  if (!examId) {
    return (
      <Layout title="Questions" subtitle="Build the paper">
        <div className="rounded-exam border border-gray-200 bg-white p-10 text-center text-gray-600">
          Open an exam first — questions belong to the exam you are working on.
        </div>
      </Layout>
    );
  }

  const noticeTone = {
    ok: "border-green-200 bg-green-50 text-green-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
  };

  return (
    <Layout title="Questions" subtitle={`Exam #${examId} · ${questions.length} question(s) · ${coverage.totalMarks} marks`}>

      {/* ── Paper shape ─────────────────────────────────────────────────── */}
      {sections.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {coverage.rows.map((row) => (
            <button
              key={String(row.id)}
              onClick={() => setSectionFilter(sectionFilter === String(row.id) ? "all" : String(row.id))}
              className={`rounded-exam border px-4 py-2.5 text-left transition-colors
                ${sectionFilter === String(row.id) ? "border-primary-600 bg-primary-50" : "border-gray-200 bg-white hover:border-gray-400"}`}
            >
              <div className="exam-label">{sectionName(row.id)}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                <span className="tabular">{row.count}</span>
                <span className="font-normal text-gray-500"> question(s) · </span>
                <span className="tabular">{row.marks}</span>
                <span className="font-normal text-gray-500"> marks</span>
              </div>
              {row.count === 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                  <FiAlertTriangle size={12} /> empty
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-exam border border-gray-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="h-11 w-64 rounded-exam border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
            />
          </div>

          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="h-11 rounded-exam border border-gray-300 px-3 text-sm text-gray-700 outline-none focus:border-primary-600"
          >
            <option value="all">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <span className="mx-1 h-6 w-px bg-gray-200" />

          {/* Reading a real question paper is the better route in and was only
              reachable from the sidebar, while CSV — the narrower option — had
              a button right here. Anyone holding a PDF paper would reasonably
              conclude the product could not read one. */}
          <button
            onClick={() => navigate("/admin/questions/import")}
            className="exam-action-primary flex h-11 items-center gap-2"
          >
            <FiFileText /> Import PDF / Word paper
          </button>

          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-exam border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50">
            <FiUploadCloud className="text-gray-500" />
            <span className="max-w-[10rem] truncate">{csvFile ? csvFile.name : "Choose CSV"}</span>
            <input type="file" accept=".csv" className="hidden" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
          </label>

          <button onClick={handleCsvImport} disabled={importing || !csvFile} className="exam-action-quiet h-11">
            {importing ? "Importing…" : "Import CSV"}
          </button>
        </div>

        <button onClick={() => openEditor(null)} className="exam-action-quiet flex h-11 items-center gap-2">
          <FiPlus className="stroke-[3]" /> Add question
        </button>
      </div>

      {notice && (
        <div className={`mb-5 flex items-start gap-2 rounded-exam border px-5 py-4 text-sm ${noticeTone[notice.tone]}`}>
          {notice.tone === "ok" ? <FiCheck className="mt-0.5 shrink-0" /> : <FiAlertTriangle className="mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{notice.title}</p>
            {notice.detail && <p className="mt-0.5">{notice.detail}</p>}
            {notice.lines?.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {notice.lines.map((l) => <li key={l} className="mono text-xs">{l}</li>)}
                {notice.more > 0 && <li className="text-xs italic">…and {notice.more} more.</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setNotice(null)} className="shrink-0 opacity-60 hover:opacity-100"><FiX /></button>
        </div>
      )}

      {/* ── The bank ────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-exam border border-gray-200 bg-white">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading questions…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FiInbox className="mx-auto mb-3 text-3xl text-gray-300" />
            {questions.length === 0 ? (
              <>
                <p className="font-semibold text-gray-900">No questions yet.</p>
                <p className="mt-1 text-sm text-gray-500">
                  The quickest way in is to hand it your existing question paper.
                </p>
                {/* This empty state is where a newly created exam lands, so the
                    fastest route in belongs here rather than only in a toolbar. */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => navigate("/admin/questions/import")}
                    className="exam-action-primary flex items-center gap-2"
                  >
                    <FiFileText /> Import a PDF or Word paper
                  </button>
                  <button onClick={() => openEditor(null)} className="exam-action-quiet flex items-center gap-2">
                    <FiPlus /> Type one in
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900">Nothing matches those filters.</p>
                <button onClick={() => { setSearch(""); setSectionFilter("all"); }} className="mt-3 text-sm font-semibold text-primary-700 hover:underline">
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="exam-label px-5 py-3">#</th>
                  <th className="exam-label px-5 py-3">Question</th>
                  <th className="exam-label px-5 py-3">Section</th>
                  <th className="exam-label px-5 py-3 text-center">Key</th>
                  <th className="exam-label px-5 py-3 text-right">Marks</th>
                  <th className="exam-label px-5 py-3 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((q, idx) => {
                  const keyIndex = LETTERS.indexOf(q.correctAnswer);
                  const keyText = keyIndex >= 0 ? q[`option${q.correctAnswer}`] : null;
                  const keyImage = keyIndex >= 0 ? q[`option${q.correctAnswer}Image`] : null;
                  // Surfaced in the list, not just on save, because a question
                  // imported before this check existed can still carry the fault.
                  const brokenKey = !q.correctAnswer || (!keyText?.trim() && !keyImage);

                  return (
                    <tr key={q.id} className="align-top transition-colors hover:bg-gray-50">
                      <td className="tabular px-5 py-4 text-sm text-gray-400">{idx + 1}</td>
                      <td className="px-5 py-4">
                        <p className="max-w-xl text-sm text-gray-900 line-clamp-2">{q.questionText}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                          {q.questionImage && <span className="flex items-center gap-1"><FiImage size={12} /> figure</span>}
                          {[q.optionAImage, q.optionBImage, q.optionCImage, q.optionDImage].some(Boolean) && (
                            <span className="flex items-center gap-1"><FiImage size={12} /> option images</span>
                          )}
                          {brokenKey && (
                            <span className="flex items-center gap-1 font-semibold text-status-unanswered">
                              <FiAlertTriangle size={12} /> answer key is blank
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-exam border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
                          {sectionName(q.sectionId)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-exam text-xs font-bold
                          ${brokenKey ? "bg-status-unansweredSoft text-status-unanswered" : "bg-status-answeredSoft text-status-answered"}`}>
                          {q.correctAnswer || "—"}
                        </span>
                      </td>
                      <td className="tabular px-5 py-4 text-right text-sm text-gray-700">
                        +{q.marks ?? 1}
                        {Number(q.negativeMarks) > 0 && (
                          <span className="text-status-unanswered"> / −{Math.abs(q.negativeMarks)}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {/* Always visible. These were hover-only, which put them
                            out of reach on a touch screen entirely. */}
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEditor(q)} title="Edit"
                                  className="rounded-exam p-2 text-gray-500 transition-colors hover:bg-primary-50 hover:text-primary-700">
                            <FiEdit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(q)} title="Delete"
                                  className="rounded-exam p-2 text-gray-500 transition-colors hover:bg-status-unansweredSoft hover:text-status-unanswered">
                            <FiTrash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {questions.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button onClick={() => navigate("/admin/review")} className="exam-action-primary">
            Review &amp; finalise paper
          </button>
        </div>
      )}

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? "Edit question" : "New question"} size="xl">
        <div className="max-h-[78vh] space-y-6 overflow-y-auto px-1 py-1">

          <section>
            <label className="exam-label mb-2 block">Question</label>
            <textarea
              rows={3}
              value={formData.text}
              onChange={(e) => setField({ text: e.target.value })}
              placeholder="Type the question as candidates will read it…"
              className="w-full rounded-exam border border-gray-300 p-4 text-question outline-none focus:border-primary-600"
            />
            <div className="mt-2 flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary-700">
                <FiImage /> {uploading ? "Uploading…" : "Attach a figure"}
                <input type="file" accept="image/*" className="hidden"
                       onChange={async (e) => {
                         const url = await uploadImage(e.target.files?.[0]);
                         if (url) setField({ imagePreview: url });
                       }} />
              </label>
            </div>
            {formData.imagePreview && (
              <div className="relative mt-3 inline-block">
                {/* Uploads return a bare filename; it has to be resolved to the
                    server's /uploads path or the browser looks for it under the
                    current admin route and the preview silently breaks. */}
                <img src={uploadUrl(formData.imagePreview)} alt="Question figure"
                     className="max-h-44 rounded-exam border border-gray-200" />
                <button onClick={() => setField({ imagePreview: null })}
                        className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-status-unanswered shadow ring-1 ring-gray-200">
                  <FiX size={14} />
                </button>
              </div>
            )}
          </section>

          <section>
            <label className="exam-label mb-2 block">Options — select the correct one</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {LETTERS.map((L, i) => {
                const chosen = formData.correctAnswer === L;
                return (
                  <div key={L}
                       className={`rounded-exam border p-3 transition-colors
                         ${chosen ? "border-status-answered bg-status-answeredSoft" : "border-gray-200 hover:border-gray-400"}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct-option"
                        checked={chosen}
                        onChange={() => setField({ correctAnswer: L })}
                        title={`Mark option ${L} as correct`}
                      />
                      <span className="w-4 shrink-0 text-xs font-bold text-gray-500">{L}</span>
                      <input
                        value={formData.options[i]}
                        onChange={(e) => {
                          const next = [...formData.options];
                          next[i] = e.target.value;
                          setField({ options: next });
                        }}
                        placeholder={`Option ${L}`}
                        className="w-full bg-transparent text-option outline-none"
                      />
                      <label className="shrink-0 cursor-pointer text-gray-400 hover:text-primary-700" title="Attach an image to this option">
                        <FiImage size={15} />
                        <input type="file" accept="image/*" className="hidden"
                               onChange={async (e) => {
                                 const url = await uploadImage(e.target.files?.[0]);
                                 if (!url) return;
                                 const next = [...formData.optionImages];
                                 next[i] = url;
                                 setField({ optionImages: next });
                               }} />
                      </label>
                    </div>
                    {formData.optionImages[i] && (
                      <div className="relative mt-2">
                        <img src={uploadUrl(formData.optionImages[i])} alt={`Option ${L}`}
                             className="h-20 w-full rounded border border-gray-200 object-contain" />
                        <button
                          onClick={() => {
                            const next = [...formData.optionImages];
                            next[i] = null;
                            setField({ optionImages: next });
                          }}
                          className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-status-unanswered shadow ring-1 ring-gray-200">
                          <FiX size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 rounded-exam border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
            <div>
              <label className="exam-label mb-2 block">Section <span className="font-normal normal-case text-gray-400">(optional)</span></label>
              <select
                value={formData.sectionId}
                onChange={(e) => setField({ sectionId: e.target.value })}
                className="h-10 w-full rounded-exam border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary-600"
              >
                <option value="">No section</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="exam-label mb-2 block">Marks if correct</label>
              <input type="number" min="0" step="0.5" value={formData.marks}
                     onChange={(e) => setField({ marks: e.target.value })}
                     className="tabular h-10 w-full rounded-exam border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary-600" />
            </div>
            <div>
              {/* Per question, not per exam. This is what lets one platform run
                  EAMCET (no negative), NEET (−1) and NQT (0) side by side — and
                  it was previously only settable on imported questions. */}
              <label className="exam-label mb-2 block">Deducted if wrong</label>
              <input type="number" min="0" step="0.25" value={formData.negativeMarks}
                     onChange={(e) => setField({ negativeMarks: e.target.value })}
                     className="tabular h-10 w-full rounded-exam border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary-600" />
            </div>
          </section>

          {formError && (
            <div className="flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <FiAlertTriangle className="mt-0.5 shrink-0" /> {formError}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <button onClick={() => setModalOpen(false)} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
              Cancel
            </button>
            <div className="flex gap-2">
              <button onClick={() => handleSave(false)} disabled={saving} className="exam-action-quiet">
                {saving ? "Saving…" : "Save & close"}
              </button>
              {!editing && (
                <button onClick={() => handleSave(true)} disabled={saving} className="exam-action-primary">
                  {saving ? "Saving…" : "Save & add another"}
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default QuestionManagement;
