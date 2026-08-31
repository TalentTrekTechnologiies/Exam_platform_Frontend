import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useExam } from "../../contexts/ExamContext";
import { examApi, uploadUrl } from "../../lib/api";
import { createFaceWatch } from "../../lib/faceWatch";
import { createFrameSender } from "../../lib/proctorFrames";
import Timer from "../../components/Exam/Timer";
import QuestionPalette from "../../components/Exam/QuestionPalette";
import QuestionPanel from "../../components/Exam/QuestionPanel";
import SubmitSummary from "../../components/Exam/SubmitSummary";
import { FiAlertCircle, FiMaximize, FiWifiOff, FiGrid, FiX } from "react-icons/fi";

const MAX_WARNINGS = 3;

/**
 * How long after a counted strike further departures are treated as the same
 * one.
 *
 * A single press of Escape is not a single event. It leaves fullscreen, which
 * raises fullscreenchange; several browsers raise a window blur alongside it,
 * and a visibilitychange behind that. Counted separately, one key press was
 * three strikes and the paper closed on a candidate's first mistake rather
 * than their third — exactly the accident the three-warning rule exists to
 * forgive. Every event is still logged for the invigilator; only the strike
 * is debounced.
 */
const STRIKE_WINDOW_MS = 3000;

/**
 * Fullscreen, asked of the document rather than assumed.
 *
 * Every browser answers one of these; a build that only checks the unprefixed
 * property believes a prefixed browser is windowed — or worse, believes it is
 * fullscreen when it is not.
 */
const inFullscreen = () => !!(
  document.fullscreenElement
  || document.webkitFullscreenElement
  || document.mozFullScreenElement
  || document.msFullscreenElement
);

// Only the unprefixed event was listened for, so on a browser that emits just
// its prefixed name, leaving fullscreen raised nothing at all.
const FS_EVENTS = [
  "fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange",
];

// Checked every second regardless of events. Escape is handled by the browser
// itself and cannot be prevented, so catching the exit is the whole defence —
// and it must not depend on an event some browser may never send.
const FULLSCREEN_POLL_MS = 1000;

const initialsOf = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "—";

const formatLeft = (seconds) => {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} minutes`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Overlays
// ─────────────────────────────────────────────────────────────────────────────

const Curtain = ({ tone = "chrome", icon, title, children, action }) => (
  <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 p-6
                   text-center ${tone === "chrome" ? "bg-chrome" : "bg-chrome"}`}>
    <div className="grid h-16 w-16 place-items-center rounded-exam bg-white/10 text-3xl text-white">
      {icon}
    </div>
    <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
    <div className="max-w-sm text-sm leading-relaxed text-gray-400">{children}</div>
    {action}
  </div>
);

const FullscreenGate = ({ onEnter, error }) => (
  <Curtain
    icon={<FiMaximize />}
    title="Fullscreen required"
    action={
      <button onClick={onEnter} className="exam-action-primary mt-2 px-8 py-3">
        Enter fullscreen &amp; continue
      </button>
    }
  >
    This examination must be taken in fullscreen. Your time has already started.
    {error && <p className="mt-3 font-medium text-red-400">{error}</p>}
  </Curtain>
);

/**
 * The ten seconds between a candidate's last strike and their paper closing.
 *
 * `onDone` arrives as an inline arrow from the render below, so it is a new
 * function on every render — and this page re-renders once a second, because
 * the exam clock ticks once a second. With that callback in the effect's
 * dependency list, every tick tore the countdown's interval down and started a
 * fresh one, which the following tick tore down in turn. The interval rarely
 * survived a full second, so the count sat at ten and the submit never came:
 * candidates were held on "Auto-submitting in 10s" for the rest of the sitting
 * while the invigilator's monitor still showed them writing, their flag count
 * climbing with nothing ever closing the paper.
 *
 * The callback is held in a ref instead, so the interval depends only on
 * whether the countdown is armed and, once started, runs to the end.
 */
const useAutoSubmitCountdown = (armed, onDone, seconds = 10) => {
  const [countdown, setCountdown] = useState(seconds);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  useEffect(() => {
    if (!armed) return undefined;
    setCountdown(seconds);
    let left = seconds;
    const t = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) { clearInterval(t); done.current(); }
    }, 1000);
    return () => clearInterval(t);
  }, [armed, seconds]);

  return countdown;
};

const ViolationCurtain = ({ count, max, onReEnter, onAutoSubmit }) => {
  const final = count >= max;
  const countdown = useAutoSubmitCountdown(final, onAutoSubmit);

  return (
    <Curtain
      icon={<FiAlertCircle />}
      title={final ? "Your exam is being submitted" : `Warning ${count} of ${max}`}
      action={!final && (
        <button onClick={onReEnter} className="exam-action-primary mt-2 px-8 py-3">
          Return to fullscreen
        </button>
      )}
    >
      {final
        ? <>Exam rules were violated {max} times. Submitting in <span className="font-semibold text-red-400 tabular">{countdown}s</span>.</>
        : "You left fullscreen. Return to continue — the clock is still running."}
    </Curtain>
  );
};

const WarningDialog = ({ count, max, reason, onDismiss, onAutoSubmit }) => {
  const final = count >= max;
  const countdown = useAutoSubmitCountdown(final, onAutoSubmit);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-chrome/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-exam bg-white shadow-2xl">
        <div className="border-t-4 border-amber-500 px-8 py-7 text-center">
          <FiAlertCircle className="mx-auto mb-4 text-3xl text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            {final ? `Auto-submitting in ${countdown}s` : `Warning ${count} of ${max}`}
          </h3>
          <p className="mt-2 text-sm text-gray-600">{reason}</p>
          {!final && (
            <p className="mt-3 text-xs text-gray-400">
              {max - count} more will end your exam automatically.
            </p>
          )}
        </div>
        {!final && (
          <div className="border-t border-gray-200 bg-gray-50 px-8 py-4">
            <button onClick={onDismiss} className="exam-action-primary w-full py-3">
              I understand
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const Exam = () => {
  const navigate = useNavigate();
  const {
    attemptId, questions, answers, remainingSeconds, status, error, syncState,
    strikes, recordViolation, saveAnswer, clearAnswer, toggleMarkForReview,
    markVisited, submitExam, setExpiryHandler,
    statusOf, sections, counts, markedForReview,
  } = useExam();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [examInfo, setExamInfo] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [fsError, setFsError] = useState("");
  const [warning, setWarning] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cameraStatus, setCameraStatus] = useState(null);

  const started = useRef(false);
  const submittingRef = useRef(false);
  const reEntering = useRef(false);
  const fullscreenUnavailable = useRef(false);
  const outsideFullscreen = useRef(false);
  const lastStrikeAt = useRef(0);
  // Mirrors `blocked` for the callbacks below, which are built once and would
  // otherwise close over a stale value.
  const blockedRef = useRef(false);
  const mediaStream = useRef(null);
  const frameSender = useRef(null);
  const faceWatch = useRef(null);

  // A callback ref rather than useRef, because the self-view mounts long after
  // the camera is asked for and a plain ref cannot say when. Held in state so
  // that arrival re-runs the effect that attaches the picture. `setVideoEl`
  // comes from useState and so is stable — an inline arrow here would be a new
  // ref callback every render, detaching and reattaching the stream each time.
  const [videoEl, setVideoEl] = useState(null);
  const [stream, setStream] = useState(null);

  const candidateName = localStorage.getItem("studentName") || "Candidate";
  const hallTicket = localStorage.getItem("hallTicket") || "";

  const currentQuestion = questions[currentIndex];
  const currentSection = sections.find((s) => s.indices.includes(currentIndex));

  // ── Guards ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!attemptId) navigate("/verify", { replace: true });
  }, [attemptId, navigate]);

  useEffect(() => {
    if (status === "SUBMITTED") navigate("/result", { replace: true });
  }, [status, navigate]);

  // Landing on a question is what makes it "visited" rather than "not visited".
  useEffect(() => {
    if (currentQuestion?.id) markVisited(currentQuestion.id);
  }, [currentQuestion?.id, markVisited]);

  useEffect(() => {
    const examId = localStorage.getItem("student_examId");
    if (examId) examApi.examInfo(examId).then(setExamInfo).catch(() => setExamInfo(null));
  }, []);

  // ── Camera / mic ─────────────────────────────────────────────────────────

  /**
   * Getting hold of the camera, which is not the same moment as showing it.
   *
   * Permission is asked for as soon as the exam details load — while the
   * candidate is still on the fullscreen gate, which returns early, so the
   * paper and the self-view in its right rail do not exist yet. The stream was
   * attached inside this promise behind `if (videoRef.current)`, and on a
   * machine that remembers the permission getUserMedia resolves in
   * milliseconds, long before anybody clicks Enter. The ref was null, the
   * guard skipped the lot without a word, and the effect never ran again: the
   * candidate sat the whole paper looking at an empty black box. The same
   * block also started the face watch and the frames the invigilator watches,
   * so neither of those ever ran either.
   *
   * So this only acquires. Attaching is the effect below, which waits for both
   * halves and does not care which arrives first.
   */
  useEffect(() => {
    if (!examInfo || (!examInfo.enableCamera && !examInfo.enableMic)) return undefined;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: !!examInfo.enableCamera, audio: !!examInfo.enableMic })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        mediaStream.current = s;
        setStream(s);
      })
      // Only a refused or absent camera reaches here now, which is the one
      // thing /blocked is meant to explain.
      .catch(() => { if (!cancelled) navigate("/blocked", { replace: true }); });

    return () => {
      cancelled = true;
      mediaStream.current?.getTracks().forEach((t) => t.stop());
      mediaStream.current = null;
      setStream(null);
    };
  }, [examInfo, navigate]);

  /**
   * Shows the candidate their own camera, and starts the two watchers that
   * read from it.
   *
   * Runs when the stream and the <video> are both present, in whichever order
   * that happens — the candidate granting the camera before entering
   * fullscreen, or after. It runs again if the paper is unmounted and comes
   * back, which is what a fullscreen violation curtain does.
   */
  useEffect(() => {
    if (!stream || !videoEl || !examInfo?.enableCamera) return undefined;

    videoEl.srcObject = stream;
    // Muted autoplay is permitted everywhere, but Safari still wants asking,
    // and a rejected play() must not become an unhandled rejection.
    Promise.resolve(videoEl.play?.()).catch(() => {});

    let watch = null;
    let sender = null;
    try {
      // Observation only. This records what the camera sees for an
      // invigilator to review; it can never end the candidate's exam.
      watch = createFaceWatch({
        videoEl,
        attemptId,
        onStatus: (s) => setCameraStatus(s.state),
      });
      watch.start();

      // The invigilator's view of this seat. Independent of faceWatch:
      // one decides whether to raise a flag, the other simply shows a
      // person what the camera sees.
      sender = createFrameSender({
        videoEl,
        attemptId,
        // A camera that is covered or unlit is logged for the invigilator.
        // Not a strike: a weak bulb is not cheating, and this must never
        // end anybody's exam by itself.
        onObservation: (type, detail) => recordViolation(type, detail),
      });
      sender.start();
    } catch {
      // Invigilation is subordinate to the exam. If a watcher cannot start,
      // the candidate still has their paper and still has their self-view.
    }

    faceWatch.current = watch;
    frameSender.current = sender;

    return () => {
      // The frame sender used to be left running: its interval outlived the
      // page and went on capturing from a video that was no longer there.
      watch?.stop();
      sender?.stop();
      faceWatch.current = null;
      frameSender.current = null;
      if (videoEl.srcObject === stream) videoEl.srcObject = null;
    };
  }, [stream, videoEl, examInfo, attemptId, recordViolation]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const goTo = useCallback((index) => {
    setCurrentIndex(Math.max(0, Math.min(index, questions.length - 1)));
    setShowPalette(false);
  }, [questions.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
  }, [questions.length]);

  /**
   * "Save & Next" — the answer is already persisted the moment an option is
   * chosen, so this only advances. Candidates still expect the button, and its
   * absence reads as "my answer wasn't saved".
   */
  const saveAndNext = useCallback(() => next(), [next]);

  const markAndNext = useCallback(() => {
    if (currentQuestion?.id) toggleMarkForReview(currentQuestion.id);
    next();
  }, [currentQuestion, toggleMarkForReview, next]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (reason = "candidate submitted") => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");

    const result = await submitExam(reason);

    if (!result.ok) {
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitError(result.message || "Could not submit. Check your connection and try again.");
      return;
    }

    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* already out */ }
    navigate("/result", { replace: true });
  }, [submitExam, navigate]);

  useEffect(() => {
    setExpiryHandler(() => handleSubmit("auto-submit: time expired"));
  }, [setExpiryHandler, handleSubmit]);

  // ── Fullscreen & proctoring ──────────────────────────────────────────────
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen
             || el.mozRequestFullScreen || el.msRequestFullscreen;

    if (!req) {
      // Kiosk browsers may not expose the API; blocking entry would strand the
      // candidate, so let them through in windowed mode. Recorded, so the
      // watchdog below does not spend the exam reporting a fullscreen that was
      // never there to leave.
      fullscreenUnavailable.current = true;
      setFsError("Fullscreen is unavailable here. Continuing in windowed mode.");
      started.current = true;
      setIsFullscreen(true);
      return;
    }

    reEntering.current = true;
    Promise.resolve(req.call(el))
      .then(async () => {
        // The prefixed implementations return undefined rather than a promise,
        // so the call resolving says nothing about whether it worked. That was
        // being taken as success: the candidate was treated as sitting a locked
        // fullscreen exam while their browser had stayed windowed throughout,
        // and nothing they did afterwards counted as a breach.
        for (let i = 0; i < 12 && !inFullscreen(); i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!inFullscreen()) throw new Error("fullscreen did not take effect");

        outsideFullscreen.current = false;
        setIsFullscreen(true);
        blockedRef.current = false;
        setBlocked(false);
        setFsError("");
        started.current = true;
        setTimeout(() => { reEntering.current = false; }, 800);
      })
      .catch(() => {
        reEntering.current = false;
        setIsFullscreen(false);
        setFsError("Your browser blocked fullscreen. Allow it and try again.");
      });
  }, []);

  const flagViolation = useCallback((reason, kind = "dialog", type = "APP_SWITCH") => {
    if (!started.current || submittingRef.current || reEntering.current || status !== "READY") return;

    /*
     * One departure is one strike, however many events report it.
     *
     * Two things stop a single Escape becoming three: a short window after any
     * counted strike, and the curtain itself. A candidate already looking at
     * "return to fullscreen" is outside the exam by definition, so the blur
     * events that follow them clicking around are the same departure, not new
     * ones. They are still recorded for the invigilator — only uncounted.
     */
    const now = Date.now();
    const sameDeparture = blockedRef.current || now - lastStrikeAt.current < STRIKE_WINDOW_MS;

    // The type is what the invigilator's audit report groups by.
    const count = recordViolation(type, reason, !sameDeparture);
    if (!sameDeparture) lastStrikeAt.current = now;

    if (kind === "fullscreen") {
      blockedRef.current = true;
      setBlocked(true);
    } else if (!sameDeparture) {
      setWarning({ count, reason });
    }
  }, [recordViolation, status]);

  /**
   * The exam is under lock from the moment it is on screen.
   *
   * This flag was set only by the button on the fullscreen gate, and every
   * protection downstream reads it first. A candidate who reached fullscreen
   * any other way — F11 on the gate screen is enough on some browsers — passed
   * the gate with it still unset and sat the whole paper with Escape, copy,
   * paste and the developer tools all working normally. That is what the few
   * candidates were doing.
   */
  useEffect(() => {
    if (status === "READY" && (isFullscreen || inFullscreen())) started.current = true;
  }, [status, isFullscreen]);

  /**
   * One departure from fullscreen, one warning.
   *
   * Both the event and the watchdog below report the same exit, and the
   * watchdog keeps reporting it for as long as the candidate is outside.
   * Counted naively that is three strikes within three seconds — a candidate
   * who catches Escape with their thumb would have their paper auto-submitted
   * before they could read the message asking them to come back. The exit is
   * counted once and not counted again until fullscreen has been regained.
   */
  const noteFullscreenState = useCallback((full) => {
    setIsFullscreen(full);
    if (full) { outsideFullscreen.current = false; return; }
    if (outsideFullscreen.current) return;
    if (!started.current || submittingRef.current || reEntering.current) return;
    outsideFullscreen.current = true;
    flagViolation("You exited fullscreen.", "fullscreen", "FULLSCREEN_EXIT");
  }, [flagViolation]);

  useEffect(() => {
    const onFsChange = () => noteFullscreenState(inFullscreen());
    const onVisibility = () => {
      if (document.hidden) flagViolation("You switched tabs or minimised the window.", "dialog", "TAB_SWITCH");
    };
    const onBlur = () => flagViolation("You switched to another application.", "dialog", "APP_SWITCH");

    FS_EVENTS.forEach((ev) => document.addEventListener(ev, onFsChange));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      FS_EVENTS.forEach((ev) => document.removeEventListener(ev, onFsChange));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [flagViolation, noteFullscreenState]);

  /**
   * The watchdog: asks the document once a second whether it is still
   * fullscreen, whatever any event did or did not say.
   *
   * Escape leaves fullscreen at the browser level and no page can prevent it,
   * so the exit has to be noticed rather than stopped. Relying on the event
   * alone left candidates on browsers that never sent one writing on in a
   * plain window, pressing Escape as often as they liked.
   */
  useEffect(() => {
    if (status !== "READY" || fullscreenUnavailable.current) return undefined;
    const t = setInterval(() => noteFullscreenState(inFullscreen()), FULLSCREEN_POLL_MS);
    return () => clearInterval(t);
  }, [status, noteFullscreenState]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (status !== "READY") return undefined;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!started.current || status !== "READY") return;

      // A dead key or an IME composition can arrive with no key at all, and
      // calling toLowerCase() on it threw — taking the rest of this handler,
      // including the shortcut blocking below, down with it.
      const key = typeof e.key === "string" ? e.key : "";
      const lower = key.toLowerCase();

      /*
       * The keyboard is closed except for the keys the paper itself uses.
       *
       * This was a list of keys to block, which is the wrong way round: every
       * shortcut nobody had thought of was allowed, and the list had already
       * grown F-keys, clipboard combinations and the two Insert shortcuts as
       * each was noticed. A multiple-choice paper needs four number keys and
       * two arrows; everything else can go, and anything new a browser invents
       * is closed by default rather than after somebody finds it.
       *
       * Escape is the exception it has to be. No page can stop it leaving
       * fullscreen -- the browser handles it above the document, and
       * preventDefault here does not reach that -- which is why departing
       * fullscreen is watched for and forgiven twice rather than prevented.
       */
      const ALLOWED = new Set([
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "1", "2", "3", "4",
        // Enter and space activate whatever option has focus, which is how the
        // paper is sat without a mouse at all.
        "Enter", " ", "Spacebar",
        "Tab",
      ]);

      const bare = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!bare || !ALLOWED.has(key)) e.preventDefault();

      if (showSummary) return;
      if (key === "ArrowRight") next();
      if (key === "ArrowLeft") setCurrentIndex((i) => Math.max(i - 1, 0));

      // 1–4 selects an option, the way a practised candidate works a paper.
      const slot = Number(key);
      if (slot >= 1 && slot <= 4 && currentQuestion?.options?.[slot - 1]) {
        saveAnswer(currentQuestion.id, currentQuestion.options[slot - 1].id);
      }
    };

    // Capture, so a handler on the question itself cannot swallow the event
    // before this one is reached.
    const prevent = (e) => { if (started.current && status === "READY") e.preventDefault(); };
    const events = [
      "contextmenu", "copy", "cut", "paste",
      // Selecting the text and dragging it into another window copies it
      // without ever raising a copy event, which left the paper walkable out
      // of the browser entirely.
      "dragstart", "selectstart",
    ];

    document.addEventListener("keydown", onKeyDown, true);
    events.forEach((ev) => document.addEventListener(ev, prevent, true));
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      events.forEach((ev) => document.removeEventListener(ev, prevent, true));
    };
  }, [status, showSummary, next, currentQuestion, saveAnswer]);

  /**
   * Nothing on the paper is selectable while it is being sat.
   *
   * Blocking the copy event alone still let a candidate sweep the question
   * text and take it with a browser menu or a drag; with no selection to
   * begin with there is nothing for any of those routes to carry. The paper
   * is multiple choice, so no candidate needs to select text to answer it.
   */
  useEffect(() => {
    if (status !== "READY") return undefined;
    const body = document.body;
    const previous = {
      user: body.style.userSelect,
      webkit: body.style.webkitUserSelect,
      touch: body.style.webkitTouchCallout,
    };
    body.style.userSelect = "none";
    body.style.webkitUserSelect = "none";
    body.style.webkitTouchCallout = "none";
    return () => {
      body.style.userSelect = previous.user;
      body.style.webkitUserSelect = previous.webkit;
      body.style.webkitTouchCallout = previous.touch;
    };
  }, [status]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (status === "LOADING" || status === "IDLE") {
    return (
      <div className="grid h-screen place-items-center text-sm font-medium text-gray-500">
        Loading your paper…
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <FiAlertCircle className="text-4xl text-status-unanswered" />
        <h1 className="text-lg font-semibold text-gray-900">We couldn&apos;t load your exam</h1>
        <p className="max-w-md text-sm text-gray-500">{error}</p>
        <button onClick={() => window.location.reload()} className="exam-action-primary px-6">
          Try again
        </button>
      </div>
    );
  }

  if (!isFullscreen && !started.current) {
    return <FullscreenGate onEnter={enterFullscreen} error={fsError} />;
  }

  if (blocked) {
    return (
      <ViolationCurtain
        count={strikes}
        max={MAX_WARNINGS}
        onReEnter={enterFullscreen}
        onAutoSubmit={() => handleSubmit("auto-submit: repeated fullscreen violations")}
      />
    );
  }

  if (!questions.length) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <FiAlertCircle className="text-4xl text-amber-500" />
        <h1 className="text-lg font-semibold text-gray-900">This exam has no questions</h1>
        <p className="text-sm text-gray-500">Please contact your invigilator.</p>
      </div>
    );
  }

  const answered = Boolean(answers[currentQuestion?.id]);

  return (
    <div className="fixed inset-0 flex h-screen w-screen flex-col overflow-hidden bg-gray-50"
         style={{ userSelect: "none" }}>

      {warning && (
        <WarningDialog
          count={warning.count}
          max={MAX_WARNINGS}
          reason={warning.reason}
          onDismiss={() => setWarning(null)}
          onAutoSubmit={() => handleSubmit("auto-submit: repeated violations")}
        />
      )}

      {showSummary && (
        <SubmitSummary
          sections={sections}
          counts={counts}
          questionCount={questions.length}
          timeLeftLabel={formatLeft(remainingSeconds)}
          error={submitError}
          busy={submitting}
          onCancel={() => setShowSummary(false)}
          onConfirm={() => handleSubmit()}
        />
      )}

      {syncState === "offline" && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-6 py-1.5 text-[13px] font-medium text-amber-950">
          <FiWifiOff /> Connection lost — your answers are saved and will sync automatically.
        </div>
      )}

      {/* ── Masthead ────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-6 bg-chrome px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {examInfo?.collegeLogo && (
            <img
              src={uploadUrl(examInfo.collegeLogo)}
              alt=""
              className="h-8 w-8 shrink-0 rounded bg-white/95 object-contain p-0.5"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[13px] font-semibold leading-tight text-white">
              {examInfo?.title || "Examination"}
            </h1>
            <p className="truncate text-[11px] leading-tight text-gray-400">
              {examInfo?.collegeName || ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="exam-label text-gray-400">Time left</div>
          </div>
          <Timer seconds={remainingSeconds} />
          <button
            onClick={() => setShowPalette((v) => !v)}
            className="rounded-exam p-2 text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="Toggle question palette"
          >
            {showPalette ? <FiX /> : <FiGrid />}
          </button>
        </div>
      </header>

      {/* ── Section tabs ────────────────────────────────────────────────── */}
      {sections.length > 1 && (
        <nav className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-gray-200 bg-white px-4 lg:px-6">
          {sections.map((section) => {
            const active = currentSection?.startIndex === section.startIndex;
            return (
              <button
                key={`${section.name}-${section.startIndex}`}
                onClick={() => goTo(section.startIndex)}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-5 py-3 text-[13px] font-semibold
                            transition-colors duration-150
                            ${active
                              ? "border-primary-700 text-primary-800"
                              : "border-transparent text-gray-500 hover:text-gray-800"}`}
              >
                {section.name}
                <span className="ml-2 text-[11px] font-medium text-gray-400 tabular">
                  {section.tally.answered + section.tally.answeredMarked}/{section.total}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Paper ─────────────────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex-1 overflow-y-auto px-5 py-8 lg:px-12 lg:py-10">
            <QuestionPanel
              question={currentQuestion}
              currentAnswer={answers[currentQuestion?.id]}
              onAnswer={(option) => saveAnswer(currentQuestion.id, option)}
              disabled={status !== "READY"}
            />
          </div>

          {/* ── Action bar ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={markAndNext} className="exam-action-review">
                  {markedForReview[currentQuestion?.id] ? "Unmark & Next" : "Mark for Review & Next"}
                </button>
                <button
                  onClick={() => clearAnswer(currentQuestion.id)}
                  disabled={!answered}
                  className="exam-action-quiet"
                >
                  Clear Response
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
                  disabled={currentIndex === 0}
                  className="exam-action-quiet"
                >
                  ← Previous
                </button>
                <button
                  onClick={saveAndNext}
                  disabled={currentIndex === questions.length - 1}
                  className="exam-action-primary"
                >
                  Save &amp; Next →
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ── Right rail ────────────────────────────────────────────────── */}
        <aside className={`w-full shrink-0 flex-col border-l border-gray-200 bg-white lg:flex lg:w-[19rem]
                           ${showPalette ? "absolute inset-0 z-20 flex lg:relative" : "hidden"}`}>

          <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-5 py-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-exam
                            bg-chrome text-sm font-semibold text-white">
              {initialsOf(candidateName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-gray-900">{candidateName}</p>
              <p className="truncate text-xs leading-tight text-gray-500 tabular">{hallTicket}</p>
            </div>
          </div>

          {examInfo?.enableCamera && (
            /* Shown properly, not as a 48px square in the header. A candidate
               who cannot see their own camera cannot tell that it is covered,
               aimed at the ceiling, or showing an unlit room - and the first
               they would hear of it is being questioned afterwards. */
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <div className="relative overflow-hidden rounded-exam bg-chrome">
                <video
                  data-camera-status={cameraStatus || "off"}
                  ref={setVideoEl}
                  autoPlay muted playsInline
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Camera on
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-gray-500">
                Your invigilator can see this. Keep your face visible and well lit.
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <QuestionPalette
              questions={questions}
              sections={sections}
              counts={counts}
              statusOf={statusOf}
              currentIndex={currentIndex}
              onQuestionClick={goTo}
            />
          </div>

          <div className="shrink-0 border-t border-gray-200 px-5 py-4">
            <button
              onClick={() => setShowSummary(true)}
              className="exam-action w-full border-status-unanswered bg-status-unanswered py-3 text-white hover:opacity-90"
            >
              Submit Exam
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Exam;
