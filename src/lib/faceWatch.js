import { api } from "./api";

/**
 * Camera-based observation during an exam.
 *
 * What this is: a periodic check of whether a face is visible in the webcam and
 * whether more than one is, reported to the server for an invigilator to review.
 *
 * What this is deliberately is NOT: grounds for ending anyone's exam. Face
 * detection is probabilistic and fails in ordinary, innocent conditions — a
 * candidate leaning out of frame to think, a dim room, a bright window behind
 * them, heavy glasses. Ending a real student's exam on that basis is a far worse
 * outcome than missing a cheat, so nothing here ever auto-submits. The server
 * agrees: camera events are excluded from the strike count.
 *
 * It used to ask the browser for `window.FaceDetector`, which desktop Chrome,
 * Edge, Firefox and Safari do not ship. On an exam-hall machine that meant this
 * reported "unavailable" and stopped — so "somebody else is in the room" was
 * never detected anywhere, while the platform gave every appearance of watching
 * for it. It now carries its own detector.
 *
 * The model is served from this application, not from Google. A college network
 * that blocks a third-party host, or a CDN having a bad afternoon, must not be
 * able to reach into a live examination — and 271 kB fetched once per machine
 * and then cached is cheaper than the dependency would be.
 */

/** Consecutive failed checks before reporting — one blink must not be an event. */
const CONSECUTIVE_BEFORE_REPORT = 3;

/** How often to look. Slow on purpose: this is not a tracking system. */
const CHECK_INTERVAL_MS = 5000;

/** Never report the same condition more often than this. */
const REPORT_COOLDOWN_MS = 60000;

/** Enough to tell "someone is leaning in" from a room with people in it. */
const MAX_FACES = 5;

/**
 * Loaded once per page, and only when a camera exam actually starts.
 *
 * A dynamic import so the detector and its backend are a separate chunk: the
 * admin console, and every exam run without a camera, never download any of it.
 */
let detectorPromise = null;

function loadDetector() {
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    const tf = await import("@tensorflow/tfjs-core");
    await import("@tensorflow/tfjs-backend-webgl");
    const faceDetection = await import("@tensorflow-models/face-detection");

    // WebGL, because the CPU backend on a hall machine takes long enough that
    // the checks would overlap each other. If it is unavailable we would rather
    // say so than quietly run something too slow to be useful.
    await tf.setBackend("webgl");
    await tf.ready();

    return faceDetection.createDetector(
      faceDetection.SupportedModels.MediaPipeFaceDetector,
      {
        runtime: "tfjs",
        modelType: "short",
        maxFaces: MAX_FACES,
        // BASE_URL, so this still resolves when the app is served under a
        // subpath such as /online/.
        detectorModelUrl: `${import.meta.env.BASE_URL}models/face-detection/model.json`,
      },
    );
  })().catch((e) => {
    // Let a later attempt retry rather than caching the failure forever.
    detectorPromise = null;
    throw e;
  });

  return detectorPromise;
}

export function createFaceWatch({ videoEl, attemptId, onStatus }) {
  let detector = null;
  let timer = null;
  let stopped = false;
  let inFlight = false;

  let missStreak = 0;
  let multiStreak = 0;
  const lastReported = { FACE_ABSENT: 0, MULTIPLE_FACES: 0, CAMERA_BLOCKED: 0 };

  const report = async (type, detail) => {
    const now = Date.now();
    if (now - (lastReported[type] || 0) < REPORT_COOLDOWN_MS) return;
    lastReported[type] = now;
    try {
      await api.post("/student/violation", { attemptId, type, detail });
    } catch {
      // An observation failing to send must never disturb the exam. The
      // candidate's answers matter; this does not.
    }
  };

  const check = async () => {
    if (stopped || !detector || !videoEl || videoEl.readyState < 2) return;

    // One inference at a time. On a slow machine the checks would otherwise
    // stack up behind each other and compete with the paper for the CPU.
    if (inFlight) return;
    inFlight = true;

    try {
      const faces = await detector.estimateFaces(videoEl, { flipHorizontal: false });

      if (faces.length === 0) {
        missStreak++;
        multiStreak = 0;
        if (missStreak === CONSECUTIVE_BEFORE_REPORT) {
          report("FACE_ABSENT", "No face visible for ~15s");
          onStatus?.({ state: "no-face" });
        }
      } else if (faces.length > 1) {
        multiStreak++;
        missStreak = 0;
        if (multiStreak === CONSECUTIVE_BEFORE_REPORT) {
          report("MULTIPLE_FACES", `${faces.length} faces visible`);
          onStatus?.({ state: "multiple-faces", count: faces.length });
        }
      } else {
        missStreak = 0;
        multiStreak = 0;
        onStatus?.({ state: "ok" });
      }
    } catch {
      // Detection can throw on a frame that isn't ready, or if the backend is
      // lost when a machine sleeps. Not worth reporting, and never worth
      // interrupting the paper for.
    } finally {
      inFlight = false;
    }
  };

  return {
    async start() {
      try {
        detector = await loadDetector();
      } catch {
        // Said plainly rather than silently doing nothing, so nobody believes
        // camera invigilation is running when it is not.
        onStatus?.({ state: "unavailable" });
        return false;
      }

      // The load is asynchronous and the candidate may have submitted, or the
      // paper unmounted, while it was in flight.
      if (stopped) {
        detector = null;
        return false;
      }

      timer = setInterval(check, CHECK_INTERVAL_MS);
      onStatus?.({ state: "watching" });
      return true;
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      // The detector is shared across the page's lifetime, so it is released
      // rather than disposed — disposing it would break a later attempt.
      detector = null;
    },
  };
}
