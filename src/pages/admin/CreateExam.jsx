import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import Card from "../../components/UI/Card";
import Button from "../../components/UI/Button";
import { FiClock, FiImage, FiChevronRight, FiCheckCircle, FiShield , FiPlus } from "react-icons/fi";
import { API_BASE, api, uploadUrl, readAdmin } from "../../lib/api";
import SittingPicker from "../../components/Admin/SittingPicker";

export default function CreateExam() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  /**
   * When candidates may sit, one entry per sitting.
   *
   * A college running a morning and an evening batch had to create the exam,
   * find the Slots screen, and add the second window there — with nothing on
   * the creation form suggesting sittings existed at all. Stating them here
   * means the exam arrives complete.
   */
  const [sittings, setSittings] = useState([{ date: "", from: "", to: "" }]);

  const setSitting = (index, patch) =>
    setSittings((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  // A second sitting is nearly always the same day as the first, so it starts
  // from that date rather than empty.
  const addSitting = () =>
    setSittings((prev) => [...prev, { date: prev[prev.length - 1]?.date || "", from: "", to: "" }]);
  const removeSitting = (index) =>
    setSittings((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

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
      // Ordered so the first and last bound the exam, whatever order they
      // were typed in.
      // Composed here, where the date and the two times finally come together.
      const usable = sittings
        .filter((s) => s.date && s.from && s.to && s.to > s.from)
        .map((s) => ({ startDate: `${s.date}T${s.from}`, endDate: `${s.date}T${s.to}` }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

      if (usable.length === 0) {
        alert("Add at least one sitting, with an end time after its start.");
        setLoading(false);
        return;
      }

      const payload = {
        ...exam,
        duration: Number(exam.duration) || 0,
        // The exam's own window spans every sitting, so an exam that runs
        // morning and evening reads correctly wherever it is summarised.
        startDate: usable.length ? usable[0].startDate : null,
        endDate: usable.length ? usable[usable.length - 1].endDate : null,
        slots: usable.map((s) => ({ startTime: s.startDate, endTime: s.endDate })),
        // The server stores the marking scheme under these names, and applies
        // it to any imported question that doesn't declare its own. Sending
        // only positiveMarks/negativeMarks (as this did) meant the scheme was
        // silently dropped: it lived in this browser's localStorage alone, so
        // a CSV or PDF import fell back to 1 mark and no penalty.
        defaultMarks: Number(exam.positiveMarks) || null,
        defaultNegativeMarks: exam.negativeMarking ? Math.abs(Number(exam.negativeMarks) || 0) : 0,
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

        // Straight to Questions, not Sections.
        //
        // Sections used to sit between the two, but nothing in the normal flow
        // needs it: importing a paper creates sections from the document's own
        // headings, and a CSV creates them from its sectionName column. Sending
        // every admin through a screen they should usually skip made an
        // optional step look mandatory. It stays reachable from the sidebar for
        // anyone typing a paper by hand who wants the structure first.
        navigate("/admin/questions");
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
            <p className="-mt-2 mb-4 text-xs text-gray-500">
              Add one sitting per batch. Candidates are enrolled into a particular sitting,
              so a morning and an evening group can take the same paper at different times.
            </p>

            <div className="p-3 bg-gray-50 rounded-xl mb-4 max-w-xs">
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Duration per candidate (min)</label>
              <input
                type="number"
                className="bg-transparent w-full font-bold text-gray-700 outline-none"
                value={exam.duration}
                onChange={e => setExam({ ...exam, duration: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              {sittings.map((sitting, i) => (
                <SittingPicker
                  key={i}
                  index={i}
                  sitting={sitting}
                  canRemove={sittings.length > 1}
                  onChange={(patch) => setSitting(i, patch)}
                  onRemove={() => removeSitting(i)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addSitting}
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
            >
              <FiPlus /> Add another sitting
            </button>
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