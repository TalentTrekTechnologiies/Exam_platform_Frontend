import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { FiUsers, FiTrash2, FiAlertTriangle, FiSearch } from "react-icons/fi";

/**
 * Who is sitting when, and the means to change it.
 *
 * Sittings are chosen when a batch is enrolled, which is fine until exam
 * morning: someone misses the 9 o'clock batch, a lab is short of machines, a
 * name went into the wrong list. Until now the only remedy was editing the
 * database by hand, because enrolment refuses a candidate already in the exam
 * and nothing else could move them.
 *
 * Anyone who has already started is shown but locked — their paper is timed
 * against the window they actually sat, and moving it would leave an attempt
 * measured against a window its candidate was never in.
 */
const time = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

const day = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }) : "";

export default function SittingRoster({ examId, slots = [], refreshKey }) {
  const [rows, setRows] = useState(null);
  const [started, setStarted] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const list = await api.get(`/admin/students?examId=${examId}`);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || "Could not load the roll for this exam.");
      setRows([]);
    }
    // Anyone the monitor has seen is past the point where a move is safe.
    try {
      const mon = await api.get(`/admin/monitor/${examId}`);
      // The monitor identifies candidates by hall ticket, not by student id.
      const live = (mon?.candidates || []).filter((c) => c.state && c.state !== "NOT_STARTED");
      setStarted(new Set(live.map((c) => c.hallTicket)));
    } catch {
      setStarted(new Set());
    }
  };

  useEffect(() => {
    if (examId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, refreshKey]);

  const label = (s) => `${day(s.startTime)} · ${time(s.startTime)} – ${time(s.endTime)}`;

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows || [];
    return (rows || []).filter(
      (r) => (r.hallTicket || "").toLowerCase().includes(needle)
          || (r.name || "").toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => m.set(String(r.slotId), (m.get(String(r.slotId)) || 0) + 1));
    return m;
  }, [rows]);

  const move = async (row, slotId) => {
    if (String(slotId) === String(row.slotId)) return;
    setBusyId(row.studentId);
    setError(null);
    try {
      await api.put(`/admin/students/${row.studentId}/sitting`, {
        examId: Number(examId), slotId: Number(slotId),
      });
      setRows((prev) => prev.map((r) =>
        r.studentId === row.studentId ? { ...r, slotId: Number(slotId) } : r));
    } catch (e) {
      setError(e.message || "That candidate could not be moved.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    const who = row.name || row.hallTicket;
    if (!window.confirm(
      `Take ${who} off this exam?\n\nThey stay on the college roll and can be enrolled again.`
    )) return;
    setBusyId(row.studentId);
    setError(null);
    try {
      await api.del(`/admin/students/${row.studentId}/exam/${examId}`);
      setRows((prev) => prev.filter((r) => r.studentId !== row.studentId));
    } catch (e) {
      setError(e.message || "That candidate could not be removed.");
    } finally {
      setBusyId(null);
    }
  };

  if (rows === null) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Loading the roll…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-8 text-center">
        <FiUsers className="mx-auto mb-3 text-3xl text-gray-300" />
        <p className="text-sm text-gray-500">
          Nobody is enrolled in this exam yet. Add candidates above and they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-exam border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div>
          <h3 className="font-semibold text-gray-900">Who sits when</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {slots.map((s) => `${time(s.startTime)} — ${counts.get(String(s.id)) || 0}`).join("  ·  ")
              || `${rows.length} enrolled`}
          </p>
        </div>
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a candidate…"
            className="h-10 w-64 rounded-exam border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          <FiAlertTriangle className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="max-h-[26rem] overflow-y-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">Hall ticket</th>
              <th className="px-5 py-2.5 font-medium">Name</th>
              <th className="px-5 py-2.5 font-medium">Sitting</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => {
              const locked = started.has(r.hallTicket);
              const theirs = slots.find((s) => String(s.id) === String(r.slotId));
              return (
                <tr key={r.studentId} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium tabular tracking-wide text-gray-900">
                    {r.hallTicket}
                  </td>
                  <td className="px-5 py-2.5 text-gray-700">{r.name}</td>
                  <td className="px-5 py-2.5">
                    {locked ? (
                      <span className="text-xs text-gray-500">
                        {theirs ? label(theirs) : "—"}
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                          already started
                        </span>
                      </span>
                    ) : (
                      <select
                        value={r.slotId ?? ""}
                        disabled={busyId === r.studentId || slots.length === 0}
                        onChange={(e) => move(r, e.target.value)}
                        className="h-9 rounded-exam border border-gray-300 px-2 text-sm outline-none
                                   focus:border-primary-600 disabled:opacity-50"
                      >
                        {slots.map((s) => (
                          <option key={s.id} value={s.id}>{label(s)}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      onClick={() => remove(r)}
                      disabled={busyId === r.studentId || locked}
                      title={locked ? "They have already sat this exam" : "Take off this exam"}
                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600
                                 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
