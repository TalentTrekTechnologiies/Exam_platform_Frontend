// src/pages/admin/StudentManagement.jsx
import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout/Layout";
import Card, { CardHeader, CardBody } from "../../components/UI/Card";
import Input from "../../components/UI/Input";
import { FiSearch, FiFilter, FiDownload, FiUploadCloud } from "react-icons/fi";
import { API_BASE } from "../../lib/api";

const StudentManagement = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // 🚀 STEP 1 — ADD STATE (AUTO-FILL FROM LOCALSTORAGE)
  const [file, setFile] = useState(null);
  const [examId, setExamId] = useState(localStorage.getItem("examId") || "");
  const [slotId, setSlotId] = useState(localStorage.getItem("slotId") || "");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const API_URL = API_BASE;
      const token = localStorage.getItem('admin_token');
      
      const response = await fetch(`${API_URL}/admin/students`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStudents(data);
      } else {
        const localStudents = JSON.parse(localStorage.getItem('students') || '[]');
        setStudents(localStudents);
      }
    } catch (error) {
      console.error("Error fetching students:", error);
      const localStudents = JSON.parse(localStorage.getItem('students') || '[]');
      setStudents(localStudents);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 STEP 2 — ADD UPLOAD FUNCTION
  const handleUpload = async () => {
    if (!file || !examId || !slotId) {
      alert("Missing file / exam / slot. Please ensure you have selected an exam and slot.");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("examId", examId);
      formData.append("slotId", slotId);

      const res = await fetch(`${API_BASE}/admin/students/upload`, {
        method: "POST",
        body: formData
      });

      const report = await res.json();

      if (!res.ok) {
        alert(report.message || "Upload failed");
        return;
      }

      // Surface rejected rows instead of a blanket success message.
      let message = report.summary;
      if (report.errors?.length) {
        message += "\n\nRejected rows:\n" + report.errors
          .slice(0, 15)
          .map((e) => `  Line ${e.line}: ${e.reason}`)
          .join("\n");
      }
      alert(message);
      fetchStudents(); // refresh list

    } catch (err) {
      console.error(err);
      alert("Upload failed — could not reach the server.");
    } finally {
      setUploading(false);
    }
  };

  const getStudentStatus = (student) => {
    const results = JSON.parse(localStorage.getItem('examResults') || '[]');
    const studentResult = results.find(r => r.studentId === student.hallTicket);
    
    if (studentResult) return "completed";
    if (student.active === false) return "pending";
    return "registered";
  };

  const getStudentScore = (student) => {
    const results = JSON.parse(localStorage.getItem('examResults') || '[]');
    const studentResult = results.find(r => r.studentId === student.hallTicket);
    return studentResult ? studentResult.score : "-";
  };

  const getStudentDate = (student) => {
    if (student.registeredAt) {
      return new Date(student.registeredAt).toLocaleDateString();
    }
    return "-";
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch = (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
                          (s.hallTicket || "").includes(search);
    const studentStatus = getStudentStatus(s);
    const matchesStatus = statusFilter === "all" || studentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const API_URL = API_BASE;
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/admin/students/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `students_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        exportLocalToCSV();
      }
    } catch (error) {
      console.error("Export failed:", error);
      exportLocalToCSV();
    } finally {
      setExporting(false);
    }
  };

  const exportLocalToCSV = () => {
    const headers = ["Hall Ticket", "Name", "Status", "Score", "Registered Date"];
    const rows = filteredStudents.map(s => [
      s.hallTicket,
      s.name,
      getStudentStatus(s),
      getStudentScore(s),
      getStudentDate(s)
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case "completed":
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Completed</span>;
      case "registered":
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">Registered</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">Pending</span>;
    }
  };

  if (loading) {
    return (
      <Layout title="Student Management">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Student Management">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search by name or hall ticket..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="registered">Registered</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={exportToCSV}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 text-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                >
                  <FiDownload /> {exporting ? "Exporting..." : "Export CSV"}
                </button>
              </div>
            </div>

            {/* 🔥 STEP 3 — ADD UPLOAD UI & INFO */}
            <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 gap-4">
              <div className="flex flex-col text-sm text-gray-600">
                <span className="font-bold text-indigo-600">Auto-filled Context:</span>
                <span>Exam ID: {examId || "Not set"} | Slot ID: {slotId || "Not set"}</span>
              </div>
              
              <div className="flex gap-3 items-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />

                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                >
                  <FiUploadCloud />
                  {uploading ? "Uploading..." : "Upload Students CSV"}
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hall Ticket</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const status = getStudentStatus(student);
                    const score = getStudentScore(student);
                    const date = getStudentDate(student);
                    
                    return (
                      <tr key={student.id || student.hallTicket} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{student.hallTicket}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{student.name}</td>
                        <td className="px-6 py-4">{getStatusBadge(status)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-600">{score}%</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{date}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                      No students found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 pt-4 border-t flex justify-between text-sm text-gray-500">
            <span>Total Students: {students.length}</span>
            <span>Completed: {students.filter(s => getStudentStatus(s) === "completed").length}</span>
            <span>Registered: {students.filter(s => getStudentStatus(s) === "registered").length}</span>
          </div>
        </CardBody>
      </Card>
    </Layout>
  );
};

export default StudentManagement;