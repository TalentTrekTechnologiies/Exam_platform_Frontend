// src/pages/admin/StudentManagement.jsx
import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout/Layout";
import Card, { CardHeader, CardBody } from "../../components/UI/Card";
import Input from "../../components/UI/Input";
import { FiSearch, FiFilter, FiDownload, FiUploadCloud, FiTrash2 } from "react-icons/fi";
import { API_BASE, api } from "../../lib/api";

const StudentManagement = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [selected, setSelected] = useState(new Set());

  // 🚀 STEP 1 — ADD STATE (AUTO-FILL FROM LOCALSTORAGE)
  const [file, setFile] = useState(null);
  const [examId, setExamId] = useState(localStorage.getItem("examId") || "");
  const [slotId, setSlotId] = useState(localStorage.getItem("slotId") || "");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  /**
   * One row per person.
   *
   * This read /admin/students, which returns a row per ENROLMENT — the right
   * answer to "who is in this exam", the wrong one to "who do we have". A
   * candidate sitting three exams came back three times and read as duplicate
   * data entry rather than one person with a history, and React saw the
   * repeated hall ticket as a repeated key. The registry answers the question
   * this page is actually asking.
   */
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await api.get("/admin/students/registry");
      setStudents(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      // This used to fall back to a localStorage list that nothing anywhere
      // has ever written, so a failed request was indistinguishable from a
      // college with no candidates on its books.
      setStudents([]);
      setError(e.message || "Could not load your candidates.");
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

  /** The exams a candidate is on — [] when they are on none. */
  const examsOf = (student) => student.exams || [];

  /**
   * Takes a candidate off the roll.
   *
   * Their marks are deliberately left alone. The server marks the person as
   * removed rather than deleting the row, because Results reads names and hall
   * tickets from it — deleting would wipe the record of every exam they sat.
   * They come off this list, off any exam they have not yet taken, and can no
   * longer sign in; Results shows exactly what it showed before.
   */
  const removeStudents = async (batch) => {
    const ids = batch.map((s) => s.studentId);
    setRemoving(true);
    try {
      // One request whatever the size. Clearing a mistaken upload used to be a
      // round trip per candidate, which for a full roster is the admin sitting
      // watching a progress bar that need not exist.
      await api.post("/admin/students/remove", { studentIds: ids });
      const gone = new Set(ids);
      setStudents((prev) => prev.filter((s) => !gone.has(s.studentId)));
      setSelected(new Set());
      setConfirming(null);
      setError("");
    } catch (e) {
      setError(e.message || "Those candidates could not be removed.");
    } finally {
      setRemoving(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || (s.name || "").toLowerCase().includes(q)
      || (s.hallTicket || "").toLowerCase().includes(q);

    const enrolled = examsOf(s).length > 0;
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "enrolled" && enrolled)
      || (statusFilter === "unenrolled" && !enrolled);

    return matchesSearch && matchesStatus;
  });

  /**
   * Selection follows the filter, never the whole roll.
   *
   * "Select all" ticking rows that are scrolled out of sight behind a search is
   * how someone means to clear twelve mistyped entries and clears the cohort.
   * The header box covers exactly the rows on screen, and the count on the
   * button says so.
   */
  const selectedStudents = filteredStudents.filter((s) => selected.has(s.studentId));
  const allVisibleSelected = filteredStudents.length > 0
    && selectedStudents.length === filteredStudents.length;

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredStudents.forEach((s) => next.delete(s.studentId));
      else filteredStudents.forEach((s) => next.add(s.studentId));
      return next;
    });
  };

  const toggleOne = (studentId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

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
    const headers = ["Hall Ticket", "Name", "Exams"];
    const rows = filteredStudents.map(s => [
      s.hallTicket,
      s.name,
      // Quoted: an exam title may well contain the separator.
      `"${examsOf(s).map((e) => e.examTitle || `Exam #${e.examId}`).join("; ")}"`
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
                  <option value="all">All candidates</option>
                  <option value="enrolled">In an exam</option>
                  <option value="unenrolled">Not in any exam</option>
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
          {selectedStudents.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
              <span className="text-sm font-semibold text-indigo-900">
                {selectedStudents.length} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  Clear
                </button>
                <button
                  onClick={() => setConfirming(selectedStudents)}
                  disabled={removing}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <FiTrash2 /> Remove {selectedStudents.length}
                </button>
              </div>
            </div>
          )}

          {error && students.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      title="Select everything currently shown"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hall Ticket</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exams</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => (
                    <tr
                      key={student.studentId}
                      className={selected.has(student.studentId) ? "bg-indigo-50/60" : "hover:bg-gray-50"}
                    >
                      <td className="w-10 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selected.has(student.studentId)}
                          onChange={() => toggleOne(student.studentId)}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{student.hallTicket}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.name}</td>
                      <td className="px-6 py-4">
                        {examsOf(student).length ? (
                          <div className="flex flex-wrap gap-1">
                            {examsOf(student).map((e) => (
                              <span
                                key={e.examId}
                                className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                              >
                                {e.examTitle || `Exam #${e.examId}`}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Not in any exam</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setConfirming([student])}
                          disabled={removing}
                          title="Take this candidate off the roll — their marks stay in Results"
                          className="rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                      {error || "No students found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 pt-4 border-t flex justify-between text-sm text-gray-500">
            <span>Total candidates: {students.length}{search || statusFilter !== "all" ? ` · showing ${filteredStudents.length}` : ""}</span>
            <span>In an exam: {students.filter(s => examsOf(s).length > 0).length}</span>
            <span>Not in any exam: {students.filter(s => examsOf(s).length === 0).length}</span>
          </div>
        </CardBody>
      </Card>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setConfirming(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {confirming.length === 1
                  ? `Remove ${confirming[0].name}?`
                  : `Remove ${confirming.length} candidates?`}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {confirming.length === 1 ? (
                  <>
                    Hall ticket <span className="font-medium text-gray-900">{confirming[0].hallTicket}</span> comes
                    off your candidate list
                  </>
                ) : (
                  <>They come off your candidate list</>
                )}{" "}
                and off any exam they have not sat yet, and they can no longer sign in.
              </p>
              <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                Marks stay in Results. Every exam already sat is left exactly as it is.
              </p>
              {/* Named in full up to a point a person can actually read. */}
              {confirming.length > 1 && (
                <p className="mt-3 max-h-24 overflow-y-auto text-xs text-gray-500">
                  {confirming.slice(0, 20).map((s) => s.hallTicket).join(", ")}
                  {confirming.length > 20 && ` and ${confirming.length - 20} more`}
                </p>
              )}
              {confirming.length === 1 && examsOf(confirming[0]).length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  Currently on: {examsOf(confirming[0]).map((e) => e.examTitle || `Exam #${e.examId}`).join(", ")}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => removeStudents(confirming)}
                disabled={removing}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <FiTrash2 />
                {removing
                  ? "Removing…"
                  : confirming.length === 1 ? "Remove candidate" : `Remove ${confirming.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default StudentManagement;