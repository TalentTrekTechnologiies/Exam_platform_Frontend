import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import { api } from "../../lib/api";
import { FiPlus, FiTrash2, FiClock, FiAlertTriangle, FiArrowRight, FiEdit3 } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";

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
  const [form, setForm] = useState({ startTime: "", endTime: "" });

  /**
   * The slot being re-timed, if any.
   *
   * Deleting and recreating a slot was the only way to move a sitting, and it
   * detaches every candidate already enrolled against it — a far bigger
   * operation than "the hall is not free until eleven" deserves.
   */
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ startTime: "", endTime: "" });

  /** A datetime-local input wants "YYYY-MM-DDTHH:mm" and nothing more. */
  const forInput = (iso) => (iso ? String(iso).replace(" ", "T").slice(0, 16) : "");

  const beginEdit = (slot) => {
    setEditing(slot.id);
    setEditForm({ startTime: forInput(slot.startTime), endTime: forInput(slot.endTime) });
    setError("");
  };

  const saveEdit = async () => {
    if (!editForm.startTime || !editForm.endTime) {
      setError("Set both a start and an end time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await api.put(`/admin/slot/${editing}`, {
        examId: Number(examId),
        startTime: editForm.startTime,
        endTime: editForm.endTime,
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
      } catch (e) {
        setError(e.message || "Could not load slots.");
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.startTime || !form.endTime) { setError("Set both a start and an end time."); return; }
    setSaving(true);
    setError("");
    try {
      const slot = await api.post("/admin/slot", {
        examId: Number(examId), startTime: form.startTime, endTime: form.endTime,
      });
      setSlots((prev) => [...prev, slot]);
      setForm({ startTime: "", endTime: "" });
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
              <label className="exam-label mb-2 block">Closes</label>
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="h-11 w-full rounded-exam border border-gray-300 px-3 text-sm outline-none focus:border-primary-600"
              />
            </div>
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
                          <label className="exam-label mb-1 block">Closes</label>
                          <input type="datetime-local" value={editForm.endTime}
                                 onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                                 className="rounded-exam border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600" />
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
                      <span className="font-semibold text-gray-900">{new Date(s.startTime).toLocaleString()}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="font-semibold text-gray-900">{new Date(s.endTime).toLocaleString()}</span>
                      {/* Said plainly, because a closed window is the usual
                          reason a candidate cannot sign in and the usual reason
                          somebody is on this screen at all. */}
                      {closed && (
                        <span className="ml-3 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          window closed
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
