import { API_BASE, tokens } from "./api";

/**
 * Sends the invigilator a picture of the candidate every few seconds.
 *
 * Snapshots rather than a live stream, deliberately. A hall of five hundred
 * WebRTC feeds is roughly 125 Mbps sustained and no browser can decode five
 * hundred videos at once — the invigilator's machine gives out well before the
 * network does. Stills a few seconds apart cost about a tenth of that, render
 * as an ordinary grid, and answer what invigilation actually asks: who is at
 * the desk, is anyone else in the room, has someone walked away.
 *
 * Everything here is subordinate to the exam. A frame that fails to capture or
 * upload is dropped without a word: the candidate must never see an error, and
 * must never wait, because of a picture that only matters to someone else.
 */

/** Often enough to see someone leave; rare enough for a hall of 5,000. */
const DEFAULT_INTERVAL_MS = 8000;

/** Small enough that a full hall is a few Mbps, large enough to recognise a face. */
const FRAME_WIDTH = 320;
const JPEG_QUALITY = 0.5;

export function createFrameSender({ videoEl, attemptId, intervalMs = DEFAULT_INTERVAL_MS }) {
  let timer = null;
  let stopped = false;
  let inFlight = false;
  const canvas = document.createElement("canvas");

  const capture = () => {
    if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth) return null;
    const scale = FRAME_WIDTH / videoEl.videoWidth;
    canvas.width = FRAME_WIDTH;
    canvas.height = Math.round(videoEl.videoHeight * scale);
    canvas.getContext("2d").drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  };

  const send = async () => {
    // One at a time. On a slow hall connection, queuing frames would pile
    // uploads onto the same link the exam's answers travel over.
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const blob = await capture();
      if (!blob) return;
      const body = new FormData();
      body.append("attemptId", String(attemptId));
      body.append("frame", blob, "frame.jpg");
      await fetch(`${API_BASE}/student/proctor/frame`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.getStudent()}` },
        body,
      });
    } catch {
      // The invigilator misses one frame. The candidate is told nothing,
      // because nothing about their exam has gone wrong.
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      if (timer || stopped) return;
      // A first frame promptly, so a candidate appears on the monitor as soon
      // as they begin rather than after the first full interval.
      setTimeout(send, 1500);
      timer = setInterval(send, intervalMs);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
