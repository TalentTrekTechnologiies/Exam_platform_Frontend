import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { FiSearch, FiCheck, FiAlertTriangle, FiUsers } from "react-icons/fi";

/**
 * Putting candidates the college already holds into another exam.
 *
 * A student belongs to the institution, not to one exam. Before this the only
 * way to enrol a returning candidate was to upload their details again, which
 * created a second roster entry for the same person — so the student list
 * filled with what looked like duplicates but was really one person with a
 * history.
 *
 * Anyone already in this exam is shown ticked and disabled rather than hidden,
 * so it is obvious they are covered instead of appearing to have gone missing.
 */
export default function ExistingStudents({ examId, slotId, onAssigned }) {
  const [people, setPeople] = useState(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    try {
      const list = await api.get("/admin/students/registry");
      setPeople(Array.isArray(list) ? list : []);
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "Could not load your candidates." });
      setPeople([]);
    }
  };

  useEffect(() => { load(); }, []);

  const alreadyHere = (p) =>
    (p.exams || []).some((e) => String(e.examId) === String(examId));

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return people || [];
    return (people || []).filter(
      (p) => (p.hallTicket || "").toLowerCase().includes(needle)
          || (p.name || "").toLowerCase().includes(needle),
    );
  }, [people, search]);

  const selectable = shown.filter((p) => !alreadyHere(p));
  const allPicked = selectable.length > 0 && selectable.every((p) => picked.has(p.studentId));

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setPicked(
    allPicked ? new Set() : new Set(selectable.map((p) => p.studentId)),
  );

  const assign = async () => {
    if (picked.size === 0 || !slotId) return;
    setBusy(true);
    setNotice(null);
    try {
      const report = await api.post("/admin/students/assign", {
        examId: Number(examId), slotId: Number(slotId), studentIds: [...picked],
      });
      setNotice({
        tone: report.errors?.length ? "warn" : "ok",
        text: report.summary,
        lines: (report.errors || []).slice(0, 8).map((e) => e.reason),
      });
      setPicked(new Set());
      await load();                 // their exam list has changed
      onAssigned?.(report);
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "Those candidates could not be assigned." });
    } finally {
      setBusy(false);
    }
  };

  const tone = {
    ok: "border-green-200 bg-green-50 text-green-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
  };

  if (people === null) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        Loading your candidates…
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-10 text-center">
        <FiUsers className="mx-auto mb-3 text-3xl text-gray-300" />
        <p className="font-semibold text-gray-900">No candidates on your roll yet.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          Upload a list first. After that, the same people can be put into any later exam
          from here without entering them again.
        </p>
      </div>
    );
  }

  return (
    <>
      {notice && (
        <div className={`mb-4 flex items-start gap-2 rounded-exam border px-5 py-4 text-sm ${tone[notice.tone]}`}>
          {notice.tone === "ok" ? <FiCheck className="mt-0.5 shrink-0" />
                                : <FiAlertTriangle className="mt-0.5 shrink-0" />}
          <div>
            <p className="font-semibold">{notice.text}</p>
            {notice.lines?.map((l, i) => <p key={i} className="mt-0.5 text-xs">{l}</p>)}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-exam border border-gray-200 bg-white px-5 py-4">
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by hall ticket or name…"
            className="h-11 w-72 rounded-exam border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{picked.size} selected</span>
          <button onClick={toggleAll} disabled={selectable.length === 0} className="exam-action-quiet">
            {allPicked ? "Clear" : "Select all"}
          </button>
          <button onClick={assign} disabled={busy || picked.size === 0 || !slotId}
                  className="exam-action-primary">
            {busy ? "Adding…" : `Add ${picked.size} to this exam`}
          </button>
        </div>
      </div>

      {!slotId && (
        <div className="mb-4 rounded-exam border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          Choose a slot above first — candidates are enrolled into a particular sitting.
        </div>
      )}

      <div className="overflow-hidden rounded-exam border border-gray-200 bg-white">
        <ul className="divide-y divide-gray-100">
          {shown.map((p) => {
            const here = alreadyHere(p);
            const others = (p.exams || []).filter((e) => String(e.examId) !== String(examId));
            return (
              <li key={p.studentId}>
                <label className={`flex items-start gap-3 px-5 py-3 ${here ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
                  <input
                    type="checkbox"
                    disabled={here}
                    checked={here || picked.has(p.studentId)}
                    onChange={() => toggle(p.studentId)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      <span className="mono">{p.hallTicket}</span>
                      <span className="ml-2 font-normal text-gray-700">{p.name}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {here
                        ? "Already in this exam"
                        : others.length
                          ? `Also sitting: ${others.map((e) => e.examTitle).join(", ")}`
                          : "Not in any other exam"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-gray-500">
              No candidate matches that search.
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
