import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { FiBookOpen, FiAlertCircle } from "react-icons/fi";
import { examApi, clearStudentSession, uploadUrl, INSTITUTION_CODE, PLATFORM_NAME } from "../../lib/api";

const Verification = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ hallTicket: "", name: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [institution, setInstitution] = useState(null);

  // A candidate should recognise their own college on the page they sign in to.
  useEffect(() => {
    if (!INSTITUTION_CODE) return;
    examApi.institution(INSTITUTION_CODE).then(setInstitution).catch(() => setInstitution(null));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError("");

    const hallTicket = formData.hallTicket.trim();
    const name = formData.name.trim();

    if (!hallTicket || !name) {
      setApiError("Enter both your hall ticket number and your name.");
      setIsLoading(false);
      return;
    }

    try {
      const data = await examApi.validate(hallTicket, name);

      // Clear the PREVIOUS candidate's session — exam halls reuse machines and a
      // stale attemptId would cross the wires. Deliberately targeted rather than
      // localStorage.clear(): an invigilator is often signed in as admin on the
      // same browser, and wiping everything would silently log them out.
      clearStudentSession();

      localStorage.setItem("hallTicket", hallTicket);
      localStorage.setItem("studentName", data.studentName || name);
      localStorage.setItem("studentId", data.studentId);
      localStorage.setItem("student_examId", data.examId);
      localStorage.setItem("student_slotId", data.slotId);

      // login() stores the token; every later student call carries it.
      login({
        token: data.token,
        hallTicket: data.hallTicket || hallTicket,
        name: data.studentName || name,
        studentId: data.studentId,
        examId: data.examId,
        slotId: data.slotId,
        isVerified: true,
      });

      navigate("/instructions", { replace: true });
    } catch (error) {
      // The server's message is the useful one: wrong details, window closed,
      // already submitted. Falling back only when there isn't one.
      setApiError(error.message || "Verification failed. Please check your details.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex h-14 items-center bg-chrome px-6">
        <div className="flex items-center gap-2.5">
          {institution?.collegeLogo ? (
            <img
              src={uploadUrl(institution.collegeLogo)}
              alt=""
              className="h-8 w-8 rounded bg-white/95 object-contain p-0.5"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <FiBookOpen className="text-white/80" />
          )}
          <span className="text-[13px] font-semibold text-white">
            {institution?.collegeName || PLATFORM_NAME}
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">

          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Candidate sign in
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Enter the details exactly as printed on your hall ticket.
            </p>
          </div>

          <div className="rounded-exam border border-gray-200 bg-white p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {apiError && (
                <div className="flex items-start gap-3 rounded-exam border border-red-200 bg-red-50 px-4 py-3">
                  <FiAlertCircle className="mt-0.5 shrink-0 text-status-unanswered" />
                  <p className="text-sm font-medium text-red-900">{apiError}</p>
                </div>
              )}

              <div>
                <label htmlFor="hallTicket" className="exam-label mb-2 block">
                  Hall ticket number
                </label>
                <input
                  id="hallTicket"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                  className="w-full rounded-exam border border-gray-300 px-4 py-3 font-medium
                             tabular tracking-wide text-gray-900 outline-none transition-colors
                             placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400
                             focus:border-primary-600"
                  placeholder="e.g. 24EAM10234"
                  value={formData.hallTicket}
                  onChange={(e) => setFormData({ ...formData, hallTicket: e.target.value })}
                  required
                />
              </div>

              <div>
                <label htmlFor="candidateName" className="exam-label mb-2 block">
                  Candidate full name
                </label>
                <input
                  id="candidateName"
                  type="text"
                  autoComplete="name"
                  className="w-full rounded-exam border border-gray-300 px-4 py-3 font-medium
                             text-gray-900 outline-none transition-colors
                             placeholder:font-normal placeholder:text-gray-400
                             focus:border-primary-600"
                  placeholder="As printed on your hall ticket"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="exam-action-primary w-full py-3.5 text-base"
              >
                {isLoading ? "Verifying…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
            Trouble signing in? Contact your invigilator.
            <br />
            Do not share your hall ticket number with anyone.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Verification;