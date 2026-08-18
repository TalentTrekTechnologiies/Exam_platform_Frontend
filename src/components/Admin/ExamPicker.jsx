import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { FiPlusCircle, FiChevronRight, FiAlertCircle } from "react-icons/fi";

/**
 * What a screen shows when it needs an exam and none is open.
 *
 * Every admin screen works on "the exam you are currently building", held in
 * local storage. Only the Dashboard ever set it, so any other route — a
 * bookmark, a refresh on a different machine, a cleared browser — landed on a
 * dead end that named the problem and offered no way out of it. The fix is
 * simply to let the exam be chosen from wherever you happen to be.
 *
 * Choosing reloads deliberately: screens read the exam once as they mount, so
 * a reload is what makes the whole page agree on the new one. It happens at
 * most once per visit, and it is not the path anyone stays on.
 */
export default function ExamPicker({ what = "This screen" }) {
  const navigate = useNavigate();
  const [exams, setExams] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const list = await api.get("/admin/exam");
        setExams(Array.isArray(list) ? list : []);
      } catch (e) {
        setError(e.message || "Could not load your exams.");
        setExams([]);
      }
    })();
  }, []);

  const choose = (exam) => {
    localStorage.setItem("examId", String(exam.id));
    window.location.reload();
  };

  if (exams === null) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        Loading your exams…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-exam border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <FiAlertCircle className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Could not load your exams.</p>
          <p className="mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="rounded-exam border border-gray-200 bg-white p-10 text-center">
        <p className="font-semibold text-gray-900">You have not created an exam yet.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          {what} works on one exam at a time. Create your first one to get started.
        </p>
        <button
          onClick={() => navigate("/admin/create-exam")}
          className="exam-action-primary mx-auto mt-5 flex items-center gap-2"
        >
          <FiPlusCircle /> Create an exam
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-exam border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-5">
        <p className="font-semibold text-gray-900">Which exam are you working on?</p>
        <p className="mt-0.5 text-sm text-gray-500">
          {what} follows the exam you pick here. You can switch at any time.
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {exams.map((exam) => (
          <li key={exam.id}>
            <button
              onClick={() => choose(exam)}
              className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-gray-900">
                  {exam.title || `Exam #${exam.id}`}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {exam.published ? "Published" : "Not published yet"}
                  {exam.duration ? ` · ${exam.duration} min` : ""}
                  {exam.startDate ? ` · from ${String(exam.startDate).replace("T", " ").slice(0, 16)}` : ""}
                </span>
              </span>
              <FiChevronRight className="shrink-0 text-gray-400" />
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-gray-200 px-6 py-4">
        <button
          onClick={() => navigate("/admin/create-exam")}
          className="flex items-center gap-2 text-sm font-semibold text-primary-700 hover:underline"
        >
          <FiPlusCircle /> Create a new exam instead
        </button>
      </div>
    </div>
  );
}
