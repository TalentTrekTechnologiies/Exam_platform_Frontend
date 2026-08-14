import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import Card from "../../components/UI/Card";
import Button from "../../components/UI/Button";
import { FiClock, FiImage, FiChevronRight, FiCheckCircle, FiShield } from "react-icons/fi";
import { API_BASE, api, uploadUrl, readAdmin } from "../../lib/api";

export default function CreateExam() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [exam, setExam] = useState({
    collegeName: "",
    title: "",
    collegeLogo: "",
    duration: 180,
    startDate: "",
    endDate: "",
    positiveMarks: 1,
    negativeMarking: false,
    negativeMarks: 0,
    // ✅ STEP 1: ADD CAMERA & MIC STATE
    enableCamera: false,
    enableMic: false
  });

  // Branding is set once on the Institution Settings page and reused for every
  // exam from here on — this used to be a blank upload field on every single
  // exam, which meant re-choosing the same logo file again and again.
  useEffect(() => {
    (async () => {
      try {
        const me = await api.get("/admin/me");
        setExam((prev) => ({
          ...prev,
          collegeName: prev.collegeName || me.collegeName || "",
          collegeLogo: prev.collegeLogo || me.collegeLogo || "",
        }));
      } catch {
        const cached = readAdmin();
        if (cached) {
          setExam((prev) => ({
            ...prev,
            collegeName: prev.collegeName || cached.collegeName || "",
            collegeLogo: prev.collegeLogo || cached.collegeLogo || "",
          }));
        }
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Empty date fields must go as null, not "" — the server cannot parse an
      // empty string into a date and rejects the whole request.
      const payload = {
        ...exam,
        duration: Number(exam.duration) || 0,
        startDate: exam.startDate || null,
        endDate: exam.endDate || null,
      };

      const res = await fetch(`${API_BASE}/admin/exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // Previously this branch did nothing at all, so a rejected exam looked
        // like a button that simply didn't work.
        const err = await res.json().catch(() => null);
        alert(err?.message || "Could not create the exam. Check the fields and try again.");
        return;
      }

      {
        const data = await res.json();
        localStorage.setItem("examId", data.id);
        localStorage.setItem("examRules", JSON.stringify({
          positiveMarks: Number(exam.positiveMarks),
          negativeMarking: exam.negativeMarking,
          negativeMarks: Number(exam.negativeMarks)
        }));

        // A blocking alert() here used to freeze the entire tab until someone
        // clicked OK, on every single exam created — arriving on the Sections
        // screen (which shows the exam ID right away) is confirmation enough.
        navigate("/admin/sections");
      }
    } catch (err) {
      alert("Error saving exam.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Exam Settings">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create New Exam</h1>
          <p className="text-sm text-gray-500">Configure branding, schedule, and scoring rules.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Branding */}
          <Card className="p-6 border-none shadow-sm ring-1 ring-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-gray-400 uppercase mb-3">College Logo</label>
                {/* Read-only here on purpose — set once in Institution Settings and
                    reused for every exam automatically. Previously this was a blank
                    upload field on every single exam, which meant choosing the same
                    file again and again. */}
                <div className="w-32 h-32 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center bg-gray-50 overflow-hidden">
                  {exam.collegeLogo ? (
                    /* The upload returns a bare filename; without resolving it to
                       the server's /uploads path the browser treats it as relative
                       to the current admin route and 404s. */
                    <img src={uploadUrl(exam.collegeLogo)} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center p-2">
                      <FiImage className="text-2xl text-gray-300 mx-auto mb-1" />
                      <span className="text-[10px] font-medium text-gray-500">No logo set</span>
                    </div>
                  )}
                </div>
                <Link to="/admin/settings" className="mt-2 block text-center text-xs font-semibold text-indigo-600 hover:underline">
                  {exam.collegeLogo ? "Change in Settings" : "Set your logo →"}
                </Link>
              </div>

              <div className="md:col-span-3 space-y-4">
                <input
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="College Name"
                  value={exam.collegeName}
                  onChange={e => setExam({...exam, collegeName: e.target.value})}
                  required
                />
                <input
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Exam Title"
                  value={exam.title}
                  onChange={e => setExam({...exam, title: e.target.value})}
                  required
                />
              </div>
            </div>
          </Card>

          {/* Section 2: Timing */}
          <Card className="p-6 border-none shadow-sm ring-1 ring-gray-200">
            <h2 className="font-bold mb-4 text-gray-800 flex items-center gap-2"><FiClock className="text-indigo-500"/> Timing</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Duration (min)</label>
                <input type="number" className="bg-transparent w-full font-bold text-gray-700 outline-none" value={exam.duration} onChange={e => setExam({...exam, duration: e.target.value})} />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Starts At</label>
                <input type="datetime-local" className="bg-transparent w-full text-xs outline-none" onChange={e => setExam({...exam, startDate: e.target.value})} required />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Ends At</label>
                <input type="datetime-local" className="bg-transparent w-full text-xs outline-none" onChange={e => setExam({...exam, endDate: e.target.value})} required />
              </div>
            </div>
          </Card>

          {/* Section 3: Scoring Rules */}
          <Card className="p-6 border-none shadow-sm ring-1 ring-gray-200">
            <h2 className="font-bold mb-4 text-gray-800 flex items-center gap-2"><FiCheckCircle className="text-green-500"/> Scoring Rules</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-3 bg-gray-50 rounded-xl ring-1 ring-gray-100">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Marks per Question</label>
                <input
                  type="number"
                  step="0.5"
                  className="w-full mt-1 font-bold text-gray-700 outline-none bg-transparent"
                  value={exam.positiveMarks}
                  onChange={e => setExam({ ...exam, positiveMarks: e.target.value })}
                />
              </div>

              <div className="p-3 bg-gray-50 rounded-xl flex items-center justify-between ring-1 ring-gray-100">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Negative Marking</label>
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={exam.negativeMarking}
                  onChange={e => setExam({ ...exam, negativeMarking: e.target.checked })}
                />
              </div>

              <div className={`p-3 rounded-xl transition-all ring-1 ${exam.negativeMarking ? 'bg-red-50 ring-red-100' : 'bg-gray-100 opacity-50 ring-gray-200'}`}>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Penalty per Wrong</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!exam.negativeMarking}
                  className="w-full mt-1 font-bold text-gray-700 outline-none bg-transparent"
                  value={exam.negativeMarks}
                  onChange={e => setExam({ ...exam, negativeMarks: e.target.value })}
                />
              </div>
            </div>
          </Card>

          {/* ✅ STEP 2: ADD UI (PROCTORING SETTINGS) */}
          <Card className="p-6 border-none shadow-sm ring-1 ring-gray-200">
            <h2 className="font-bold mb-4 text-gray-800 flex items-center gap-2">
              <FiShield className="text-red-500"/> Proctoring Settings
            </h2>

            <div className="flex flex-col md:flex-row gap-4">
              <label className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                <span className="font-medium text-gray-700">Enable Camera</span>
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={exam.enableCamera}
                  onChange={(e) =>
                    setExam({ ...exam, enableCamera: e.target.checked })
                  }
                />
              </label>

              <label className="flex-1 flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                <span className="font-medium text-gray-700">Enable Microphone</span>
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={exam.enableMic}
                  onChange={(e) =>
                    setExam({ ...exam, enableMic: e.target.checked })
                  }
                />
              </label>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-4 pt-4">
            <Button 
              type="submit" 
              className="px-10 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95" 
              disabled={loading}
            >
              {loading ? "Saving..." : <>Publish & Next <FiChevronRight /></>}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}