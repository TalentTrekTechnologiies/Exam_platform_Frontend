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
const STRIKES_KEY = (id) => `exam_strikes_${id}`;
const PENDING_KEY = (id) => `exam_pending_${id}`;

/**
 * The violations that are the candidate's own doing, and the only ones that
 * count toward the three that end a paper.
 *
 * What the camera reports — a dark lens, a face out of frame, a second face —
 * is recorded and shown to the invigilator, but is deliberately absent here.
 * Face and brightness detection are probabilistic and fail for innocent
 * reasons, so they must never close anybody's exam on their own. One shared
 * counter made them do exactly that, in both directions: two dark frames left
 * a candidate one tab-switch from auto-submit with no warning ever shown, and
 * the flag count an invigilator read off the monitor had no relationship to
 * the strikes actually being counted against the paper.
 */
const STRIKE_TYPES = new Set(["FULLSCREEN_EXIT", "TAB_SWITCH", "APP_SWITCH"]);

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

/**
 * Whether this screen is one a candidate sits an exam on.
 *
 * Read from the address bar rather than the router, because the provider sits
 * above the router and has no route of its own. Compared against the app's
 * mount point so it stays correct when served under a subpath such as /online.
 */
const EXAM_SCREENS = ["/instructions", "/exam", "/result"];

function onExamScreen() {
  if (typeof window === "undefined") return false;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const path = window.location.pathname.slice(base.length) || "/";
  return EXAM_SCREENS.some((screen) => path === screen || path.startsWith(`${screen}/`));
}

export const ExamProvider = ({ children }) => {
  /**
   * The attempt this browser is part-way through — but only where an attempt
   * has any business being.
   *
   * This provider wraps the whole application, so it used to resume from
   * localStorage on every screen. A machine that had been used by a candidate
   * kept an `attemptId` behind, and opening the STAFF sign-in on that machine
   * fired /student/paper, /student/remaining and /student/responses for a
   * finished attempt. They answered 401 on the stale candidate token, the
   * global handler took that to mean "a candidate's session expired", and
   * replaced the page with the candidate sign-in. Staff could not reach their
   * own login screen at all, and nothing on the page explained why.
   *
   * The exam screens are the only ones that need this, so they are the only
   * ones that get it.
   */
  const [attemptId, setAttemptId] = useState(() =>
    (onExamScreen() ? localStorage.getItem("attemptId") : null));
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState({});
  const [visited, setVisited] = useState({});
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [status, setStatus] = useState("IDLE"); // IDLE | LOADING | READY | SUBMITTED | ERROR
  const [error, setError] = useState(null);
  const [syncState, setSyncState] = useState("synced"); // synced | pending | offline
  // Every flag the invigilator sees, camera observations included.
  const [violations, setViolations] = useState(0);
  // Rule violations only — this is what the three-strike rule counts.
  const [strikes, setStrikes] = useState(0);

  /**
   * Sectional state, as the server sees it.
   *
   * Null on an ordinary paper, which is every exam that does not set a
   * duration on its sections. The server owns which section is open and when
   * it closes; this is a copy for the paper to draw with, never the authority.
   * An answer to a closed section is refused server-side whatever this says.
   */
  const [sectionClock, setSectionClock] = useState(null);

  // Answers that haven't reached the server yet: { [questionId]: option }
  const pending = useRef({});
  // Read back synchronously the moment a violation is recorded, which a
  // useState value cannot be: React is free to defer an updater until render,
  // so a count read straight after setViolations could still be the old one.
  const violationCount = useRef(0);
  const strikeCount = useRef(0);
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
      violationCount.current = readJson(VIOLATIONS_KEY(id), 0);
      strikeCount.current = readJson(STRIKES_KEY(id), 0);
      setViolations(violationCount.current);
      setStrikes(strikeCount.current);
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
  const recordViolation = useCallback((type = "APP_SWITCH", detail = "", countAsStrike = true) => {
    // The caller can decline the strike while still logging the event — how a
    // single departure reported by three different browser events costs one
    // warning rather than three.
    const counted = countAsStrike && STRIKE_TYPES.has(type);

    violationCount.current += 1;
    setViolations(violationCount.current);
    if (counted) {
      strikeCount.current += 1;
      setStrikes(strikeCount.current);
    }

    if (attemptId) {
      localStorage.setItem(VIOLATIONS_KEY(attemptId), JSON.stringify(violationCount.current));
      if (counted) localStorage.setItem(STRIKES_KEY(attemptId), JSON.stringify(strikeCount.current));
      // Fire and forget — never let logging block or fail the exam. Every
      // flag is still reported; occurrence stays the running total so the
      // audit trail numbers each event in the order it happened.
      examApi.reportViolation(Number(attemptId), type, violationCount.current, detail);
    }

    // The strike count, because this is what decides whether the paper ends.
    return strikeCount.current;
  }, [attemptId]);

  // ── Clock ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (status !== "READY" || !attemptId) return;

    const sync = async () => {
      try {
        const clock = await examApi.remaining(attemptId);
        setRemainingSeconds(clock.remainingSeconds);
        // The same poll advances the sectional boundary server-side, so this
        // is where a section closing becomes visible to the candidate.
        setSectionClock(clock.sectional ? clock : null);
        if (clock.expired && onExpiry.current) onExpiry.current();
      } catch {
        // Offline: keep ticking locally and reconcile on the next successful poll.
      }
    };

    // Once immediately: waiting a full sync interval would show a sectional
    // candidate no section clock for the first twenty seconds of their paper.
    sync();

    const syncTimer = setInterval(sync, CLOCK_SYNC_MS);
    const tickTimer = setInterval(() => {
      setRemainingSeconds((s) => (s == null ? s : Math.max(0, s - 1)));
      // Locally between polls, for the same reason the paper's clock ticks
      // locally: a number that only moved every twenty seconds reads as frozen.
      // The server's value replaces it on every sync.
      setSectionClock((sc) => (sc == null || sc.sectionRemainingSeconds == null ? sc
        : { ...sc, sectionRemainingSeconds: Math.max(0, sc.sectionRemainingSeconds - 1) }));
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
      localStorage.removeItem(STRIKES_KEY(attemptId));
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
        violations, strikes, recordViolation,
        sectionClock,
        saveAnswer, clearAnswer, toggleMarkForReview, markVisited,
        submitExam, setExpiryHandler,
        statusOf, sections, counts, answeredCount, unansweredCount,
      }}
    >
      {children}
    </ExamContext.Provider>
  );
};
