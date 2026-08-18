import React, { useEffect, useState } from "react";
import { API_BASE, tokens } from "../../lib/api";
import { FiVideoOff, FiX, FiUser } from "react-icons/fi";

/**
 * What the invigilator sees of the hall.
 *
 * Stills, not streams. Five hundred live feeds is roughly 125 Mbps sustained
 * and no browser decodes five hundred videos at once — the invigilator's own
 * machine is the wall long before the network is. A picture every few seconds
 * costs about a tenth of that, draws as an ordinary grid, and answers what
 * invigilation is actually for: who is at the desk, is anyone else in the
 * room, has someone walked away.
 *
 * The images are fetched with the admin token and turned into object URLs
 * rather than being put in a plain <img src>, because the browser would send
 * no Authorization header on a bare image request and every tile would 401.
 */

/** Grid tiles: often enough to notice an empty chair, gentle on a full hall. */
const WALL_REFRESH_MS = 15000;

/** One candidate, opened deliberately — closer to watching than to checking. */
const WATCH_REFRESH_MS = 3000;

function useFrame(examId, attemptId, refreshMs, active) {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!active || !attemptId) return undefined;
    let cancelled = false;
    let current = null;

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/monitor/${examId}/frame/${attemptId}`, {
          headers: { Authorization: `Bearer ${tokens.getAdmin()}` },
          cache: "no-store",
        });
        if (!res.ok) { if (!cancelled) setMissing(true); return; }
        const blob = await res.blob();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        // Release the previous frame as the new one replaces it; a wall left
        // open for a three-hour exam would otherwise leak every frame it drew.
        if (current) URL.revokeObjectURL(current);
        current = next;
        setUrl(next);
        setMissing(false);
      } catch {
        if (!cancelled) setMissing(true);
      }
    };

    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (current) URL.revokeObjectURL(current);
    };
  }, [examId, attemptId, refreshMs, active]);

  return { url, missing };
}

function Tile({ examId, candidate, onOpen }) {
  const { url, missing } = useFrame(examId, candidate.attemptId, WALL_REFRESH_MS, true);
  const flagged = (candidate.violations || 0) > 0;

  return (
    <button
      onClick={() => onOpen(candidate)}
      className={`group overflow-hidden rounded-exam border bg-gray-900 text-left transition-colors
        ${flagged ? "border-amber-400" : "border-gray-200 hover:border-primary-600"}`}
    >
      <div className="relative aspect-[4/3] w-full bg-gray-800">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-500">
            <FiVideoOff />
            <span className="text-[10px]">{missing ? "no camera yet" : "waiting…"}</span>
          </div>
        )}
        {flagged && (
          <span className="absolute right-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {candidate.violations}
          </span>
        )}
      </div>
      <div className="bg-white px-2 py-1.5">
        <p className="truncate text-xs font-semibold text-gray-900">{candidate.hallTicket}</p>
        <p className="truncate text-[11px] text-gray-500">{candidate.name}</p>
      </div>
    </button>
  );
}

function Watch({ examId, candidate, onClose }) {
  const { url, missing } = useFrame(examId, candidate.attemptId, WATCH_REFRESH_MS, true);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-6"
         onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-exam bg-white shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">
              {candidate.name} <span className="font-normal text-gray-500">· {candidate.hallTicket}</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {candidate.state?.replace("_", " ").toLowerCase()}
              {candidate.violations ? ` · ${candidate.violations} flag(s)` : ""}
              {" · refreshing every 3s"}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <FiX />
          </button>
        </div>

        <div className="aspect-video w-full bg-gray-900">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500">
              <FiUser className="text-3xl" />
              <span className="text-sm">
                {missing ? "This candidate's camera has not sent a picture." : "Waiting for the next picture…"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CameraWall({ examId, candidates }) {
  const [watching, setWatching] = useState(null);

  // Only candidates actually sitting have a camera to show; a seat that has
  // not started, or has already submitted, is not being invigilated.
  const live = (candidates || []).filter(
    (c) => c.attemptId && (c.state === "IN_PROGRESS" || c.state === "DISCONNECTED"),
  );

  if (live.length === 0) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No candidate is sitting this exam right now. Cameras appear here as they begin.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {live.map((c) => (
          <Tile key={c.attemptId} examId={examId} candidate={c} onOpen={setWatching} />
        ))}
      </div>
      {watching && (
        <Watch examId={examId} candidate={watching} onClose={() => setWatching(null)} />
      )}
    </>
  );
}
