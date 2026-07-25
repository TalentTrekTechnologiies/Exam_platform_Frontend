import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import { API_BASE } from "../../lib/api";
import {
  FiCheckCircle,
  FiFileText, 
  FiPieChart, 
  FiAward, 
  FiClock, 
  FiAlertCircle, 
  FiSend 
} from "react-icons/fi";

const ReviewPage = () => {
  const navigate = useNavigate();
  const examId = localStorage.getItem("examId");
  const rules = JSON.parse(localStorage.getItem("examRules") || "{}");

  const [questions, setQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [qRes, sRes] = await Promise.all([
          fetch(`${API_BASE}/admin/question/${examId}`),
          fetch(`${API_BASE}/admin/section/${examId}`)
        ]);
        const qData = await qRes.json();
        const sData = await sRes.json();
        setQuestions(qData);
        setSections(sData);
      } catch (err) {
        console.error("Review Load Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [examId]);

  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  const handlePublish = () => {
    // Here you would typically call a 'publish' API or simply redirect
    alert("🚀 Exam Live! Redirecting to Dashboard...");
    localStorage.removeItem("examId"); // Clear after finish
    localStorage.removeItem("examRules");
    navigate("/admin/dashboard");
  };

  if (loading) return <div className="flex h-screen items-center justify-center font-bold text-indigo-600">Generating Summary...</div>;

  return (
    <Layout title="Review & Publish">
      <div className="max-w-5xl mx-auto py-12 px-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Final Review</h1>
            <p className="text-gray-500 font-medium">Please verify the exam structure before going live.</p>
          </div>
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 border border-green-100">
            <FiCheckCircle /> Ready to Publish
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard icon={<FiPieChart />} label="Sections" value={sections.length} color="indigo" />
          <StatCard icon={<FiFileText />} label="Questions" value={questions.length} color="blue" />
          <StatCard icon={<FiAward />} label="Max Marks" value={totalMarks} color="purple" />
          <StatCard icon={<FiClock />} label="Rule Set" value={rules.negativeMarking ? `-${rules.negativeMarks} Neg` : "No Neg"} color="orange" />
        </div>

        {/* Breakdown Card */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden mb-10">
          <div className="p-8 border-b border-gray-50 bg-gray-50/50">
            <h3 className="font-bold text-gray-800 text-lg">Section Breakdown</h3>
          </div>
          <div className="p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white">
                  <th className="px-8 py-4">Section Name</th>
                  <th className="px-8 py-4 text-center">Questions</th>
                  <th className="px-8 py-4 text-right">Potential Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sections.map((s) => {
                  const qCount = questions.filter(q => q.sectionId === s.id).length;
                  const sMarks = questions.filter(q => q.sectionId === s.id).reduce((sum, q) => sum + (q.marks || 0), 0);
                  return (
                    <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-8 py-5 font-bold text-gray-700">{s.name}</td>
                      <td className="px-8 py-5 text-center font-mono text-gray-500">{qCount}</td>
                      <td className="px-8 py-5 text-right font-black text-indigo-600">+{sMarks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Zone */}
        <div className="bg-indigo-900 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between shadow-xl shadow-indigo-200">
          <div className="mb-6 md:mb-0">
            <h4 className="text-white font-bold text-xl mb-1 flex items-center gap-2">
              Confirm Deployment
            </h4>
            <p className="text-indigo-200 text-sm max-w-sm">
              Once published, the exam will be visible to students at the scheduled start time.
            </p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate("/admin/questions")}
              className="px-6 py-4 rounded-2xl font-bold text-indigo-200 hover:text-white transition-colors"
            >
              Back to Edit
            </button>
            <button 
              onClick={handlePublish}
              className="px-10 py-4 bg-white text-indigo-900 rounded-2xl font-black flex items-center gap-3 hover:scale-105 transition-all active:scale-95 shadow-lg"
            >
              <FiSend className="text-indigo-600" /> Publish Exam
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

// Sub-component for Stats
const StatCard = ({ icon, label, value, color }) => (
  <div className={`p-6 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center gap-5`}>
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-${color}-50 text-${color}-600`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{label}</p>
      <p className="text-2xl font-black text-gray-800">{value}</p>
    </div>
  </div>
);

export default ReviewPage;