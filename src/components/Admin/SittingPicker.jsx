import React from "react";
import { FiCalendar, FiClock, FiTrash2, FiSunrise, FiSun, FiSunset, FiUserPlus } from "react-icons/fi";
import { defaultBuffer, effectiveBuffer, lastEntry, timeOf } from "../../lib/buffer";

const plus = (stamp, minutes) => timeOf(new Date(new Date(stamp).getTime() + minutes * 60000));

/**
 * When one batch sits.
 *
 * An exam sitting is a date, the time it opens, and how late a candidate may
 * still come in: the buffer. Everyone gets the full duration from the moment
 * they start, so the buffer is the only thing that decides how long the hall
 * stays busy. It starts at 10% of the duration (6 minutes for an hour's
 * paper) and is the admin's to change.
 *
 * The presets set the opening time for the shifts colleges actually run.
 */

const PRESETS = [
  { label: "Morning",   from: "09:00", Icon: FiSunrise },
  { label: "Afternoon", from: "14:00", Icon: FiSun },
  { label: "Evening",   from: "17:00", Icon: FiSunset },
];

export default function SittingPicker({ index, sitting, duration, onChange, onRemove, canRemove }) {
  // The date, start and buffer are held as they are typed rather than being
  // derived back out of a combined timestamp. Deriving them meant a date
  // entered before any time was silently discarded — the combined value is
  // empty until both halves exist — so the field cleared itself and the
  // presets stayed disabled no matter what was chosen.
  //
  // A blank buffer means "the default", so it follows the duration as that is
  // edited, until the admin types a number of their own.
  const { date = "", from = "", buffer = "" } = sitting;

  const minutes = effectiveBuffer(buffer, duration);
  const valid = Number.isInteger(minutes) && minutes >= 1;
  const until = date && from && valid ? lastEntry(`${date}T${from}`, minutes) : null;

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
            <FiClock /> Starts
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
            <FiUserPlus /> Buffer (min)
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={buffer}
            placeholder={String(defaultBuffer(duration))}
            onChange={(e) => onChange({ buffer: e.target.value })}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm tabular outline-none focus:border-indigo-500"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ from: p.from })}
            disabled={!date}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold
                       text-gray-600 transition-colors hover:border-indigo-400 hover:text-indigo-700
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            <p.Icon /> {p.label}
          </button>
        ))}

        <span className={`ml-auto text-xs font-semibold ${valid ? "text-gray-500" : "text-red-600"}`}>
          {!valid
            ? "Buffer must be at least 1 minute"
            : until
              ? `Exam ${timeOf(`${date}T${from}`)} – ${plus(`${date}T${from}`, Number(duration) || 0)}`
                + ` · entry until ${timeOf(until)}`
              : `${minutes} min late entry${buffer === "" ? " (10% of duration)" : ""}`}
        </span>
      </div>
    </div>
  );
}
