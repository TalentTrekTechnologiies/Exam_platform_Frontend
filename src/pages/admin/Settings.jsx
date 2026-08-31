import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout/Layout";
import { API_BASE, api, uploadUrl, readAdmin } from "../../lib/api";
import { FiImage, FiCheck, FiAlertTriangle, FiVideo, FiMic } from "react-icons/fi";
import ExamPicker from "../../components/Admin/ExamPicker";

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
      </div>
    </Layout>
  );
};

export default Settings;
