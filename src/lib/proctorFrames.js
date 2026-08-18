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

/**
 * Below this average brightness there is nothing to invigilate — a lens cap, a
 * hand, a switched-off room. Set low on purpose: a dimly-lit room where a face
 * is still visible sits far above it, and accusing someone of covering their
 * camera because their bulb is weak would be worse than missing it.
 */
const DARK_THRESHOLD = 26;

/**
 * How many consecutive dark frames before it is reported. Someone passing in
 * front of the lens, or a webcam still adjusting its exposure, should not be
 * flagged; a camera that stays dark for this long is not an accident.
 */
const DARK_FRAMES_BEFORE_FLAGGING = 3;

export function createFrameSender({ videoEl, attemptId, intervalMs = DEFAULT_INTERVAL_MS, onObservation }) {
  let timer = null;
  let stopped = false;
  let inFlight = false;
  let darkRun = 0;
  let darkReported = false;
  const canvas = document.createElement("canvas");

  /**
   * Mean brightness of the frame already drawn for upload.
   *
   * Read off the same canvas, so this costs nothing extra, and it needs no
   * browser API at all — unlike face detection, which exists in only some
   * browsers and silently does nothing in the rest. A covered camera is
   * detectable everywhere.
   */
  const brightnessOf = (ctx, w, h) => {
    const { data } = ctx.getImageData(0, 0, w, h);
    let total = 0;
    let counted = 0;
    // Every 40th pixel: the average of a picture does not need all of it.
    for (let i = 0; i < data.length; i += 4 * 40) {
      total += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      counted++;
    }
    return counted ? total / counted : 255;
  };

  const capture = () => {
    if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth) return null;
    const scale = FRAME_WIDTH / videoEl.videoWidth;
    canvas.width = FRAME_WIDTH;
    canvas.height = Math.round(videoEl.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    // Judged here, where the pixels already are.
    try {
      if (brightnessOf(ctx, canvas.width, canvas.height) < DARK_THRESHOLD) {
        darkRun++;
        if (darkRun >= DARK_FRAMES_BEFORE_FLAGGING && !darkReported) {
          darkReported = true;
          onObservation?.("CAMERA_BLOCKED",
            "The camera has been dark or covered for several minutes.");
        }
      } else {
        darkRun = 0;
        darkReported = false;      // report again if it goes dark once more
      }
    } catch {
      // Reading pixels can fail on a tainted canvas. The picture still goes up,
      // and the invigilator sees the dark frame with their own eyes.
    }

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
