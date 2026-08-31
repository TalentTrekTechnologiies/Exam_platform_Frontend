import React, { useEffect, useState, useCallback, useRef } from "react";
import Layout from "../../components/Layout/Layout";
import { api } from "../../lib/api";
import { FiAlertTriangle, FiWifiOff, FiCheckCircle, FiClock, FiUsers, FiRefreshCw, FiFileText } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";
import CameraWall from "../../components/Admin/CameraWall";

/**
 * Live invigilation.
 *
 * The screen an invigilator watches while a sitting is in progress: who has not
 * started, who is writing, whose machine has dropped, and who is accumulating
 * proctoring violations — while there is still time to walk over and do
 * something about it.
 */

const REFRESH_MS = 10000;

const STATES = {
  IN_PROGRESS:  { label: "Writing",      tone: "text-status-answered",   dot: "bg-status-answered",   icon: FiClock },
  DISCONNECTED: { label: "Disconnected", tone: "text-status-unanswered", dot: "bg-status-unanswered", icon: FiWifiOff },
  NOT_STARTED:  { label: "Not started",  tone: "text-gray-500",          dot: "bg-gray-300",          icon: FiUsers },
  SUBMITTED:    { label: "Submitted",    tone: "text-primary-700",       dot: "bg-primary-600",       icon: FiCheckCircle },
};

const clock = (seconds) => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const ago = (iso) => {
  if (!iso) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
};

const Monitor = () => {
  // State, not a one-off read: two sittings can be running at once and an
  // invigilator needs to move between them without leaving the screen.
  const [examId, setExamId] = useState(() => localStorage.getItem("examId") || "");
  const [exams, setExams] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [view, setView] = useState("list");
  const [live, setLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareResult, setPrepareResult] = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      setData(await api.get(`/admin/monitor/${examId}`));
      setLastRefresh(new Date());
      setError("");
    } catch (e) {
      setError(e.message || "Could not reach the server.");
    }
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  // The roll of exams to switch between, fetched once.
  useEffect(() => {
    api.get("/admin/exam")
      .then((list) => setExams(Array.isArray(list) ? list : []))
      .catch(() => setExams([]));
  }, []);

  /**
   * Moves the monitor to another sitting.
   *
   * The choice is written to local storage because the rest of the console
   * works on "the exam you are currently on" and should follow. The previous
   * exam's roll is cleared first: leaving it on screen under the new title
   * shows one sitting's candidates labelled as another's, which during live
   * invigilation is worse than showing nothing for a second.
   */
  const switchExam = (id) => {
    if (!id || id === examId) return;
    localStorage.setItem("examId", id);
    setExamId(id);
    setData(null);
    setFilter("ALL");
    setPrepareResult("");
    setError("");
  };

  /**
   * Builds every candidate's paper ahead of the sitting.
   *
   * Run the night before. It moves the heaviest work off the moment the slot
   * opens and thousands of candidates press Start at once — measured at roughly
   * three times the start throughput, and it removes the timeouts entirely.
   * Safe to re-run: papers already built are left alone, so late registrations
   * just get added.
   */
  const preparePapers = async () => {
    if (preparing) return;
    setPreparing(true);
    setPrepareResult("");
    try {
      const r = await api.post(`/admin/exam/${examId}/prepare`);
      setPrepareResult(r.summary || "Papers prepared.");
      load();
    } catch (e) {
      setPrepareResult(e.message || "Could not prepare papers.");
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    if (!live) return undefined;
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [live, load]);

  if (!examId) {
    return (
      <Layout title="Live Monitor" subtitle="Watch the sitting as it happens">
        <ExamPicker what="The live monitor" />
      </Layout>
    );
  }

  const counts = data?.counts || {};
  const candidates = data?.candidates || [];
  const visible = filter === "ALL"
    ? candidates
    : filter === "FLAGGED"
      ? candidates.filter((c) => c.violations > 0)
      : candidates.filter((c) => c.state === filter);

  const tiles = [
    ["IN_PROGRESS", "Writing", counts.IN_PROGRESS || 0, "border-status-answered"],
    ["DISCONNECTED", "Disconnected", counts.DISCONNECTED || 0, "border-status-unanswered"],
    ["NOT_STARTED", "Not started", counts.NOT_STARTED || 0, "border-gray-300"],
    ["SUBMITTED", "Submitted", counts.SUBMITTED || 0, "border-primary-600"],
  ];

  return (
    <Layout title="Live Monitor" subtitle="Watch the sitting as it happens">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {exams.length > 1 ? (
            <select
              value={examId}
              onChange={(e) => switchExam(e.target.value)}
              aria-label="Which sitting to watch"
              className="max-w-full rounded-exam border border-gray-300 bg-white px-3 py-2 text-lg font-semibold
                         text-gray-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            >
              {/* An exam that has since been deleted would otherwise leave the
                  box blank and the title a lie about what is on screen. */}
              {!exams.some((e) => String(e.id) === String(examId)) && (
                <option value={examId}>{data?.examTitle || `Exam #${examId}`}</option>
              )}
              {exams.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.title || `Exam #${e.id}`}{e.published ? "" : " — not published"}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="text-lg font-semibold text-gray-900">{data?.examTitle || "Exam"}</h2>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {data?.total ?? 0} candidates
            {lastRefresh && <> · updated {lastRefresh.toLocaleTimeString()}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={preparePapers}
            disabled={preparing}
            title="Build every candidate's paper ahead of the sitting — run this the night before"
            className="exam-action-quiet flex items-center gap-2"
          >
            <FiFileText /> {preparing ? "Preparing…" : "Prepare Papers"}
          </button>
          <button onClick={load} className="exam-action-quiet flex items-center gap-2">
            <FiRefreshCw /> Refresh
          </button>
          <button
            onClick={() => setLive((v) => !v)}
            className={live ? "exam-action-primary" : "exam-action-quiet"}
          >
            {live ? "Live · on" : "Live · off"}
          </button>
        </div>
      </div>

      {prepareResult && (
        <div className="mb-4 rounded-exam border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          {prepareResult}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-exam border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          <FiAlertTriangle /> {error}
        </div>
      )}

      {/* Anything needing attention is surfaced before the table. */}
      {(counts.DISCONNECTED > 0 || data?.flagged > 0) && (
        <div className="mb-5 flex flex-wrap gap-3">
          {counts.DISCONNECTED > 0 && (
            <button
              onClick={() => setFilter("DISCONNECTED")}
              className="flex items-center gap-2 rounded-exam border border-status-unanswered/30 bg-status-unansweredSoft px-4 py-3 text-sm font-semibold text-status-unanswered"
            >
              <FiWifiOff /> {counts.DISCONNECTED} candidate{counts.DISCONNECTED === 1 ? "" : "s"} disconnected — check their machines
            </button>
          )}
          {data?.flagged > 0 && (
            <button
              onClick={() => setFilter("FLAGGED")}
              className="flex items-center gap-2 rounded-exam border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
            >
              <FiAlertTriangle /> {data.flagged} with proctoring violations
            </button>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([key, label, value, border]) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? "ALL" : key)}
            className={`rounded-exam border-t-2 ${border} border-x border-b border-gray-200 bg-white px-5 py-4 text-left
                        transition-colors hover:bg-gray-50 ${filter === key ? "ring-2 ring-primary-600" : ""}`}
          >
            <div className="text-2xl font-semibold tabular text-gray-900">{value}</div>
            <div className="exam-label mt-1">{label}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-exam px-3 py-1.5 text-xs font-semibold ${filter === "ALL" ? "bg-primary-700 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          All ({candidates.length})
        </button>
        {filter !== "ALL" && (
          <span className="text-xs text-gray-500">Showing {visible.length} — click a tile again to clear</span>
        )}
      </div>

      {/* Cameras are pictures a few seconds apart rather than live video:

          a hall of 500 live feeds is about 125 Mbps and no browser decodes

          500 videos at once. Stills answer what invigilation asks. */}

      <div className="mb-4 flex gap-2">

        {[["list", "Roll call"], ["cameras", "Cameras"]].map(([key, label]) => (

          <button

            key={key}

            onClick={() => setView(key)}

            className={`rounded-exam px-4 py-2 text-sm font-semibold transition-colors ${

              view === key ? "bg-primary-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"

            }`}

          >

            {label}

          </button>

        ))}

      </div>


      {view === "cameras" && (

        <CameraWall examId={examId} candidates={data?.candidates || []} />

      )}


      {view === "list" && (

      <div className="overflow-x-auto rounded-exam border border-gray-200 bg-white">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-5 py-3 text-left exam-label">Hall ticket</th>
              <th className="px-5 py-3 text-left exam-label">Candidate</th>
              <th className="px-5 py-3 text-left exam-label">Status</th>
              <th className="px-5 py-3 text-right exam-label">Answered</th>
              <th className="px-5 py-3 text-right exam-label">Time left</th>
              <th className="px-5 py-3 text-right exam-label">Last seen</th>
              <th className="px-5 py-3 text-right exam-label">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((c) => {
              const s = STATES[c.state] || STATES.NOT_STARTED;
              const Icon = s.icon;
              const lowTime = c.remainingSeconds != null && c.remainingSeconds < 300;
              return (
                <tr key={c.hallTicket} className={c.state === "DISCONNECTED" ? "bg-status-unansweredSoft/40" : ""}>
                  <td className="px-5 py-3 font-medium tabular text-gray-900">{c.hallTicket}</td>
                  <td className="px-5 py-3 text-gray-700">{c.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-2 text-xs font-semibold ${s.tone}`}>
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      <Icon /> {s.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular text-gray-700">{c.answered}</td>
                  <td className={`px-5 py-3 text-right tabular ${lowTime ? "font-semibold text-status-unanswered" : "text-gray-700"}`}>
                    {c.state === "SUBMITTED" ? "—" : clock(c.remainingSeconds)}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-gray-500">{ago(c.lastSeen || c.startedAt)}</td>
                  <td className="px-5 py-3 text-right">
                    {c.violations > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 tabular">
                        {c.violations}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  {data ? "No candidates in this view." : "Loading…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      )}
    </Layout>
  );
};

export default Monitor;
