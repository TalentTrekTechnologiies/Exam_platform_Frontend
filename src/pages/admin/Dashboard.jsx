import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import Card from "../../components/UI/Card";
import { BarChart } from "../../components/UI/Chart";
import { FiUsers, FiBook, FiClock, FiAward, FiPlusCircle, FiList, FiCheckSquare, FiCalendar, FiArrowRight, FiEdit3 } from "react-icons/fi";
import { useExam } from "../../contexts/ExamContext";
import { API_BASE, api, uploadUrl, readAdmin } from "../../lib/api";

const Dashboard = () => {
  const navigate = useNavigate();
  const { questions, examSettings } = useExam();

  // ✅ STEP 2: USE REAL ADMIN DATA
  const admin = readAdmin();

  const [stats, setStats] = useState({
    totalStudents: 0,
    questionsBank: 0,
    avgScore: 0,
    examDuration: 0
  });

  // The exam most recently worked on that was never published — offered back
  // as "continue where you left off". Previously there was no way back to an
  // unfinished exam at all once you navigated away; only an accident of
  // localStorage sometimes made it look like the app remembered.
  const [inProgressExam, setInProgressExam] = useState(null);
  
  const [chartData, setChartData] = useState({
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      { label: "Students Registered", data: [0, 0, 0, 0, 0, 0], backgroundColor: "#4f46e5", borderRadius: 8 },
      { label: "Exams Completed", data: [0, 0, 0, 0, 0, 0], backgroundColor: "#10b981", borderRadius: 8 },
    ],
  });
  
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    (async () => {
      try {
        const exams = await api.get("/admin/exam");
        // Newest first already; the first unpublished one is what "in progress" means.
        const unfinished = (exams || []).find((e) => !e.published);
        setInProgressExam(unfinished || null);
      } catch {
        // Silent — this banner is a convenience, not something worth failing loudly over.
      }
    })();
  }, []);

  const resumeInProgress = () => {
    if (!inProgressExam) return;
    localStorage.setItem("examId", String(inProgressExam.id));
    navigate("/admin/sections");
  };

  const fetchDashboardData = async () => {
    try {
      const API_URL = API_BASE;
      const token = localStorage.getItem('admin_token');
      
      // These endpoints return an object, not a bare number. Unwrapping matters:
      // handing React the object itself throws "Objects are not valid as a React
      // child" and takes the whole dashboard down.
      const studentsRes = await fetch(`${API_URL}/admin/students/count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const totalStudents = studentsRes.ok ? Number((await studentsRes.json())?.count ?? 0) : 0;

      const avgScoreRes = await fetch(`${API_URL}/admin/exams/average-score`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const avgScore = avgScoreRes.ok ? Number((await avgScoreRes.json())?.average ?? 0) : 0;
      
      const activitiesRes = await fetch(`${API_URL}/admin/activities/recent`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const activities = activitiesRes.ok ? await activitiesRes.json() : [];
      
      const chartRes = await fetch(`${API_URL}/admin/charts/monthly`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const chartDataFromAPI = chartRes.ok ? await chartRes.json() : null;
      
      setStats({
        totalStudents: totalStudents,
        questionsBank: questions.length,
        avgScore: avgScore,
        examDuration: examSettings?.duration || 180
      });
      
      setRecentActivities(activities);
      
      if (chartDataFromAPI) {
        setChartData({
          labels: chartDataFromAPI.labels,
          datasets: [
            { ...chartData.datasets[0], data: chartDataFromAPI.registrations },
            { ...chartData.datasets[1], data: chartDataFromAPI.completions }
          ]
        });
      }
      
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const displayStats = [
    { title: "Total Students", value: stats.totalStudents, icon: FiUsers, color: "bg-indigo-500" },
    { title: "Questions Bank", value: stats.questionsBank, icon: FiBook, color: "bg-green-500" },
    { title: "Avg. Score", value: `${stats.avgScore}%`, icon: FiAward, color: "bg-yellow-500" },
    { title: "Exam Duration", value: `${stats.examDuration} min`, icon: FiClock, color: "bg-purple-500" },
  ];

  if (loading) {
    return (
      // ✅ STEP 3: REPLACE HARDCODED TITLE
      <Layout title={admin?.collegeName || "Dashboard Overview"}>
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    // ✅ STEP 3: REPLACE HARDCODED TITLE
    <Layout title={admin?.collegeName || "Dashboard Overview"}>
      
      {/* Profile & Logo Section */}
      <div className="flex items-center justify-between mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          {/* ✅ STEP 5: DISPLAY COLLEGE LOGO */}
          {admin?.collegeLogo ? (
            <img
              src={uploadUrl(admin.collegeLogo)}
              alt="logo"
              className="border border-slate-200 shadow-sm"
              style={{ width: "50px", height: "50px", borderRadius: "50%", objectFit: "cover" }}
              // No logo set is a normal state, not a broken image — hide rather
              // than reach out to a third-party placeholder service for it.
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
              {(admin?.collegeName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-800 leading-none">{admin?.collegeName}</h2>
            {/* ✅ STEP 4: DISPLAY ADMIN EMAIL */}
            <p className="text-sm text-slate-500 mt-1">{admin?.email}</p>
          </div>
        </div>
        <div className="hidden md:block text-right">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Administrator Access</p>
          <p className="text-xs text-slate-400">Authenticated Session</p>
        </div>
      </div>

      {inProgressExam && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <FiEdit3 />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Continue where you left off — "{inProgressExam.title}" isn't published yet.
              </p>
              <p className="text-xs text-amber-700">Exam #{inProgressExam.id} · started but not finished</p>
            </div>
          </div>
          <button
            onClick={resumeInProgress}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            Resume <FiArrowRight />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={() => navigate("/admin/create-exam")}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <FiPlusCircle /> Create Exam
        </button>

        <button
          onClick={() => navigate("/admin/sections")}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <FiList /> Add Sections
        </button>

        <button
          onClick={() => navigate("/admin/questions")}
          className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <FiCheckSquare /> Add Questions
        </button>

        <button
          onClick={() => navigate("/admin/slots")}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <FiCalendar /> Create Slot
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {displayStats.map((stat, idx) => (
          <Card key={idx} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color} bg-opacity-10`}>
                <stat.icon className={`text-xl ${stat.color.replace("bg-", "text-")}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <Card className="p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Registration & Performance Trend</h3>
          <div className="h-80">
            <BarChart data={chartData} />
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{activity.studentName} {activity.action}</p>
                    <p className="text-xs text-gray-400">{activity.time}</p>
                  </div>
                  {activity.score && <span className="text-sm text-green-600">Score: {activity.score}%</span>}
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">No recent activity.</p>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;