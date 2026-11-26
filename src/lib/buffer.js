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
