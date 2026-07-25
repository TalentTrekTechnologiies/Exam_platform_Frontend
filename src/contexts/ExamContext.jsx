import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { examApi, ApiError, isRetryable } from "../lib/api";

const ExamContext = createContext();
export const useExam = () => useContext(ExamContext);

/** How often we reconcile with the server clock. Between polls we tick locally. */
const CLOCK_SYNC_MS = 20000;
/** How often we retry answers that failed to reach the server. */
const FLUSH_MS = 5000;

const MARKED_KEY = (id) => `exam_marked_${id}`;
const VISITED_KEY = (id) => `exam_visited_${id}`;
const VIOLATIONS_KEY = (id) => `exam_violations_${id}`;
const PENDING_KEY = (id) => `exam_pending_${id}`;

/**
 * The five states every EAMCET / NEET / NQT candidate navigates by.
 *
 * The distinction that matters most is NOT_ANSWERED (opened and left blank)
 * versus NOT_VISITED (never opened) — in the last ten minutes of a 180-question
 * paper, that is how a candidate finds what they still have to do.
 */
export const QUESTION_STATUS = {
  ANSWERED: "answered",
  NOT_ANSWERED: "not-answered",
  MARKED: "marked",
  ANSWERED_MARKED: "answered-marked",
  NOT_VISITED: "not-visited",
};

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const ExamProvider = ({ children }) => {
  const [attemptId, setAttemptId] = useState(() => localStorage.getItem("attemptId"));
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState({});
  const [visited, setVisited] = useState({});
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [status, setStatus] = useState("IDLE"); // IDLE | LOADING | READY | SUBMITTED | ERROR
  const [error, setError] = useState(null);
  const [syncState, setSyncState] = useState("synced"); // synced | pending | offline
  const [violations, setViolations] = useState(0);

  // Answers that haven't reached the server yet: { [questionId]: option }
  const pending = useRef({});
  const submitting = useRef(false);
  const onExpiry = useRef(null);

  // ── Loading ───────────────────────────────────────────────────────────────

  const loadAttempt = useCallback(async (id) => {
    if (!id) return;
    setStatus("LOADING");
    setError(null);

    try {
      const [paper, saved, clock] = await Promise.all([
        examApi.paper(id),
        examApi.responses(id),
        examApi.remaining(id),
      ]);

      setQuestions(Array.isArray(paper) ? paper : []);
      // The server's saved responses are authoritative — this is what makes a
      // mid-exam refresh or a browser crash recoverable.
      setAnswers(saved || {});
      setRemainingSeconds(clock.remainingSeconds);
      setMarkedForReview(readJson(MARKED_KEY(id), {}));
      // Anything already answered has self-evidently been visited, so a resumed
      // session never shows an answered question as untouched.
      const restoredVisited = readJson(VISITED_KEY(id), {});
      Object.keys(saved || {}).forEach((qid) => { restoredVisited[qid] = true; });
      setVisited(restoredVisited);
      setViolations(readJson(VIOLATIONS_KEY(id), 0));
      pending.current = readJson(PENDING_KEY(id), {});
      setStatus(clock.expired ? "SUBMITTED" : "READY");
    } catch (e) {
      setError(e.message || "Could not load the exam.");
      setStatus("ERROR");
    }
  }, []);

  useEffect(() => {
    if (attemptId) loadAttempt(attemptId);
  }, [attemptId, loadAttempt]);

  // ── Answer syncing ────────────────────────────────────────────────────────

  const persistPending = useCallback(() => {
    if (!attemptId) return;
    localStorage.setItem(PENDING_KEY(attemptId), JSON.stringify(pending.current));
    setSyncState(Object.keys(pending.current).length ? "pending" : "synced");
  }, [attemptId]);

  /**
   * Pushes queued answers. Drops entries the server rejects outright (4xx).
   *
   * `force` is what submit uses. Background flushes (the interval, the `online`
   * event, each keystroke) stand down once a submit is underway — but the final
   * flush inside submitExam MUST still run, or the last answers a candidate
   * picked never reach the server before the attempt is closed. Without the
   * flag this guard silently swallowed them: exactly the lost-marks case the
   * flush exists to prevent.
   */
  const flushPending = useCallback(async ({ force = false } = {}) => {
    if (!attemptId || (submitting.current && !force)) return;
    const entries = Object.entries(pending.current);
    if (!entries.length) return;

    for (const [questionId, option] of entries) {
      try {
        await examApi.saveAnswer(Number(attemptId), Number(questionId), option);
        delete pending.current[questionId];
      } catch (e) {
        if (e instanceof ApiError && (e.code === "EXAM_ALREADY_SUBMITTED" || e.code === "EXAM_TIME_OVER")) {
          pending.current = {};
          setStatus("SUBMITTED");
          break;
        }
        if (!isRetryable(e)) {
          // The server refused this answer permanently; retrying forever helps nobody.
          delete pending.current[questionId];
          continue;
        }
        setSyncState("offline");
        break; // keep order; try again next tick
      }
    }
    persistPending();
  }, [attemptId, persistPending]);

  useEffect(() => {
    if (status !== "READY") return;
    const t = setInterval(flushPending, FLUSH_MS);
    const onOnline = () => flushPending();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, [status, flushPending]);

  const saveAnswer = useCallback((questionId, option) => {
    if (status !== "READY") return;

    // Optimistic: the candidate must never wait on the network to pick an option.
    setAnswers((prev) => {
      const next = { ...prev };
      if (option == null) delete next[questionId];
      else next[questionId] = option;
      return next;
    });

    pending.current[questionId] = option;
    persistPending();
    flushPending();
  }, [status, persistPending, flushPending]);

  const clearAnswer = useCallback((questionId) => saveAnswer(questionId, null), [saveAnswer]);

  const toggleMarkForReview = useCallback((questionId) => {
    setMarkedForReview((prev) => {
      const next = { ...prev, [questionId]: !prev[questionId] };
      if (!next[questionId]) delete next[questionId];
      if (attemptId) localStorage.setItem(MARKED_KEY(attemptId), JSON.stringify(next));
      return next;
    });
  }, [attemptId]);

  /** Records that a question has been seen. Idempotent. */
  const markVisited = useCallback((questionId) => {
    if (questionId == null) return;
    setVisited((prev) => {
      if (prev[questionId]) return prev;
      const next = { ...prev, [questionId]: true };
      if (attemptId) localStorage.setItem(VISITED_KEY(attemptId), JSON.stringify(next));
      return next;
    });
  }, [attemptId]);

  /**
   * Records a proctoring violation.
   *
   * Kept locally so the warning count survives a refresh, AND reported to the
   * server so an invigilator has an auditable record — local storage alone is
   * evidence a candidate can erase.
   */
  const recordViolation = useCallback((type = "APP_SWITCH", detail = "") => {
    let next = 0;
    setViolations((prev) => {
      next = prev + 1;
      if (attemptId) localStorage.setItem(VIOLATIONS_KEY(attemptId), JSON.stringify(next));
      return next;
    });

    // Fire and forget — never let logging block or fail the exam.
    if (attemptId) examApi.reportViolation(Number(attemptId), type, next, detail);
    return next;
  }, [attemptId]);

  // ── Clock ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (status !== "READY" || !attemptId) return;

    const sync = async () => {
      try {
        const clock = await examApi.remaining(attemptId);
        setRemainingSeconds(clock.remainingSeconds);
        if (clock.expired && onExpiry.current) onExpiry.current();
      } catch {
        // Offline: keep ticking locally and reconcile on the next successful poll.
      }
    };

    const syncTimer = setInterval(sync, CLOCK_SYNC_MS);
    const tickTimer = setInterval(() => {
      setRemainingSeconds((s) => (s == null ? s : Math.max(0, s - 1)));
    }, 1000);

    return () => {
      clearInterval(syncTimer);
      clearInterval(tickTimer);
    };
  }, [status, attemptId]);

  useEffect(() => {
    if (status === "READY" && remainingSeconds === 0 && onExpiry.current) onExpiry.current();
  }, [remainingSeconds, status]);

  const setExpiryHandler = useCallback((fn) => { onExpiry.current = fn; }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const submitExam = useCallback(async (reason = "candidate submitted") => {
    if (!attemptId || submitting.current) return { ok: true };
    submitting.current = true;

    try {
      // Land every outstanding answer before closing the attempt, so a flaky
      // connection in the last seconds can't silently cost marks. `force`
      // overrides the guard we just set on submitting.current above.
      await flushPending({ force: true });
      await examApi.submit(attemptId, reason);

      localStorage.removeItem(PENDING_KEY(attemptId));
      localStorage.removeItem(MARKED_KEY(attemptId));
      localStorage.removeItem(VISITED_KEY(attemptId));
      localStorage.removeItem(VIOLATIONS_KEY(attemptId));
      setStatus("SUBMITTED");
      return { ok: true };
    } catch (e) {
      // Already submitted (by the auto-submit poller, say) is a success, not a failure.
      if (e instanceof ApiError && e.code === "EXAM_ALREADY_SUBMITTED") {
        setStatus("SUBMITTED");
        return { ok: true };
      }
      submitting.current = false;
      return { ok: false, message: e.message };
    }
  }, [attemptId, flushPending]);

  const beginAttempt = useCallback((id) => {
    localStorage.setItem("attemptId", String(id));
    setAttemptId(String(id));
  }, []);

  // ── Derived view of the paper ─────────────────────────────────────────────

  const statusOf = useCallback((questionId) => {
    const answered = Boolean(answers[questionId]);
    const marked = Boolean(markedForReview[questionId]);

    if (answered && marked) return QUESTION_STATUS.ANSWERED_MARKED;
    if (marked) return QUESTION_STATUS.MARKED;
    if (answered) return QUESTION_STATUS.ANSWERED;
    if (visited[questionId]) return QUESTION_STATUS.NOT_ANSWERED;
    return QUESTION_STATUS.NOT_VISITED;
  }, [answers, markedForReview, visited]);

  /** Contiguous section blocks, in paper order, with their own tallies. */
  const sections = useMemo(() => {
    const blocks = [];
    questions.forEach((q, index) => {
      const name = q.sectionName || "General";
      const last = blocks[blocks.length - 1];
      if (last && last.name === name) last.indices.push(index);
      else blocks.push({ name, sectionId: q.sectionId, indices: [index], startIndex: index });
    });

    return blocks.map((block) => {
      const tally = { answered: 0, notAnswered: 0, marked: 0, answeredMarked: 0, notVisited: 0 };
      block.indices.forEach((i) => {
        switch (statusOf(questions[i].id)) {
          case QUESTION_STATUS.ANSWERED: tally.answered++; break;
          case QUESTION_STATUS.NOT_ANSWERED: tally.notAnswered++; break;
          case QUESTION_STATUS.MARKED: tally.marked++; break;
          case QUESTION_STATUS.ANSWERED_MARKED: tally.answeredMarked++; break;
          default: tally.notVisited++;
        }
      });
      return { ...block, total: block.indices.length, tally };
    });
  }, [questions, statusOf]);

  /** Whole-paper tallies for the palette legend and the submit summary. */
  const counts = useMemo(() => {
    const total = { answered: 0, notAnswered: 0, marked: 0, answeredMarked: 0, notVisited: 0 };
    sections.forEach((s) => {
      Object.keys(total).forEach((k) => { total[k] += s.tally[k]; });
    });
    return total;
  }, [sections]);

  // Answered-and-marked questions ARE evaluated — a candidate who marked their
  // answer for review has still answered it, and must not be told otherwise.
  const answeredCount = counts.answered + counts.answeredMarked;
  const unansweredCount = questions.length - answeredCount;

  return (
    <ExamContext.Provider
      value={{
        attemptId, beginAttempt, loadAttempt,
        questions, answers, markedForReview, visited,
        remainingSeconds, status, error, syncState,
        violations, recordViolation,
        saveAnswer, clearAnswer, toggleMarkForReview, markVisited,
        submitExam, setExpiryHandler,
        statusOf, sections, counts, answeredCount, unansweredCount,
      }}
    >
      {children}
    </ExamContext.Provider>
  );
};
