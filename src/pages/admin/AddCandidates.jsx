import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import { API_BASE, api } from "../../lib/api";
import {
  FiUploadCloud, FiAlertTriangle, FiCheck, FiHash, FiUsers, FiTrash2, FiArrowRight,
} from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";

/**
 * Getting candidates onto an exam.
 *
 * Two routes, because colleges genuinely work both ways: some already hold roll
 * numbers in a spreadsheet and want to upload them; others have only a list of
 * names and need numbers issued. Both end in a preview, because a mistyped hall
 * ticket is only discovered on exam morning, when the candidate cannot sign in
 * and there is nothing anyone can do about it.
 */

const AddCandidates = () => {
  const navigate = useNavigate();
  const examId = localStorage.getItem("examId");
  const [mode, setMode] = useState("upload");
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState(localStorage.getItem("slotId") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);

  // Upload route
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const fileRef = useRef(null);

  // Generate route
  const [prefix, setPrefix] = useState("");
  const [padding, setPadding] = useState(3);
  const [names, setNames] = useState("");
  const [issued, setIssued] = useState(null);

  const loadSlots = useCallback(async () => {
    if (!examId) return;
    try {
      const list = await api.get(`/admin/slot/${examId}`);
      setSlots(list);
      // Pre-select when there is only one — the common case, and one less
      // decision for someone who just wants to add their students.
      if (list.length === 1) setSlotId(String(list[0].id));
    } catch {
      setSlots([]);
    }
  }, [examId]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const reset = () => { setPreview(null); setRows([]); setIssued(null); setError(""); };

  // ── Upload a roster file ─────────────────────────────────────────────────
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setError(""); setSaved(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("examId", examId);
      const res = await fetch(`${API_BASE}/admin/students/import/preview`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) { setError(body.message || "That file could not be read."); return; }
      setPreview(body);
      setRows(body.rows.map((r) => ({ ...r })));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (i, field, value) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value, issue: null } : r)));

  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const confirmUpload = async () => {
    if (!slotId) { setError("Choose which slot these candidates sit in."); return; }
    setBusy(true); setError("");
    try {
      const clean = rows
        .filter((r) => r.hallTicket?.trim() && r.name?.trim())
        .map((r) => ({ hallTicket: r.hallTicket.trim(), name: r.name.trim() }));
      const report = await api.post("/admin/students/import/confirm", {
        examId: Number(examId), slotId: Number(slotId), candidates: clean,
      });
      setSaved(report);
      reset();
    } catch (e) {
      setError(e.message || "Could not enrol these candidates.");
    } finally {
      setBusy(false);
    }
  };

  // ── Generate hall tickets ────────────────────────────────────────────────
  const generate = async () => {
    if (!slotId) { setError("Choose which slot these candidates sit in."); return; }
    setBusy(true); setError(""); setSaved(null);
    try {
      const report = await api.post("/admin/students/issue-hall-tickets", {
        examId: Number(examId), slotId: Number(slotId),
        prefix, padding: Number(padding),
        names: names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean),
      });
      setIssued(report);
    } catch (e) {
      setError(e.message || "Could not issue hall tickets.");
    } finally {
      setBusy(false);
    }
  };

  if (!examId) {
    return (
      <Layout title="Add Candidates" subtitle="Enrol students onto this exam">
        <ExamPicker what="Enrolling candidates" />
      </Layout>
    );
  }

  const usable = rows.filter((r) => r.hallTicket?.trim() && r.name?.trim()).length;

  return (
    <Layout title="Add Candidates" subtitle="Enrol students onto this exam">
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <FiAlertTriangle className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-exam border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <span className="flex items-start gap-2">
            <FiCheck className="mt-0.5 shrink-0" /> {saved.summary}
          </span>
          <Link to="/admin/students" className="shrink-0 font-semibold underline">
            View roster <FiArrowRight className="inline" />
          </Link>
        </div>
      )}

      {saved && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button onClick={() => navigate("/admin/publish")} className="exam-action-primary">
            Next: publish &amp; share the link
          </button>
          <button onClick={() => navigate("/admin/slots")} className="exam-action-quiet">
            Check the slots
          </button>
        </div>
      )}

      {/* Which sitting these candidates belong to. Required by both routes, so
          it is asked once, up front, rather than buried in each. */}
      <div className="mb-5 rounded-exam border border-gray-200 bg-white px-5 py-4">
        <label className="exam-label mb-2 block">Which slot do these candidates sit in?</label>
        {slots.length === 0 ? (
          <p className="text-sm text-amber-800">
            No slot has been scheduled for this exam yet. Create one first — a candidate
            with no slot has no window in which to sit.
          </p>
        ) : (
          <select
            value={slotId}
            onChange={(e) => setSlotId(e.target.value)}
            className="w-full max-w-md rounded-exam border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
          >
            <option value="">Choose a slot…</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.startTime).toLocaleString()} — {new Date(s.endTime).toLocaleTimeString()}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-5 flex gap-2">
        {[["upload", "Upload a list", FiUploadCloud], ["generate", "Generate hall tickets", FiHash]].map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => { setMode(key); reset(); }}
            className={`flex items-center gap-2 rounded-exam px-4 py-2.5 text-sm font-semibold transition-colors
              ${mode === key ? "bg-primary-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
          >
            <Icon /> {label}
          </button>
        ))}
      </div>

      {mode === "upload" && !preview && (
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
              {busy ? "Reading the file…" : "Drop your student list here, or click to choose"}
            </p>
            <p className="mt-1 text-sm text-gray-500">Excel (.xlsx), CSV, Word (.docx) or PDF</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.txt,.docx,.pdf"
                 className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <div className="mt-6 rounded-exam bg-gray-50 px-5 py-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">What it needs</p>
            <p className="mt-1 leading-relaxed">
              A hall ticket and a candidate name in each row. Headers like
              <span className="mono"> Roll No</span> or <span className="mono">Hall Ticket</span> are
              recognised automatically. Everything is shown for you to check before anyone is enrolled.
            </p>
          </div>
        </div>
      )}

      {mode === "upload" && preview && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-exam border border-gray-200 bg-white px-5 py-4">
            <div>
              <p className="font-semibold text-gray-900">{preview.sourceFileName}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {usable} of {rows.length} row(s) ready to enrol
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="exam-action-quiet">Cancel</button>
              <button onClick={confirmUpload} disabled={busy || usable === 0 || !slotId} className="exam-action-primary">
                {busy ? "Enrolling…" : `Enrol ${usable} candidate(s)`}
              </button>
            </div>
          </div>

          {preview.warnings?.map((w) => (
            <div key={w} className="mb-3 rounded-exam border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {w}
            </div>
          ))}

          <div className="overflow-x-auto rounded-exam border border-gray-200 bg-white">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-5 py-3 text-left exam-label">Hall ticket</th>
                  <th className="px-5 py-3 text-left exam-label">Candidate name</th>
                  <th className="px-5 py-3 text-left exam-label">Needs attention</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className={r.issue ? "bg-amber-50/50" : ""}>
                    <td className="px-5 py-2">
                      <input value={r.hallTicket || ""} onChange={(e) => updateRow(i, "hallTicket", e.target.value)}
                             className="w-full rounded border border-gray-200 px-2 py-1 tabular outline-none focus:border-primary-600" />
                    </td>
                    <td className="px-5 py-2">
                      <input value={r.name || ""} onChange={(e) => updateRow(i, "name", e.target.value)}
                             className="w-full rounded border border-gray-200 px-2 py-1 outline-none focus:border-primary-600" />
                    </td>
                    <td className="px-5 py-2 text-xs text-amber-800">{r.issue || ""}</td>
                    <td className="px-5 py-2 text-right">
                      <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-status-unanswered">
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === "generate" && (
        <div className="rounded-exam border border-gray-200 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-1">
              <span className="exam-label mb-1 block">Hall ticket prefix</span>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                     placeholder="24CSE"
                     className="w-full rounded-exam border border-gray-300 px-3 py-2 tabular tracking-wide outline-none focus:border-primary-600" />
            </label>
            <label>
              <span className="exam-label mb-1 block">Number width</span>
              <input type="number" min="1" max="8" value={padding} onChange={(e) => setPadding(e.target.value)}
                     className="w-full rounded-exam border border-gray-300 px-3 py-2 tabular outline-none focus:border-primary-600" />
            </label>
            <div className="flex items-end">
              <p className="text-sm text-gray-500">
                Example: <span className="mono font-semibold text-gray-800">
                  {(prefix || "24CSE") + String(1).padStart(Number(padding) || 3, "0")}
                </span>
              </p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="exam-label mb-1 block">Candidate names — one per line</span>
            <textarea rows={8} value={names} onChange={(e) => setNames(e.target.value)}
                      placeholder={"Asha Rao\nBhavya K\nChandu P"}
                      className="w-full rounded-exam border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600" />
          </label>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={generate} disabled={busy || !slotId || !names.trim()} className="exam-action-primary">
              {busy ? "Issuing…" : "Issue hall tickets"}
            </button>
            <p className="text-sm text-gray-500">
              Numbers continue from those already issued, so a second batch never collides.
            </p>
          </div>

          {issued && (
            <div className="mt-6">
              <p className="mb-3 font-semibold text-gray-900">{issued.summary}</p>
              {issued.skipped?.length > 0 && (
                <div className="mb-3 rounded-exam border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {issued.skipped.map((s) => <p key={s}>· {s}</p>)}
                </div>
              )}
              <div className="overflow-x-auto rounded-exam border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-2 text-left exam-label">Hall ticket</th>
                      <th className="px-4 py-2 text-left exam-label">Name</th>
                      <th className="px-4 py-2 text-left exam-label">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {issued.issued.map((t) => (
                      <tr key={t.studentId}>
                        <td className="px-4 py-2 font-medium tabular text-gray-900">{t.hallTicket}</td>
                        <td className="px-4 py-2 text-gray-700">{t.name}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {t.newlyCreated ? "newly issued" : "already had one"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link to="/admin/students" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700">
                <FiUsers /> View the full roster <FiArrowRight />
              </Link>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

export default AddCandidates;
