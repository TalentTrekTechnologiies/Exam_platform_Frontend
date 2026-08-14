import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiPlus, FiEdit3, FiTrash2, FiArrowRight, FiLayers, FiCheckCircle } from "react-icons/fi";
import Layout from "../../components/Layout/Layout"; // Assuming you use your Layout component
import { API_BASE } from "../../lib/api";

const API_URL = API_BASE;

const SectionManagement = () => {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", totalMarks: "" });

  const examId = localStorage.getItem("examId");

  useEffect(() => {
    if (!examId) {
      // Redirect quietly. A blocking alert() here halts the browser's event loop
      // before React can render or navigate — the page appears frozen until
      // someone dismisses a dialog they may never see.
      navigate("/admin/create-exam", { replace: true });
      return;
    }
    fetchSections();
  }, [examId, navigate]);

  const fetchSections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/section/${examId}`);
      if (res.ok) {
        const data = await res.json();
        setSections(data);
      }
    } catch (err) {
      console.error("Failed to fetch sections:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name) return alert("Section name is required");

    const payload = {
      name: form.name,
      totalMarks: parseInt(form.totalMarks) || 0,
      examId: parseInt(examId)
    };

    const url = editingId 
      ? `${API_URL}/admin/section/${editingId}` 
      : `${API_URL}/admin/section`;
    
    const method = editingId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setForm({ name: "", totalMarks: "" });
        setEditingId(null);
        fetchSections();
      }
    } catch (err) {
      alert("Failed to save section.");
    }
  };

  const handleEdit = (section) => {
    setEditingId(section.id);
    setForm({ name: section.name, totalMarks: section.totalMarks || "" });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this section?")) return;
    try {
      const res = await fetch(`${API_URL}/admin/section/${id}`, { method: "DELETE" });
      if (res.ok) fetchSections();
    } catch (err) {
      alert("Delete failed.");
    }
  };

  return (
    <Layout title="Section Management">
      <div className="max-w-4xl mx-auto py-10 px-6">
        {/* Header Section */}
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
            <FiLayers className="text-indigo-600" /> Structure Your Exam
          </h1>
          <p className="text-gray-500 mt-2">Exam ID: <span className="font-mono text-indigo-600">#{examId}</span> • Define segments like Physics, Math, or Aptitude.</p>
        </div>

        {/* Premium Form Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/50 border border-indigo-50 p-8 mb-10 transition-all hover:shadow-2xl hover:shadow-indigo-200/40">
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Section Name</label>
              <input
                placeholder="e.g. Logical Reasoning"
                className="w-full px-5 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-gray-700 font-medium"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Total Marks</label>
              <input
                type="number"
                placeholder="0"
                className="w-full px-5 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-gray-700 font-medium"
                value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${
                editingId 
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200" 
                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
              }`}
            >
              {editingId ? <><FiCheckCircle /> Update Section</> : <><FiPlus /> Add Section</>}
            </button>
          </form>
        </div>

        {/* Sections List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">Current Architecture</h3>
          {loading ? (
            <div className="animate-pulse flex space-x-4 p-6 bg-gray-50 rounded-2xl">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-3xl">
              <p className="text-gray-400 font-medium">No sections added to this exam yet.</p>
            </div>
          ) : (
            sections.map((s, index) => (
              <div 
                key={s.id} 
                className="group flex justify-between items-center p-6 bg-white border border-gray-100 rounded-3xl hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all duration-300"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-lg">{s.name}</h4>
                    <p className="text-sm text-gray-400 font-medium flex items-center gap-1">
                      Target Score: <span className="text-indigo-500">{s.totalMarks || 0} Marks</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleEdit(s)}
                    className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Edit Section"
                  >
                    <FiEdit3 size={20} />
                  </button>
                  <button 
                    onClick={() => handleDelete(s.id)}
                    className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Delete Section"
                  >
                    <FiTrash2 size={20} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Navigation */}
        <div className="mt-12 flex items-center justify-between border-t border-gray-100 pt-8">
          <div>
            <p className="text-sm text-gray-400 font-medium">
              {sections.length} Section{sections.length !== 1 ? 's' : ''} Defined
            </p>
            {/* Not a block — sections also get created automatically from a
                CSV's sectionName column or a document import's section
                headings, so having none here yet is a normal state, not an
                error, for anyone about to import a paper rather than type one. */}
            {sections.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">
                No sections yet — that's fine if you're importing a question paper, it'll add them for you.
              </p>
            )}
          </div>
          <button
            onClick={() => navigate("/admin/questions")}
            className="group px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold flex items-center gap-3 hover:bg-black transition-all shadow-xl active:scale-95"
          >
            Next: Configure Questions <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default SectionManagement;