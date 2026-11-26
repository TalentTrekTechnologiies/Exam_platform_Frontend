import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiAlertCircle, FiClock, FiVolume2, FiSkipForward } from "react-icons/fi";
import { useExam } from "../../contexts/ExamContext";
import { examApi, api, uploadUrl } from "../../lib/api";
import StatusLegend from "../../components/Exam/StatusLegend";
import { introMedia } from "../../lib/introVideo";

const initialsOf = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "—";

/**
 * A server LocalDateTime ("2026-11-24T12:00:00.123456") as epoch ms, read in
 * this machine's zone. Parsed by hand because browsers disagree on more than
 * three fractional digits. Only ever used in differences between two server
 * times, so the zone cancels out.
 */
const toMs = (v) => {
  if (!v) return NaN;
  if (Array.isArray(v)) {
    const [y, mo, d, h = 0, mi = 0, sec = 0] = v;
    return new Date(y, mo - 1, d, h, mi, sec).getTime();
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/);
  if (!m) return NaN;
  return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +(m[7] || "0").padEnd(3, "0")).getTime();
};

const clockText = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/**
 * The college's introduction, played as the candidate enters the lobby.
 *
 * An uploaded file or a direct video link plays in a <video>; a YouTube link
 * plays in YouTube's own player. It runs until the candidate presses Skip, the
 * video ends, or the exam opens, whichever is first: the lobby closes it when
 * the paper opens, so nobody is still watching an advertisement on their own
 * exam time.
 *
 * A file that fails to load never traps anyone: it hands over to the rules on
 * its own. Browsers refuse sound on a page nobody has clicked yet (a refreshed
 * lobby), so a file then plays muted with a button to bring the sound back.
 */
const IntroVideo = ({ media, collegeName, opensIn, onDone }) => {
  const ref = useRef(null);
  const [muted, setMuted] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (media.kind !== "file") return;
    const video = ref.current;
    if (!video) return;
    video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      video.play().catch(finish);
    });
    // A lab connection that cannot fetch the file must not hold anyone here.
    const giveUp = setTimeout(() => { if (video.paused) finish(); }, 20000);
    return () => clearTimeout(giveUp);
  }, [media, finish]);

  const frame = "aspect-video max-h-[75vh] w-full max-w-5xl rounded-exam bg-black shadow-2xl";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-chrome px-6">
      <div className="mb-4 flex w-full max-w-5xl items-center justify-between gap-4">
        <p className="text-sm font-medium text-gray-300">
          A message from {collegeName || "your institution"}
        </p>
        {opensIn != null && (
          <p className="text-sm text-gray-400">
            Exam opens in <span className="font-semibold tabular text-white">{clockText(opensIn)}</span>
          </p>
        )}
      </div>

      {media.kind === "youtube" ? (
        <iframe
          src={media.src}
          title={`A message from ${collegeName || "your institution"}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          className={frame}
        />
      ) : (
        <video
          ref={ref}
          src={media.src}
          playsInline
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
          onEnded={finish}
          onError={finish}
          className={frame}
        />
      )}

      <div className="mt-4 flex w-full max-w-5xl items-center justify-end gap-3">
        {muted && (
          <button
            onClick={() => { ref.current.muted = false; setMuted(false); }}
            className="flex items-center gap-2 rounded-exam border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            <FiVolume2 /> Turn sound on
          </button>
        )}
        <button
          onClick={finish}
          className="flex items-center gap-2 rounded-exam bg-white px-5 py-2 text-sm font-semibold text-chrome hover:opacity-90"
        >
          Skip <FiSkipForward />
        </button>
      </div>
    </div>
  );
};

const RULES = [
  "The timer runs on our server. Closing the browser, losing power or losing your connection does not stop it.",
  "Your answers are saved the moment you choose them — there is no separate save step.",
  "The paper must be taken in fullscreen. Leaving fullscreen, switching tabs or opening another application is recorded.",
  "Three violations will submit your exam automatically.",
  "You may revisit and change any answer until you submit.",
  "Once you submit, the paper closes and cannot be reopened.",
];

const Instructions = () => {
  const navigate = useNavigate();
  const { beginAttempt } = useExam();

  const [exam, setExam] = useState(null);
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // When the paper opens, on this machine's clock. Computed from the gap
  // between the server's opening time and the server's "now", so a candidate's
  // wrong system clock moves nothing. Null means open already (or no sitting).
  const [openAt, setOpenAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const candidateName = localStorage.getItem("studentName") || "Candidate";
  const hallTicket = localStorage.getItem("hallTicket") || "";

  // The introduction plays once per sign-in, not again on every refresh:
  // skipped, finished or cut short by the opening, it is done.
  const introKey = `introSeen:${localStorage.getItem("student_examId")}:${localStorage.getItem("studentId")}`;
  const [introDone, setIntroDone] = useState(() => sessionStorage.getItem(introKey) === "1");
  const endIntro = useCallback(() => {
    sessionStorage.setItem(introKey, "1");
    setIntroDone(true);
  }, [introKey]);

  useEffect(() => {
    const examId = localStorage.getItem("student_examId");
    if (!examId) {
      navigate("/verify", { replace: true });
      return;
    }

    Promise.all([
      examApi.examInfo(examId),
      // The briefing is still useful without the structure, so a failure here
      // must not block a candidate from starting.
      api.get(`/student/exam-structure/${examId}`).catch(() => null),
    ])
      .then(([info, shape]) => {
        setExam({ id: examId, ...info });
        setStructure(shape);
        const gap = toMs(info.opensAt) - toMs(info.serverTime);
        setOpenAt(Number.isFinite(gap) && gap > 0 ? Date.now() + gap : null);
      })
      .catch((e) => setError(e.message || "Could not load the exam details."))
      .finally(() => setLoading(false));
  }, [navigate]);

  const isOpen = openAt == null || now >= openAt;

  // The lobby clock. Stops ticking once the paper is open.
  useEffect(() => {
    if (openAt == null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= openAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [openAt]);

  const startingRef = useRef(false);
  const startExam = useCallback(async () => {
    if (startingRef.current || !exam) return;
    startingRef.current = true;
    setStarting(true);
    setError("");

    // In the first seconds after the start, the server may still be a beat
    // behind this countdown; that is a wait, not an error to show anyone.
    for (let tries = 0; ; tries++) {
      try {
        const data = await examApi.start(Number(localStorage.getItem("studentId")), Number(exam.id));
        beginAttempt(data.attemptId);
        navigate("/exam", { replace: true });
        return;
      } catch (e) {
        if (e.status === 409 && tries < 10) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        setError(e.message || "Could not start the exam. Contact your invigilator.");
        startingRef.current = false;
        setStarting(false);
        return;
      }
    }
  }, [exam, beginAttempt, navigate]);

  // Everyone waiting in the lobby goes straight in when the exam opens,
  // whether they were reading the rules or still watching the video, which
  // stops there. Spread over a few seconds so a whole lab does not press Start
  // in the same instant. Decided once, at the opening moment: somebody who
  // arrives after it reads the rules and presses Begin.
  const waitedForOpen = useRef(false);
  const startRef = useRef(startExam);
  startRef.current = startExam;
  const endIntroRef = useRef(endIntro);
  endIntroRef.current = endIntro;
  useEffect(() => {
    if (!isOpen) { waitedForOpen.current = true; return; }
    if (!waitedForOpen.current) return;
    waitedForOpen.current = false;
    endIntroRef.current();
    const id = setTimeout(() => startRef.current(), Math.random() * 3000);
    return () => clearTimeout(id);
  }, [isOpen]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center text-sm font-medium text-gray-500">
        Loading your exam details…
      </div>
    );
  }

  const openTimeText = openAt != null
    ? new Date(toMs(exam?.opensAt)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  const marking =
    structure?.marksPerQuestion != null
      ? `+${structure.marksPerQuestion}${structure.negativePerQuestion ? ` / −${structure.negativePerQuestion}` : ""}`
      : "Varies by question";

  return (
    <div className="min-h-screen bg-gray-50" onContextMenu={(e) => e.preventDefault()}>

      {exam?.introVideo && !introDone && (
        <IntroVideo
          media={introMedia(exam.introVideo)}
          collegeName={exam.collegeName}
          opensIn={openAt != null && !isOpen ? openAt - now : null}
          onDone={endIntro}
        />
      )}

      <header className="flex h-14 items-center gap-3 bg-chrome px-6">
        {exam?.collegeLogo && (
          <img
            src={uploadUrl(exam.collegeLogo)}
            alt=""
            className="h-8 w-8 rounded bg-white/95 object-contain p-0.5"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold leading-tight text-white">
            {exam?.title || "Examination"}
          </h1>
          <p className="truncate text-[11px] leading-tight text-gray-400">{exam?.collegeName}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">

        {/* The lobby: in early, reading, with the paper on its way. */}
        {openAt != null && !isOpen && (
          <section className="mb-8 flex items-center gap-5 rounded-exam border border-primary-200 bg-primary-50 px-6 py-5">
            <FiClock className="shrink-0 text-2xl text-primary-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                You are signed in. The exam opens at {openTimeText}.
              </p>
              <p className="mt-0.5 text-sm text-gray-600">
                Read the instructions below while you wait. Your time does not start until the exam opens.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="exam-label">Opens in</p>
              <p className="text-2xl font-semibold tabular text-gray-900">{clockText(openAt - now)}</p>
            </div>
          </section>
        )}

        {/* Candidate */}
        <section className="mb-8 flex items-center gap-4 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-exam bg-chrome text-sm font-semibold text-white">
            {initialsOf(candidateName)}
          </div>
          <div className="min-w-0">
            <p className="exam-label">Candidate</p>
            <p className="truncate text-lg font-semibold leading-tight text-gray-900">{candidateName}</p>
            <p className="text-sm text-gray-500 tabular">{hallTicket}</p>
          </div>
        </section>

        {/* Paper at a glance */}
        <section className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-exam border border-gray-200 bg-gray-200 sm:grid-cols-4">
          {[
            ["Duration", exam?.duration ? `${exam.duration} min` : "—"],
            ["Questions", structure?.totalQuestions ?? "—"],
            ["Total marks", structure?.totalMarks ?? "—"],
            ["Marking", marking],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-4">
              <p className="exam-label">{label}</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 tabular">{value}</p>
            </div>
          ))}
        </section>

        {/* Structure */}
        {structure?.sections?.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-exam border border-gray-200 bg-white">
            <h2 className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">
              Paper structure
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left exam-label">Section</th>
                  <th className="px-6 py-3 text-right exam-label">Questions</th>
                  <th className="px-6 py-3 text-right exam-label">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {structure.sections.map((s) => (
                  <tr key={s.name}>
                    <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-3 text-right tabular text-gray-700">{s.questionCount}</td>
                    <td className="px-6 py-3 text-right tabular text-gray-700">{s.marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* The legend, taught before the paper rather than discovered during it. */}
        <section className="mb-8 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Reading the question palette
          </h2>
          <StatusLegend describe />
        </section>

        {/* Rules */}
        <section className="mb-8 rounded-exam border border-gray-200 bg-white px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Before you begin</h2>
          <ol className="space-y-3">
            {RULES.map((rule, i) => (
              <li key={rule} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                <span className="shrink-0 font-semibold tabular text-gray-400">{i + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-exam border border-red-200 bg-red-50 px-5 py-4">
            <FiAlertCircle className="mt-0.5 shrink-0 text-status-unanswered" />
            <p className="text-sm font-medium text-red-900">{error}</p>
          </div>
        )}

        {/* Commit */}
        <section className="flex flex-col gap-5 rounded-exam bg-chrome px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-500 bg-transparent text-primary-500"
            />
            <span className="text-sm leading-snug text-gray-300">
              I confirm I am {candidateName} and I have read the instructions above.
            </span>
          </label>

          <button
            onClick={startExam}
            disabled={!agreed || starting || !exam || !isOpen}
            className="shrink-0 rounded-exam bg-white px-8 py-3 text-sm font-semibold text-chrome
                       transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {starting
              ? "Starting…"
              : !isOpen
                ? <span className="tabular">Opens in {clockText(openAt - now)}</span>
                : <>Begin exam <FiArrowRight className="ml-1 inline" /></>}
          </button>
        </section>

        <p className="mt-4 text-center text-xs text-gray-400">
          {!isOpen
            ? `The exam opens by itself at ${openTimeText}.`
            : "Your time starts the moment you begin."}
        </p>
      </main>
    </div>
  );
};

export default Instructions;
