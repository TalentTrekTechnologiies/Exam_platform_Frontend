import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout/Layout";
import { API_BASE, api, uploadUrl, readAdmin, appPath } from "../../lib/api";
import { FiImage, FiCheck, FiAlertTriangle, FiVideo, FiMic, FiFilm } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";
import { introMedia } from "../../lib/introVideo";

/**
 * The institution's own settings — its name and logo — and the proctoring
 * switches for the exam currently being worked on.
 *
 * The name and logo are what Create Exam reads from automatically. Before this
 * page existed, the logo lived only inside each exam's own form, so it had to
 * be re-uploaded from scratch every single time an exam was created. Set once
 * here, it is reused for every future exam without asking again.
 *
 * Camera and microphone were askable only on the Create Exam form, and only at
 * the moment of creation. An exam created with the camera unticked could never
 * be changed: candidates got no self-view and the invigilator's camera wall
 * stayed empty for the life of that exam, with nothing anywhere to turn it on.
 */

/** Matches the server's cap, which sits under the 30 MB nginx accepts. */
const VIDEO_LIMIT_MB = 25;
const TOO_LARGE = `That video is larger than ${VIDEO_LIMIT_MB} MB. Export it smaller (720p is plenty) and try again.`;

/** One proctoring switch, saved the moment it is flipped. */
const Toggle = ({ icon: Icon, label, hint, checked, disabled, onChange }) => (
  <label className={`flex flex-1 items-start gap-3 rounded-exam border p-4 transition-colors
    ${disabled ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-gray-50"}
    ${checked ? "border-primary-600 bg-primary-50/40" : "border-gray-200"}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 text-primary-700 focus:ring-primary-600"
    />
    <span className="min-w-0">
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Icon className="shrink-0 text-gray-400" /> {label}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-gray-500">{hint}</span>
    </span>
  </label>
);

const Settings = () => {
  const [collegeName, setCollegeName] = useState("");
  const [logo, setLogo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  // The exam every admin screen is currently working on.
  const examId = localStorage.getItem("examId");
  const [exam, setExam] = useState(null);
  const [examError, setExamError] = useState("");
  const [proctorSaving, setProctorSaving] = useState(false);

  /**
   * Deleting an exam asks for its title to be typed out.
   *
   * Not a confirm dialog. This removes a paper, its questions, its sections and
   * its schedule, and there is no undo — the one thing that reliably stops a
   * mis-click is having to write down what you are destroying.
   */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedTitle, setTypedTitle] = useState("");
  const [deleting, setDeleting] = useState(false);

  /*
   * Deletes the exam with everything in it, results included, once its title
   * is typed. The college decides; the screen does not argue about how many
   * candidates have sat it. The server still refuses while anyone is writing.
   */
  const [deleteError, setDeleteError] = useState("");
  const deleteExam = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.del(`/admin/exam/${examId}?includeResults=true`);
      // The console works on "the exam you are on", and that exam is gone.
      localStorage.removeItem("examId");
      localStorage.removeItem("slotId");
      window.location.href = appPath("/admin/dashboard");
    } catch (e) {
      setDeleteError(e.message || "That exam could not be deleted.");
      setDeleting(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get("/admin/me");
        setCollegeName(me.collegeName || "");
        setLogo(me.collegeLogo || null);
      } catch {
        // Fall back to whatever was cached at login — still usable, just possibly stale.
        const cached = readAdmin();
        if (cached) {
          setCollegeName(cached.collegeName || "");
          setLogo(cached.collegeLogo || null);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        setExam(await api.get(`/admin/exam/${examId}`));
      } catch (e) {
        setExamError(e.message || "Could not load this exam's proctoring settings.");
      }
    })();
  }, [examId]);

  /**
   * Flips one proctoring switch and saves immediately.
   *
   * Both flags go in every request. The server reads them straight off the
   * body rather than treating an absent one as "leave this alone", so sending
   * only the switch that changed would quietly turn the other one off.
   */
  /** The paper's duration. Both proctoring flags travel with it, as below. */
  const [durationDraft, setDurationDraft] = useState(null);
  const [durationSaving, setDurationSaving] = useState(false);
  const saveDuration = async () => {
    const minutes = Number(durationDraft);
    if (!Number.isInteger(minutes) || minutes < 1) {
      setNotice({ tone: "error", text: "The duration must be a whole number of minutes, at least 1." });
      return;
    }
    setDurationSaving(true);
    setNotice(null);
    try {
      setExam(await api.put(`/admin/exam/${examId}`, {
        duration: minutes, enableCamera: !!exam.enableCamera, enableMic: !!exam.enableMic,
      }));
      setDurationDraft(null);
      setNotice({ tone: "ok", text: `Duration saved: ${minutes} minutes for everyone who starts from now on.` });
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "The duration could not be saved." });
    } finally {
      setDurationSaving(false);
    }
  };

  const setProctoring = async (patch) => {
    if (!exam || proctorSaving) return;
    const previous = exam;
    const next = { enableCamera: !!exam.enableCamera, enableMic: !!exam.enableMic, ...patch };

    setExam({ ...exam, ...next });
    setProctorSaving(true);
    setNotice(null);
    try {
      setExam(await api.put(`/admin/exam/${examId}`, next));
      setNotice({ tone: "ok", text: "Proctoring saved for this exam." });
    } catch (e) {
      setExam(previous);
      setNotice({ tone: "error", text: e.message || "That change could not be saved." });
    } finally {
      setProctorSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`${API_BASE}/admin/profile`, { method: "PUT", body: form });
      const body = await res.json();
      if (!res.ok) { setNotice({ tone: "error", text: body.message || "That logo could not be saved." }); return; }
      setLogo(body.collegeLogo);
      localStorage.setItem("admin", JSON.stringify(body));
      setNotice({ tone: "ok", text: "Logo saved — every new exam will use this automatically." });
    } catch {
      setNotice({ tone: "error", text: "Could not reach the server." });
    } finally {
      setUploading(false);
    }
  };

  /**
   * The college's introduction video, played to every candidate as they enter
   * the lobby before an exam. Raw fetch rather than api.put: a 30 MB file on a
   * college line can take longer than the client's usual 15-second timeout.
   */
  const [introVideo, setIntroVideo] = useState(null);
  const [videoBusy, setVideoBusy] = useState(false);

  useEffect(() => {
    api.get("/admin/profile/intro-video")
      .then((r) => setIntroVideo(r?.introVideo || null))
      .catch(() => {});
  }, []);

  const uploadVideo = async (file) => {
    if (!file) return;
    if (file.size > VIDEO_LIMIT_MB * 1024 * 1024) {
      setNotice({ tone: "error", text: TOO_LARGE });
      return;
    }
    setVideoBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch(`${API_BASE}/admin/profile/intro-video`, { method: "PUT", body: form });
      const body = await res.json().catch(() => ({}));
      // 413 comes from nginx in front of the app, as an HTML page with no message.
      if (res.status === 413) { setNotice({ tone: "error", text: TOO_LARGE }); return; }
      if (!res.ok) { setNotice({ tone: "error", text: body.message || "That video could not be saved." }); return; }
      setIntroVideo(body.introVideo || null);
      setNotice({ tone: "ok", text: "Video saved — candidates will watch it as they enter, before every exam." });
    } catch {
      setNotice({ tone: "error", text: "Could not reach the server." });
    } finally {
      setVideoBusy(false);
    }
  };

  const [videoLink, setVideoLink] = useState("");

  const saveVideoLink = async () => {
    const url = videoLink.trim();
    if (!url) return;
    setVideoBusy(true);
    setNotice(null);
    try {
      const body = await api.put("/admin/profile/intro-video-link", { url });
      setIntroVideo(body.introVideo || null);
      setVideoLink("");
      setNotice({ tone: "ok", text: "Link saved — candidates will watch it as they enter, before every exam." });
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "That link could not be saved." });
    } finally {
      setVideoBusy(false);
    }
  };

  const removeVideo = async () => {
    setVideoBusy(true);
    setNotice(null);
    try {
      await api.del("/admin/profile/intro-video");
      setIntroVideo(null);
      setNotice({ tone: "ok", text: "Video removed. Candidates go straight to the instructions." });
    } catch (e) {
      setNotice({ tone: "error", text: e.message || "That video could not be removed." });
    } finally {
      setVideoBusy(false);
    }
  };

  const saveName = async () => {
    if (!collegeName.trim()) { setNotice({ tone: "error", text: "Institution name cannot be empty." }); return; }
    setSaving(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("collegeName", collegeName.trim());
      const res = await fetch(`${API_BASE}/admin/profile`, { method: "PUT", body: form });
      const body = await res.json();
      if (!res.ok) { setNotice({ tone: "error", text: body.message || "That name could not be saved." }); return; }
      localStorage.setItem("admin", JSON.stringify(body));
      setNotice({ tone: "ok", text: "Institution name saved." });
    } catch {
      setNotice({ tone: "error", text: "Could not reach the server." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Institution Settings" subtitle="Set your name and logo once — every exam reuses them">
      <div className="max-w-2xl">
        {notice && (
          <div className={`mb-5 flex items-start gap-2 rounded-exam border px-5 py-4 text-sm
            ${notice.tone === "ok" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            {notice.tone === "ok" ? <FiCheck className="mt-0.5 shrink-0" /> : <FiAlertTriangle className="mt-0.5 shrink-0" />}
            {notice.text}
          </div>
        )}

        <div className="rounded-exam border border-gray-200 bg-white p-6">
          <label className="exam-label mb-3 block">Institution logo</label>
          <div className="flex items-center gap-5">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-exam border-2 border-dashed border-gray-200 bg-gray-50">
              {logo ? (
                <img src={uploadUrl(logo)} alt="Institution logo" className="h-full w-full object-contain p-2" />
              ) : (
                <FiImage className="text-2xl text-gray-300" />
              )}
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => uploadLogo(e.target.files?.[0])}
                disabled={uploading}
              />
            </div>
            <div className="text-sm text-gray-600">
              <p className="font-semibold text-gray-900">{uploading ? "Uploading…" : "Click the logo to change it"}</p>
              <p className="mt-1">
                This is what candidates see on the sign-in and exam screens, and what every
                new exam starts with automatically — no need to upload it again per exam.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-exam border border-gray-200 bg-white p-6">
          <label className="exam-label mb-1 block">Introduction video</label>
          <p className="mb-4 text-sm text-gray-600">
            Candidates can sign in a little before the exam starts. This plays first as they
            enter — your college's advertisement or welcome — until they press Skip or it ends,
            then they read the instructions. When the exam opens the video stops and the exam
            starts by itself.
          </p>

          {introVideo && (introMedia(introVideo).kind === "youtube" ? (
            <iframe
              src={introMedia(introVideo).src.replace("autoplay=1", "autoplay=0")}
              title="Introduction video"
              allow="encrypted-media; picture-in-picture"
              className="mb-4 aspect-video w-full rounded-exam bg-black"
            />
          ) : (
            <video
              src={uploadUrl(introVideo)}
              controls
              preload="metadata"
              className="mb-4 max-h-64 w-full rounded-exam bg-black"
            />
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <label className={`exam-action-primary relative cursor-pointer ${videoBusy ? "pointer-events-none opacity-60" : ""}`}>
              <FiFilm className="mr-1.5 inline" />
              {videoBusy ? "Uploading…" : introVideo ? "Replace video" : "Upload video"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => { uploadVideo(e.target.files?.[0]); e.target.value = ""; }}
                disabled={videoBusy}
              />
            </label>
            {introVideo && (
              <button
                onClick={removeVideo}
                disabled={videoBusy}
                className="text-sm font-semibold text-gray-500 hover:text-red-700 disabled:opacity-40"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            MP4, up to {VIDEO_LIMIT_MB} MB. Every candidate downloads it in the same few minutes, so keep it
            small — a one-minute 720p video is usually under 10 MB.
          </p>

          <div className="mt-5 border-t border-gray-100 pt-5">
            <label className="exam-label mb-2 block">Or use a link</label>
            <div className="flex gap-3">
              <input
                value={videoLink}
                onChange={(e) => setVideoLink(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="h-11 min-w-0 flex-1 rounded-exam border border-gray-300 px-3 text-sm outline-none focus:border-primary-600"
              />
              <button onClick={saveVideoLink} disabled={videoBusy || !videoLink.trim()} className="exam-action-primary">
                Use link
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              A YouTube link, or a direct link to an .mp4 file. Replaces any uploaded video. YouTube
              must be reachable from the exam lab — if the college network blocks it, candidates see
              an error and can press Skip.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-exam border border-gray-200 bg-white p-6">
          <label className="exam-label mb-3 block">Institution name</label>
          <div className="flex gap-3">
            <input
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              className="h-11 flex-1 rounded-exam border border-gray-300 px-3 text-sm outline-none focus:border-primary-600"
            />
            <button onClick={saveName} disabled={saving} className="exam-action-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-5">
          {!examId ? (
            <ExamPicker what="Proctoring settings" />
          ) : (
            <div className="rounded-exam border border-gray-200 bg-white p-6">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label className="exam-label">Proctoring</label>
                {exam && (
                  <span className="truncate text-xs text-gray-500">
                    {exam.title || `Exam #${examId}`}
                  </span>
                )}
              </div>
              <p className="mb-4 text-sm text-gray-600">
                The camera has to be on here before a candidate can see their own picture,
                and before the invigilator's camera wall shows anything for this exam.
              </p>

              {examError ? (
                <p className="flex items-start gap-2 text-sm text-red-800">
                  <FiAlertTriangle className="mt-0.5 shrink-0" /> {examError}
                </p>
              ) : !exam ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Toggle
                    icon={FiVideo}
                    label="Enable camera"
                    hint="The candidate sees themselves, and the invigilator gets a picture of their seat every few seconds. A covered or unlit camera is flagged. Detecting a second face needs browser support that desktop Chrome, Edge, Firefox and Safari do not ship, so treat the pictures as what you invigilate from."
                    checked={!!exam.enableCamera}
                    disabled={proctorSaving}
                    onChange={(v) => setProctoring({ enableCamera: v })}
                  />
                  <Toggle
                    icon={FiMic}
                    label="Enable microphone"
                    hint="Asks for the microphone alongside the camera. Nothing listens to it yet, so leave it off unless you want candidates prompted for it."
                    checked={!!exam.enableMic}
                    disabled={proctorSaving}
                    onChange={(v) => setProctoring({ enableMic: v })}
                  />
                </div>
              )}

              <p className="mt-4 text-xs text-gray-500">
                Candidates who are already writing keep whatever was set when they started —
                this applies to everyone who begins from now on.
              </p>
            </div>
          )}
        </div>

        {/* ── Duration ──────────────────────────────────────────────────────
            Create Exam fills in 180 minutes, and there was nowhere to change it
            afterwards: an exam made without touching that box was a three-hour
            paper for good. */}
        {exam && (
          <div className="mt-5 rounded-exam border border-gray-200 bg-white p-6">
            <label className="exam-label mb-1 block">Exam duration</label>
            <p className="mb-4 text-sm text-gray-600">
              How long each candidate gets, counted from when they start. This exam is currently{" "}
              <span className="font-semibold text-gray-900">{exam.duration} minutes</span>.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                step="1"
                value={durationDraft ?? exam.duration ?? ""}
                onChange={(e) => setDurationDraft(e.target.value)}
                className="h-11 w-32 rounded-exam border border-gray-300 px-3 text-sm tabular outline-none focus:border-primary-600"
              />
              <span className="text-sm text-gray-500">minutes</span>
              <button
                onClick={saveDuration}
                disabled={durationSaving || durationDraft == null || Number(durationDraft) === exam.duration}
                className="exam-action-primary"
              >
                {durationSaving ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Candidates already writing keep the time they started with. On a paper with timed
              sections, keep this equal to the sections' total.
            </p>
          </div>
        )}

        {/* ── Deleting the exam ──────────────────────────────────────────── */}
        {exam && (
          <div className="mt-6 rounded-exam border border-red-200 bg-white">
            <div className="border-b border-red-100 px-6 py-4">
              <h2 className="font-semibold text-red-900">Delete this exam</h2>
              <p className="mt-1 text-sm text-gray-600">
                Removes <span className="font-semibold">{exam.title}</span> along with its
                questions, sections, schedule, enrolments, and every candidate's answers and
                marks. There is no undo — download the results first if you need them.
              </p>
            </div>

            <div className="px-6 py-5">
              {deleteError && (
                <p className="mb-4 flex items-start gap-2 rounded-exam bg-red-50 px-4 py-3 text-sm text-red-800">
                  <FiAlertTriangle className="mt-0.5 shrink-0" /> {deleteError}
                </p>
              )}

              {!confirmDelete ? (
                <button
                  onClick={() => { setConfirmDelete(true); setTypedTitle(""); }}
                  className="rounded-exam border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Delete this exam
                </button>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm text-gray-700">
                    Type <span className="font-semibold text-gray-900">{exam.title}</span> to confirm:
                  </label>
                  <input
                    value={typedTitle}
                    onChange={(e) => setTypedTitle(e.target.value)}
                    placeholder={exam.title}
                    className="w-full max-w-sm rounded-exam border border-gray-300 px-4 py-2 text-sm outline-none focus:border-red-500"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={deleteExam}
                      disabled={deleting || typedTitle.trim() !== (exam.title || "").trim()}
                      className="rounded-exam bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {deleting ? "Deleting…" : "Delete permanently"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-sm font-semibold text-gray-500 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Settings;
