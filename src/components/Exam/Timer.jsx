import React from "react";

/**
 * Display only. The countdown lives in ExamContext and is reconciled against the
 * server clock, so nothing here can be tampered with to buy time.
 *
 * Monospaced digits and a fixed width mean the masthead never shifts as seconds
 * tick — a jittering clock is the fastest way to make a screen feel cheap.
 */
const Timer = ({ seconds }) => {
  const known = seconds != null;
  const safe = known ? Math.max(0, seconds) : 0;

  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n) => String(n).padStart(2, "0");

  const critical = known && safe <= 60;
  const low = known && safe <= 300;

  return (
    <div
      role="timer"
      aria-live={critical ? "assertive" : "off"}
      aria-label={known ? `Time remaining: ${hrs} hours ${mins} minutes ${secs} seconds` : "Time remaining unavailable"}
      className={`rounded-exam px-3 py-1.5 text-[17px] font-semibold tabular tracking-tight
                  transition-colors duration-300
                  ${critical
                    ? "bg-status-unanswered text-white"
                    : low
                    ? "bg-amber-500 text-amber-950"
                    : "bg-white/10 text-white"}`}
    >
      {known ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : "--:--:--"}
    </div>
  );
};

export default Timer;
