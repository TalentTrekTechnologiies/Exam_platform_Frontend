import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useExam } from "../../contexts/ExamContext";
import { examApi, uploadUrl } from "../../lib/api";
import { createFaceWatch } from "../../lib/faceWatch";
import Timer from "../../components/Exam/Timer";
import QuestionPalette from "../../components/Exam/QuestionPalette";
import QuestionPanel from "../../components/Exam/QuestionPanel";
import SubmitSummary from "../../components/Exam/SubmitSummary";
import { FiAlertCircle, FiMaximize, FiWifiOff, FiGrid, FiX } from "react-icons/fi";

const MAX_WARNINGS = 3;

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

const ViolationCurtain = ({ count, max, onReEnter, onAutoSubmit }) => {
  const final = count >= max;
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!final) return undefined;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); onAutoSubmit(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [final, onAutoSubmit]);

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
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!final) return undefined;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); onAutoSubmit(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [final, onAutoSubmit]);

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
    violations, recordViolation, saveAnswer, clearAnswer, toggleMarkForReview,
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
  const mediaStream = useRef(null);
  const videoRef = useRef(null);
  const frameSender = useRef(null);
  const faceWatch = useRef(null);

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
    const examId = localStorage.getItem("examId");
    if (examId) examApi.examInfo(examId).then(setExamInfo).catch(() => setExamInfo(null));
  }, []);

  // ── Camera / mic ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!examInfo || (!examInfo.enableCamera && !examInfo.enableMic)) return undefined;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: !!examInfo.enableCamera, audio: !!examInfo.enableMic })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        mediaStream.current = stream;
        if (videoRef.current && examInfo.enableCamera) {
          videoRef.current.srcObject = stream;

          // Observation only. This records what the camera sees for an
          // invigilator to review; it can never end the candidate's exam.
          faceWatch.current = createFaceWatch({
            videoEl: videoRef.current,
            attemptId,
            onStatus: (s) => setCameraStatus(s.state),
          });
          faceWatch.current.start();

          // The invigilator's view of this seat. Independent of faceWatch:
          // one decides whether to raise a flag, the other simply shows a
          // person what the camera sees.
          frameSender.current = createFrameSender({ videoEl: videoRef.current, attemptId });
          frameSender.current.start();
        }
      })
      .catch(() => { if (!cancelled) navigate("/blocked", { replace: true }); });

    return () => {
      cancelled = true;
      faceWatch.current?.stop();
      faceWatch.current = null;
      mediaStream.current?.getTracks().forEach((t) => t.stop());
      mediaStream.current = null;
    };
  }, [examInfo, navigate]);

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
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;

    if (!req) {
      // Kiosk browsers may not expose the API; blocking entry would strand the
      // candidate, so let them through in windowed mode.
      setFsError("Fullscreen is unavailable here. Continuing in windowed mode.");
      started.current = true;
      setIsFullscreen(true);
      return;
    }

    reEntering.current = true;
    Promise.resolve(req.call(el))
      .then(() => {
        setIsFullscreen(true);
        setBlocked(false);
        setFsError("");
        started.current = true;
        setTimeout(() => { reEntering.current = false; }, 800);
      })
      .catch(() => {
        reEntering.current = false;
        setFsError("Your browser blocked fullscreen. Allow it and try again.");
      });
  }, []);

  const flagViolation = useCallback((reason, kind = "dialog", type = "APP_SWITCH") => {
    if (!started.current || submittingRef.current || reEntering.current || status !== "READY") return;
    // The type is what the invigilator's audit report groups by.
    const count = recordViolation(type, reason);
    if (kind === "fullscreen") setBlocked(true);
    else setWarning({ count, reason });
  }, [recordViolation, status]);

  useEffect(() => {
    const onFsChange = () => {
      const full = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(full);
      if (!full && started.current && !submittingRef.current && !reEntering.current) {
        flagViolation("You exited fullscreen.", "fullscreen", "FULLSCREEN_EXIT");
      }
    };
    const onVisibility = () => {
      if (document.hidden) flagViolation("You switched tabs or minimised the window.", "dialog", "TAB_SWITCH");
    };
    const onBlur = () => flagViolation("You switched to another application.", "dialog", "APP_SWITCH");

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [flagViolation]);

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

      const blockedKeys = ["Escape", "F1", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "PrintScreen"];
      if (blockedKeys.includes(e.key)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "p", "s", "u"].includes(e.key.toLowerCase())) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase())) e.preventDefault();

      if (showSummary) return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setCurrentIndex((i) => Math.max(i - 1, 0));

      // 1–4 selects an option, the way a practised candidate works a paper.
      const slot = Number(e.key);
      if (slot >= 1 && slot <= 4 && currentQuestion?.options?.[slot - 1]) {
        saveAnswer(currentQuestion.id, currentQuestion.options[slot - 1].id);
      }
    };

    const prevent = (e) => { if (started.current && status === "READY") e.preventDefault(); };

    document.addEventListener("keydown", onKeyDown);
    ["contextmenu", "copy", "cut", "paste"].forEach((ev) => document.addEventListener(ev, prevent));
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      ["contextmenu", "copy", "cut", "paste"].forEach((ev) => document.removeEventListener(ev, prevent));
    };
  }, [status, showSummary, next, currentQuestion, saveAnswer]);

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
        count={violations}
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
            {examInfo?.enableCamera ? (
              <video data-camera-status={cameraStatus || "off"} ref={videoRef} autoPlay muted playsInline
                     className="h-12 w-12 shrink-0 rounded-exam bg-chrome object-cover" />
            ) : (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-exam
                              bg-chrome text-sm font-semibold text-white">
                {initialsOf(candidateName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-gray-900">{candidateName}</p>
              <p className="truncate text-xs leading-tight text-gray-500 tabular">{hallTicket}</p>
            </div>
          </div>

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
