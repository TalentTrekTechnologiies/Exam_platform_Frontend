import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import Modal from "../../components/UI/Modal";
import { API_BASE, api, uploadUrl } from "../../lib/api";
import {
  FiEdit2, FiTrash2, FiPlus, FiSearch, FiImage, FiX, FiUploadCloud,
  FiAlertTriangle, FiCheck, FiInbox, FiFileText, FiCopy,
} from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";

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

const LANGUAGES = [
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
];

/** A new, empty case. Sample by default: a question with none is unrunnable. */
const emptyTest = (sample = false) => ({
  input: "", expectedOutput: "", sample, weight: 1, label: "",
});

const emptyForm = (defaults) => ({
  type: "MCQ",
  text: "",
  options: ["", "", "", ""],
  optionImages: [null, null, null, null],
  correctAnswer: "",
  sectionId: "",
  imagePreview: null,
  marks: defaults.marks,
  negativeMarks: defaults.negativeMarks,

  // ── Coding ────────────────────────────────────────────────────────────────
  constraintsText: "",
  sampleInput: "",
  sampleOutput: "",
  sampleExplanation: "",
  allowedLanguages: LANGUAGES.map((l) => l.id),
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  starterCode: "",
  // One visible case and one hidden one: the minimum shape that is actually an
  // exam question rather than a demonstration.
  tests: [emptyTest(true), emptyTest(false)],
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

  /**
   * The setter's own solution, run against the key before anybody sits it.
   *
   * This is the check that matters most on a coding question. A test case with
   * a wrong expected output marks correct programs as failed, and nobody finds
   * out until results are published and the appeals start — by which point the
   * sitting cannot be re-run.
   */
  const [reference, setReference] = useState({ language: "python", sourceCode: "" });
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
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

  /**
   * What must be true before a coding question can be sat.
   *
   * Every one of these is a state that produces a broken exam rather than an
   * error: no cases means nothing to mark against, no sample means the Run
   * button has nothing to run, and no language means a candidate who cannot
   * answer at all.
   */
  const validateCoding = () => {
    if (!formData.text.trim()) return "A coding question needs a problem statement.";
    if (!(Number(formData.marks) > 0)) return "Marks must be greater than zero.";
    if (!formData.allowedLanguages.length) {
      return "Allow at least one language, or nobody can answer this question.";
    }

    const usable = formData.tests.filter(
      (t) => (t.input ?? "").length > 0 || (t.expectedOutput ?? "").length > 0,
    );
    if (!usable.length) return "A coding question needs at least one test case.";
    if (!usable.some((t) => t.sample)) {
      return "Mark at least one case as a sample, or candidates have nothing to run against.";
    }
    if (usable.some((t) => !(t.expectedOutput ?? "").trim())) {
      return "Every test case needs an expected output — a blank one marks correct programs as failed.";
    }
    if (!(Number(formData.timeLimitMs) > 0)) return "The time limit must be greater than zero.";
    if (!(Number(formData.memoryLimitMb) > 0)) return "The memory limit must be greater than zero.";
    return null;
  };

  const handleSave = async (addAnother) => {
    const coding = formData.type === "CODING";
    const problem = coding ? validateCoding() : validate();
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

    if (coding) {
      payload.type = "CODING";
      // A coding question has no options and no key. Sent as nulls rather than
      // left off, so editing an MCQ into a coding question clears what was
      // there instead of leaving four orphaned options behind it.
      payload.optionA = null; payload.optionB = null;
      payload.optionC = null; payload.optionD = null;
      payload.optionAImage = null; payload.optionBImage = null;
      payload.optionCImage = null; payload.optionDImage = null;
      payload.correctAnswer = null;
      // Negative marking makes no sense against partial credit on test cases.
      payload.negativeMarks = 0;

      payload.constraintsText = formData.constraintsText || null;
      payload.sampleInput = formData.sampleInput || null;
      payload.sampleOutput = formData.sampleOutput || null;
      payload.sampleExplanation = formData.sampleExplanation || null;
      payload.allowedLanguages = formData.allowedLanguages.join(",");
      payload.timeLimitMs = Number(formData.timeLimitMs);
      payload.memoryLimitMb = Number(formData.memoryLimitMb);
      payload.starterCode = formData.starterCode || null;
    } else {
      payload.type = "MCQ";
    }

    try {
      const savedQuestion = editing
        ? await api.put(`/admin/question/${editing.id}`, payload)
        : await api.post("/admin/question", payload);

      if (coding) {
        // Two calls, because the cases are a separate resource and the hidden
        // ones must never travel with the paper. The question exists either
        // way; a failure here leaves it without cases, which publication
        // refuses to let anybody sit.
        const questionId = editing ? editing.id : savedQuestion?.id;
        if (!questionId) throw new Error("The question saved but returned no id, so its test cases could not be attached.");
        await api.put(`/admin/coding/${questionId}/tests`, formData.tests
          .filter((t) => (t.input ?? "").length > 0 || (t.expectedOutput ?? "").length > 0)
          .map((t) => ({
            input: t.input,
            expectedOutput: t.expectedOutput,
            sample: !!t.sample,
            weight: Number(t.weight) || 1,
            label: t.label || null,
          })));
      }

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

  const openEditor = async (q) => {
    setFormError("");
    // The reference solution and its result belong to the question that was
    // open, not to this screen. Left standing, Q1's solution greeted whoever
    // opened Q2 and could be run against Q2's cases without anybody noticing
    // it was the wrong program.
    setReference({ language: "python", sourceCode: "" });
    setVerifyResult(null);
    if (q) {
      const coding = q.type === "CODING";
      setEditing(q);
      setFormData({
        ...emptyForm(defaults),
        type: coding ? "CODING" : "MCQ",
        text: q.questionText || "",
        options: [q.optionA || "", q.optionB || "", q.optionC || "", q.optionD || ""],
        optionImages: [q.optionAImage, q.optionBImage, q.optionCImage, q.optionDImage],
        correctAnswer: q.correctAnswer || "",
        sectionId: q.sectionId ?? "",
        imagePreview: q.questionImage || null,
        marks: q.marks ?? defaults.marks,
        negativeMarks: q.negativeMarks ?? defaults.negativeMarks,

        constraintsText: q.constraintsText || "",
        sampleInput: q.sampleInput || "",
        sampleOutput: q.sampleOutput || "",
        sampleExplanation: q.sampleExplanation || "",
        allowedLanguages: q.allowedLanguages
          ? String(q.allowedLanguages).split(",").map((x) => x.trim()).filter(Boolean)
          : LANGUAGES.map((l) => l.id),
        timeLimitMs: q.timeLimitMs ?? 2000,
        memoryLimitMb: q.memoryLimitMb ?? 256,
        starterCode: q.starterCode || "",
        tests: [emptyTest(true), emptyTest(false)],
      });
      setModalOpen(true);

      // The cases live on their own endpoint and are fetched only when a
      // coding question is actually opened — they are the answer key, and the
      // question list has no business carrying them.
      if (coding) {
        try {
          const tests = await api.get(`/admin/coding/${q.id}/tests`);
          if (Array.isArray(tests) && tests.length) {
            setFormData((prev) => ({
              ...prev,
              tests: tests.map((t) => ({
                input: t.input || "",
                expectedOutput: t.expectedOutput || "",
                sample: !!t.sample,
                weight: t.weight ?? 1,
                label: t.label || "",
              })),
            }));
          }
        } catch (e) {
          setFormError(e.message || "The test cases for this question could not be loaded — saving now would replace them.");
        }
      }
      return;
    }

    setEditing(null);
    setFormData(emptyForm(defaults));
    setModalOpen(true);
  };

  const setField = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  /**
   * Saves the current cases, then runs the reference solution against them.
   *
   * Saving first is deliberate: checking against what is in the database while
   * the form holds something different would pass a question the candidates
   * will not get.
   */
  const verifyReference = async () => {
    if (!editing || verifying) return;
    setVerifying(true);
    setVerifyResult(null);
    setFormError("");
    try {
      await api.put(`/admin/coding/${editing.id}/tests`, formData.tests
        .filter((t) => (t.input ?? "").length > 0 || (t.expectedOutput ?? "").length > 0)
        .map((t) => ({
          input: t.input,
          expectedOutput: t.expectedOutput,
          sample: !!t.sample,
          weight: Number(t.weight) || 1,
          label: t.label || null,
        })));

      setVerifyResult(await api.post(`/admin/coding/${editing.id}/verify`, reference));
    } catch (e) {
      setFormError(e.message || "The reference solution could not be run. Is a judge configured?");
    } finally {
      setVerifying(false);
    }
  };

  if (!examId) {
    return (
      <Layout title="Questions" subtitle="Build the paper">
        <ExamPicker what="The question bank" />
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

          {/* Most colleges run the same paper shape every year, so last year's
              questions are usually the fastest way to fill a new one. */}
          <button
            onClick={() => navigate("/admin/questions/reuse")}
            className="exam-action-quiet flex h-11 items-center gap-2"
          >
            <FiCopy /> Reuse from a previous exam
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
                  <button onClick={() => navigate("/admin/questions/reuse")} className="exam-action-quiet flex items-center gap-2">
                    <FiCopy /> Reuse from a previous exam
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
                  const coding = q.type === "CODING";
                  const keyIndex = LETTERS.indexOf(q.correctAnswer);
                  const keyText = keyIndex >= 0 ? q[`option${q.correctAnswer}`] : null;
                  const keyImage = keyIndex >= 0 ? q[`option${q.correctAnswer}Image`] : null;
                  // Surfaced in the list, not just on save, because a question
                  // imported before this check existed can still carry the fault.
                  // A coding question has no key to break — its equivalent
                  // fault is having no test cases, which publication catches.
                  const brokenKey = !coding && (!q.correctAnswer || (!keyText?.trim() && !keyImage));

                  return (
                    <tr key={q.id} className="align-top transition-colors hover:bg-gray-50">
                      <td className="tabular px-5 py-4 text-sm text-gray-400">{idx + 1}</td>
                      <td className="px-5 py-4">
                        <p className="max-w-xl text-sm text-gray-900 line-clamp-2">{q.questionText}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                          {coding && (
                            <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                              Coding
                            </span>
                          )}
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
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {/* Candidates are what the exam next actually needs; reviewing the
              paper is worth offering but is not what blocks publishing. */}
          <button onClick={() => navigate("/admin/review")} className="exam-action-quiet">
            Review &amp; finalise paper
          </button>
          <button onClick={() => navigate("/admin/students/add")} className="exam-action-primary">
            Next: add candidates
          </button>
        </div>
      )}

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? "Edit question" : "New question"} size="xl">
        <div className="max-h-[78vh] space-y-6 overflow-y-auto px-1 py-1">

          {/* Type first, because it decides what the rest of this form is. */}
          <section>
            <label className="exam-label mb-2 block">Question type</label>
            <div className="flex gap-2">
              {[["MCQ", "Multiple choice"], ["CODING", "Coding"]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setField({ type: id })}
                  className={`rounded-exam px-4 py-2 text-sm font-semibold transition-colors ${
                    formData.type === id
                      ? "bg-primary-700 text-white"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {formData.type === "CODING" && (
              <p className="mt-2 text-xs text-gray-500">
                Candidates write and run a program. Negative marking does not apply — marks are
                earned per test case passed.
              </p>
            )}
          </section>

          <section>
            <label className="exam-label mb-2 block">
              {formData.type === "CODING" ? "Problem statement" : "Question"}
            </label>
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

          {formData.type !== "CODING" && (
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
          )}

          {formData.type === "CODING" && (
            <>
              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="exam-label mb-2 block">Sample input</label>
                  <textarea rows={4} value={formData.sampleInput}
                            onChange={(e) => setField({ sampleInput: e.target.value })}
                            className="w-full rounded-exam border border-gray-300 p-3 font-mono text-[13px] outline-none focus:border-primary-600" />
                </div>
                <div>
                  <label className="exam-label mb-2 block">Sample output</label>
                  <textarea rows={4} value={formData.sampleOutput}
                            onChange={(e) => setField({ sampleOutput: e.target.value })}
                            className="w-full rounded-exam border border-gray-300 p-3 font-mono text-[13px] outline-none focus:border-primary-600" />
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="exam-label mb-2 block">
                    Constraints <span className="font-normal normal-case text-gray-400">(optional)</span>
                  </label>
                  <textarea rows={3} value={formData.constraintsText}
                            onChange={(e) => setField({ constraintsText: e.target.value })}
                            className="w-full rounded-exam border border-gray-300 p-3 font-mono text-[13px] outline-none focus:border-primary-600" />
                </div>
                <div>
                  <label className="exam-label mb-2 block">
                    Explanation <span className="font-normal normal-case text-gray-400">(optional)</span>
                  </label>
                  <textarea rows={3} value={formData.sampleExplanation}
                            onChange={(e) => setField({ sampleExplanation: e.target.value })}
                            className="w-full rounded-exam border border-gray-300 p-3 text-sm outline-none focus:border-primary-600" />
                </div>
              </section>

              <section className="rounded-exam border border-gray-200 bg-gray-50 p-4">
                <label className="exam-label mb-2 block">Languages allowed</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => {
                    const on = formData.allowedLanguages.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setField({
                          allowedLanguages: on
                            ? formData.allowedLanguages.filter((x) => x !== l.id)
                            : [...formData.allowedLanguages, l.id],
                        })}
                        className={`rounded-exam px-3 py-1.5 text-sm font-semibold transition-colors ${
                          on ? "bg-primary-700 text-white" : "border border-gray-300 bg-white text-gray-600"
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="exam-label mb-2 block">Time limit (ms)</label>
                    <input type="number" min="100" step="100" value={formData.timeLimitMs}
                           onChange={(e) => setField({ timeLimitMs: e.target.value })}
                           className="tabular h-10 w-full rounded-exam border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary-600" />
                  </div>
                  <div>
                    <label className="exam-label mb-2 block">Memory limit (MB)</label>
                    <input type="number" min="16" step="16" value={formData.memoryLimitMb}
                           onChange={(e) => setField({ memoryLimitMb: e.target.value })}
                           className="tabular h-10 w-full rounded-exam border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary-600" />
                  </div>
                </div>

                <label className="exam-label mb-2 mt-4 block">
                  Starter code <span className="font-normal normal-case text-gray-400">(optional)</span>
                </label>
                <textarea rows={4} value={formData.starterCode}
                          onChange={(e) => setField({ starterCode: e.target.value })}
                          className="w-full rounded-exam border border-gray-300 bg-white p-3 font-mono text-[13px] outline-none focus:border-primary-600" />
              </section>

              {/* Samples are shown to candidates and are what Run executes
                  against. Hidden cases are the marking and never leave the
                  server. Weight lets an edge case count for more than a happy
                  path — the difference between rewarding a correct program and
                  rewarding one that merely handles the example. */}
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <label className="exam-label">Test cases</label>
                  <div className="flex items-center gap-2">
                    <button type="button"
                            onClick={() => setField({ tests: [...formData.tests, emptyTest(true)] })}
                            className="text-sm font-semibold text-primary-700 hover:underline">
                      + Sample
                    </button>
                    <button type="button"
                            onClick={() => setField({ tests: [...formData.tests, emptyTest(false)] })}
                            className="text-sm font-semibold text-primary-700 hover:underline">
                      + Hidden
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {formData.tests.map((t, i) => (
                    <div key={i}
                         className={`rounded-exam border p-3 ${t.sample ? "border-primary-200 bg-primary-50/40" : "border-gray-200 bg-white"}`}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
                          <input type="checkbox" checked={!!t.sample}
                                 onChange={(e) => setField({
                                   tests: formData.tests.map((x, j) => (j === i ? { ...x, sample: e.target.checked } : x)),
                                 })} />
                          Shown to candidates
                        </label>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1 text-xs text-gray-500">
                            Weight
                            <input type="number" min="0" step="0.5" value={t.weight}
                                   onChange={(e) => setField({
                                     tests: formData.tests.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)),
                                   })}
                                   className="tabular h-7 w-16 rounded border border-gray-300 px-2 text-xs" />
                          </label>
                          <button type="button"
                                  onClick={() => setField({ tests: formData.tests.filter((_, j) => j !== i) })}
                                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <FiX size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <textarea rows={3} value={t.input} placeholder="Input"
                                  onChange={(e) => setField({
                                    tests: formData.tests.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)),
                                  })}
                                  className="w-full rounded border border-gray-300 p-2 font-mono text-[12px] outline-none focus:border-primary-600" />
                        <textarea rows={3} value={t.expectedOutput} placeholder="Expected output"
                                  onChange={(e) => setField({
                                    tests: formData.tests.map((x, j) => (j === i ? { ...x, expectedOutput: e.target.value } : x)),
                                  })}
                                  className="w-full rounded border border-gray-300 p-2 font-mono text-[12px] outline-none focus:border-primary-600" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-exam border border-gray-200 bg-white p-4">
                <label className="exam-label mb-1 block">Check the key</label>
                <p className="mb-3 text-xs text-gray-500">
                  Paste a solution you know is correct and run it against every case. A case with a
                  wrong expected output marks correct programs as failed, and nobody finds out until
                  the appeals.
                </p>

                {!editing ? (
                  <p className="rounded-exam bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    Save the question first — the cases have to exist before anything can be run
                    against them.
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <select
                        value={reference.language}
                        onChange={(e) => setReference({ ...reference, language: e.target.value })}
                        className="h-9 rounded-exam border border-gray-300 bg-white px-3 text-sm outline-none focus:border-primary-600"
                      >
                        {LANGUAGES.filter((l) => formData.allowedLanguages.includes(l.id))
                          .map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={verifyReference}
                        disabled={verifying || !reference.sourceCode.trim()}
                        className="exam-action-quiet disabled:opacity-50"
                      >
                        {verifying ? "Running…" : "Save cases & run"}
                      </button>
                    </div>

                    <textarea
                      rows={6}
                      value={reference.sourceCode}
                      onChange={(e) => setReference({ ...reference, sourceCode: e.target.value })}
                      placeholder="A solution you know is correct."
                      className="w-full rounded-exam border border-gray-300 bg-chrome p-3 font-mono text-[13px] text-gray-100 outline-none focus:border-primary-600"
                      style={{ tabSize: 4, whiteSpace: "pre", overflowX: "auto" }}
                    />

                    {verifyResult && (
                      <div className={`mt-3 rounded-exam border px-4 py-3 text-sm ${
                        verifyResult.allPassed
                          ? "border-green-200 bg-green-50 text-green-900"
                          : "border-amber-300 bg-amber-50 text-amber-900"
                      }`}>
                        <p className="font-semibold">
                          {verifyResult.passed}/{verifyResult.total} cases agree with this solution
                        </p>
                        <p className="mt-0.5 text-xs">{verifyResult.message}</p>

                        {/* Staff may see every case, hidden ones included: it is
                            their key. Only the disagreements are worth the space. */}
                        {!verifyResult.allPassed && (
                          <ul className="mt-3 space-y-2">
                            {(verifyResult.cases || []).filter((c) => !c.passed).map((c, i) => (
                              <li key={i} className="rounded bg-white/70 p-2">
                                <p className="text-xs font-semibold">
                                  Case {(verifyResult.cases || []).indexOf(c) + 1}
                                  {c.sample ? " (sample)" : " (hidden)"}
                                </p>
                                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <p className="exam-label mb-0.5">Expected</p>
                                    <pre className="overflow-x-auto rounded bg-gray-50 px-2 py-1 text-[12px] text-gray-800">{c.expected ?? ""}</pre>
                                  </div>
                                  <div>
                                    <p className="exam-label mb-0.5">Solution produced</p>
                                    <pre className="overflow-x-auto rounded bg-gray-50 px-2 py-1 text-[12px] text-gray-800">{c.actual ?? c.stderr ?? ""}</pre>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}

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
