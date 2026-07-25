import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout/Layout";
import { API_BASE, api, uploadUrl, readAdmin } from "../../lib/api";
import { FiImage, FiCheck, FiAlertTriangle } from "react-icons/fi";

/**
 * The institution's own settings — currently just its name and logo.
 *
 * This is what Create Exam now reads from automatically. Before this page
 * existed, the logo lived only inside each exam's own form, so it had to be
 * re-uploaded from scratch every single time an exam was created. Set once
 * here, it is reused for every future exam without asking again.
 */

const Settings = () => {
  const [collegeName, setCollegeName] = useState("");
  const [logo, setLogo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

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
      </div>
    </Layout>
  );
};

export default Settings;
