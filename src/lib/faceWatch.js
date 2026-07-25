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
 * Availability is honest too. The browser's FaceDetector is not universal, so
 * where it is missing this reports that fact once and stops, rather than
 * pretending to invigilate.
 */

/** Consecutive failed checks before reporting — one blink must not be an event. */
const CONSECUTIVE_BEFORE_REPORT = 3;

/** How often to look. Slow on purpose: this is not a tracking system. */
const CHECK_INTERVAL_MS = 5000;

/** Never report the same condition more often than this. */
const REPORT_COOLDOWN_MS = 60000;

export function createFaceWatch({ videoEl, attemptId, onStatus }) {
  let detector = null;
  let timer = null;
  let stopped = false;

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
    if (stopped || !videoEl || videoEl.readyState < 2) return;

    // A black or frozen frame usually means the lens is covered or the camera
    // was taken by another application — worth an invigilator knowing.
    try {
      const faces = await detector.detect(videoEl);

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
      // Detection can throw on a frame that isn't ready; not worth reporting.
    }
  };

  return {
    async start() {
      // eslint-disable-next-line no-undef
      const Supported = typeof window !== "undefined" && window.FaceDetector;
      if (!Supported) {
        // Said plainly rather than silently doing nothing, so nobody believes
        // camera invigilation is running when it is not.
        onStatus?.({ state: "unavailable" });
        return false;
      }
      try {
        // eslint-disable-next-line no-undef
        detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      } catch {
        onStatus?.({ state: "unavailable" });
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
    },
  };
}
