import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import { api } from "../../lib/api";
import { FiPlus, FiTrash2, FiClock, FiAlertTriangle, FiArrowRight, FiEdit3 } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";
import { defaultBuffer, effectiveBuffer, lastEntry, minutesBetween, timeOf, sittingLabel } from "../../lib/buffer";

/**
 * Time windows candidates can sit this exam in.
 *
 * Previously reachable only from a Dashboard button pointing at a route that
 * didn't exist — clicking "Create Slot" went nowhere. This is that missing
 * screen. A slot matters because it's what actually admits a candidate: sign-in
 * checks the current time against a slot's window, not just whether the exam
 * itself is published.
 */

const toLocalInputValue = (iso) => {
  if (!iso) return "";
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" with no timezone.
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const Slots = () => {
  const navigate = useNavigate();
  const examId = localStorage.getItem("examId");

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // A slot is an opening time and a buffer: how late a candidate may still
  // start. Its stored end is opening + buffer.
  const [form, setForm] = useState({ startTime: "", buffer: "" });
  const [duration, setDuration] = useState(null);

  /**
   * The slot being re-timed, if any.
   *
   * Deleting and recreating a slot was the only way to move a sitting, and it
   * detaches every candidate already enrolled against it — a far bigger
   * operation than "the hall is not free until eleven" deserves.
   */
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ startTime: "", buffer: "" });

  /** A datetime-local input wants "YYYY-MM-DDTHH:mm" and nothing more. */
  const forInput = (iso) => (iso ? String(iso).replace(" ", "T").slice(0, 16) : "");

  const beginEdit = (slot) => {
    setEditing(slot.id);
    setEditForm({
      startTime: forInput(slot.startTime),
      buffer: String(minutesBetween(forInput(slot.startTime), forInput(slot.endTime))),
    });
    setError("");
  };

  /** The slot's end for a form, or null with the error already shown. */
  const endFor = (f) => {
    const minutes = effectiveBuffer(f.buffer, duration);
    if (!f.startTime) { setError("Set the start time."); return null; }
    if (!Number.isInteger(minutes) || minutes < 1) { setError("The buffer must be at least 1 minute."); return null; }
    return lastEntry(f.startTime, minutes);
  };

  const saveEdit = async () => {
    const endTime = endFor(editForm);
    if (!endTime) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.put(`/admin/slot/${editing}`, {
        examId: Number(examId),
        startTime: editForm.startTime,
        endTime,
      });
      setSlots((prev) => prev.map((x) => (x.id === editing ? updated : x)));
      setEditing(null);
    } catch (e) {
      setError(e.message || "That slot could not be moved.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!examId) return;
    (async () => {
      setLoading(true);
      try {
        setSlots(await api.get(`/admin/slot/${examId}`));
        // For the 10% default buffer. The page still works without it.
        api.get(`/admin/exam/${examId}`).then((e) => setDuration(e?.duration ?? null)).catch(() => {});
      } catch (e) {
        setError(e.message || "Could not load slots.");
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const create = async (e) => {
    e.preventDefault();
    const endTime = endFor(form);
    if (!endTime) return;
    setSaving(true);
    setError("");
    try {
      const slot = await api.post("/admin/slot", {
        examId: Number(examId), startTime: form.startTime, endTime,
      });
      setSlots((prev) => [...prev, slot]);
      setForm({ startTime: "", buffer: "" });
    } catch (e) {
      setError(e.message || "That slot could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this slot? Candidates mapped to it will no longer be able to sign in.")) return;
    try {
      await api.del(`/admin/slot/${id}`);
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e.message || "That slot could not be deleted.");
    }
  };

  const formMinutes = effectiveBuffer(form.buffer, duration);
  const formUntil = form.startTime && Number.isInteger(formMinutes) && formMinutes >= 1
    ? lastEntry(form.startTime, formMinutes) : null;

  if (!examId) {
    return (
      <Layout title="Slots" subtitle="Time windows candidates can sit this exam in">
        <ExamPicker what="Slots" />
      </Layout>
    );
  }

  return (
    <Layout title="Slots" subtitle="Time windows candidates can sit this exam in">
      <div className="max-w-2xl">
        <div className="rounded-exam border border-gray-200 bg-white p-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="exam-label mb-2 block">Opens</label>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="h-11 w-full rounded-exam border border-gray-300 px-3 text-sm outline-none focus:border-primary-600"
              />
            </div>
            <div>
              <label className="exam-label mb-2 block">Buffer (min)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.buffer}
                placeholder={duration ? String(defaultBuffer(duration)) : "10% of duration"}
                onChange={(e) => setForm({ ...form, buffer: e.target.value })}
                className="h-11 w-full rounded-exam border border-gray-300 px-3 text-sm tabular outline-none focus:border-primary-600"
              />
            </div>
            <p className="text-xs text-gray-500 sm:col-span-2">
              The buffer is how late a candidate may still start — 10% of the duration unless you
              change it. Each gets the exam's full duration from the moment they start: someone
              who begins 5 minutes late finishes 5 minutes later.
              {formUntil && (
                <span className="font-semibold text-gray-700"> Late entry until {timeOf(formUntil)}.</span>
              )}
            </p>
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="exam-action-primary flex items-center gap-2">
                <FiPlus /> {saving ? "Adding…" : "Add slot"}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <FiAlertTriangle className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-exam border border-gray-200 bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : slots.length === 0 ? (
            <div className="p-8 text-center">
              <FiClock className="mx-auto mb-2 text-2xl text-gray-300" />
              <p className="text-sm text-gray-500">No slots yet. A candidate cannot sign in until one exists and is open.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {slots.map((s) => {
                const closed = new Date(s.endTime) < new Date();
                if (editing === s.id) {
                  return (
                    <div key={s.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="exam-label mb-1 block">Opens</label>
                          <input type="datetime-local" value={editForm.startTime}
                                 onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                                 className="rounded-exam border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600" />
                        </div>
                        <div>
                          <label className="exam-label mb-1 block">Buffer (min)</label>
                          <input type="number" min="1" step="1" value={editForm.buffer}
                                 onChange={(e) => setEditForm({ ...editForm, buffer: e.target.value })}
                                 className="w-28 rounded-exam border border-gray-300 px-3 py-2 text-sm tabular outline-none focus:border-primary-600" />
                        </div>
                        <button onClick={saveEdit} disabled={saving} className="exam-action-primary">
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditing(null)}
                                className="px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800">
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={s.id} className="flex items-center justify-between px-5 py-4">
                    <div className="text-sm">
                      <span className="font-semibold text-gray-900">{sittingLabel(s, duration)}</span>
                      <span className="ml-2 text-gray-500">
                        ({minutesBetween(s.startTime, s.endTime)} min buffer)
                      </span>
                      {/* Said plainly, because a closed window is the usual
                          reason a candidate cannot sign in and the usual reason
                          somebody is on this screen at all. */}
                      {closed && (
                        <span className="ml-3 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          entry closed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => beginEdit(s)} title="Change the times"
                              className="rounded-exam p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary-700">
                        <FiEdit3 size={15} />
                      </button>
                      <button onClick={() => remove(s.id)} title="Delete"
                              className="rounded-exam p-2 text-gray-400 transition-colors hover:bg-status-unansweredSoft hover:text-status-unanswered">
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={() => navigate("/admin/students/add")} className="exam-action-primary flex items-center gap-2">
            Next: Add candidates <FiArrowRight />
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default Slots;
