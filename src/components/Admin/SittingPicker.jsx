import React, { useMemo } from "react";
import { FiCalendar, FiClock, FiTrash2, FiSunrise, FiSun, FiSunset } from "react-icons/fi";

/**
 * When one batch sits.
 *
 * Two <input type="datetime-local"> fields were technically sufficient and
 * awkward in practice: each one asks for a date the admin has already given,
 * every browser renders them differently, and neither shows the thing actually
 * being decided — how long the hall is open for.
 *
 * An exam sitting is one date with a window inside it, so that is what this
 * asks for: a date, a start, an end, and the resulting length in plain words.
 * The presets cover the shifts colleges actually run.
 */

const PRESETS = [
  { label: "Morning",   from: "09:00", to: "12:00", Icon: FiSunrise },
  { label: "Afternoon", from: "14:00", to: "17:00", Icon: FiSun },
  { label: "Evening",   from: "17:00", to: "20:00", Icon: FiSunset },
];

function describe(date, from, to) {
  if (!date || !from || !to) return null;
  const ms = new Date(`${date}T${to}`) - new Date(`${date}T${from}`);
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { bad: true, text: "Ends before it starts" };
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    bad: false,
    text: `Open for ${h ? `${h} hour${h === 1 ? "" : "s"}` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`.trim(),
  };
}

export default function SittingPicker({ index, sitting, onChange, onRemove, canRemove }) {
  // The date, start and end are held as they are typed rather than being
  // derived back out of a combined timestamp. Deriving them meant a date
  // entered before any time was silently discarded — the combined value is
  // empty until both halves exist — so the field cleared itself and the
  // presets stayed disabled no matter what was chosen.
  const { date = "", from = "", to = "" } = sitting;

  const applyPreset = (p) => onChange({ from: p.from, to: p.to });

  const summary = useMemo(() => describe(date, from, to), [date, from, to]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Sitting {index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-600">
            <FiTrash2 /> Remove
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
            <FiCalendar /> Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-indigo-500"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
            <FiClock /> Opens
          </span>
          <input
            type="time"
            value={from}
            onChange={(e) => onChange({ from: e.target.value })}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm tabular outline-none focus:border-indigo-500"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
            <FiClock /> Closes
          </span>
          <input
            type="time"
            value={to}
            onChange={(e) => onChange({ to: e.target.value })}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm tabular outline-none focus:border-indigo-500"
            required
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            disabled={!date}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold
                       text-gray-600 transition-colors hover:border-indigo-400 hover:text-indigo-700
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            <p.Icon /> {p.label}
          </button>
        ))}

        {summary && (
          <span className={`ml-auto text-xs font-semibold ${summary.bad ? "text-red-600" : "text-gray-500"}`}>
            {summary.text}
          </span>
        )}
      </div>
    </div>
  );
}
