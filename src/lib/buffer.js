/**
 * Late entry, in minutes after a sitting opens.
 *
 * A candidate may start any time up to (opening + buffer), and each gets the
 * full duration from the moment they start. Stored as the slot's end time, so
 * the server's entry check is unchanged: this only decides what that end is.
 */

/** 10% of the paper's duration, at least one minute. */
export const defaultBuffer = (durationMinutes) =>
  Math.max(1, Math.round((Number(durationMinutes) || 0) * 0.1));

/** The buffer to use: what the admin typed, or the 10% default when blank. */
export const effectiveBuffer = (typed, durationMinutes) => {
  const n = Number(typed);
  return typed === "" || typed == null || !Number.isFinite(n) ? defaultBuffer(durationMinutes) : n;
};

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" for a local Date: what the server and datetime-local inputs take. */
export const toLocalStamp = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The last moment to enter, as a local stamp, or null if the opening is incomplete. */
export const lastEntry = (openStamp, bufferMinutes) => {
  if (!openStamp) return null;
  const d = new Date(openStamp);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalStamp(new Date(d.getTime() + Number(bufferMinutes) * 60000));
};

/** Whole minutes between two stamps; the buffer an existing slot already has. */
export const minutesBetween = (fromStamp, toStamp) =>
  Math.round((new Date(toStamp) - new Date(fromStamp)) / 60000);

/** "5:06 PM" for a stamp. */
export const timeOf = (stamp) =>
  new Date(stamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * How a sitting reads to staff: "26 Nov · 10:30 PM – 10:40 PM · entry until 10:35 PM".
 *
 * A slot stores its start and its last entry, and showing those two as
 * "10:30 – 10:35" read as a five-minute exam. The exam's own span is the
 * start plus the paper's duration; the last entry is said as what it is.
 * Without a duration, the start and the last entry are labelled plainly.
 */
export const sittingLabel = (slot, durationMinutes) => {
  if (!slot?.startTime) return "";
  const day = new Date(slot.startTime).toLocaleDateString([], { day: "numeric", month: "short" });
  const minutes = Number(durationMinutes);
  const span = minutes > 0
    ? `${timeOf(slot.startTime)} – ${timeOf(new Date(new Date(slot.startTime).getTime() + minutes * 60000))}`
    : `starts ${timeOf(slot.startTime)}`;
  return `${day} · ${span}${slot.endTime ? ` · entry until ${timeOf(slot.endTime)}` : ""}`;
};
