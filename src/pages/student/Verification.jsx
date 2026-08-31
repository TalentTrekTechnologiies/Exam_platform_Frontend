import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { FiBookOpen, FiAlertCircle, FiArrowRight } from "react-icons/fi";
import { examApi, clearStudentSession, uploadUrl, INSTITUTION_CODE, PLATFORM_NAME } from "../../lib/api";
import SignInFrame from "../../components/Layout/SignInFrame";

const Verification = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ hallTicket: "", name: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [institution, setInstitution] = useState(null);
  // The sittings open to this candidate when there is more than one, and the
  // one they picked. Empty in the ordinary case, which is every college
  // running a single exam at a time.
  const [choices, setChoices] = useState([]);


  // A candidate should recognise their own college on the page they sign in to.
  useEffect(() => {
    if (!INSTITUTION_CODE) return;
    examApi.institution(INSTITUTION_CODE).then(setInstitution).catch(() => setInstitution(null));
  }, []);

  /**
   * Signs the candidate in.
   *
   * `examId` is passed explicitly rather than read from state: it arrives from
   * the click that chose it, and state set in the same tick would still be the
   * old value here.
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    signIn(null);
  };

  const signIn = async (examId) => {
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
      const data = await examApi.validate(hallTicket, name, examId);

      /*
       * More than one paper is open to this candidate, so the server declined
       * to guess. Which exam somebody is sitting is theirs to say — a college
       * running two subjects in overlapping windows must not be the reason a
       * candidate spends three hours on the wrong one.
       */
      if (data.status === "Choose") {
        setChoices(data.exams || []);
        setIsLoading(false);
        return;
      }
      setChoices([]);

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
    <SignInFrame
      logo={institution?.collegeLogo}
      title={institution?.collegeName || PLATFORM_NAME}
      paused={isLoading}
      tagline="Online examination. Sign in with the details printed on your hall ticket."
      notes={[
        "Have your hall ticket with you before you begin.",
        "Your answers are saved as you go — a dropped connection loses nothing.",
        "The clock runs on the exam server, not on this machine.",
      ]}
    >
      <div>
        <div>

          <div className="mb-8">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Candidate sign in
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter the details exactly as printed on your hall ticket.
            </p>
          </div>

          {choices.length > 0 ? (
            /* More than one paper is open to this candidate. The server
               declined to guess, so they say which one they are sitting. */
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-exam border border-amber-200 bg-amber-50 px-4 py-3">
                <FiAlertCircle className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-sm font-medium text-amber-900">
                  You have more than one exam open. Choose the one you are sitting now —
                  ask your invigilator if you are not sure.
                </p>
              </div>

              {choices.map((c) => (
                <button
                  key={c.examId}
                  onClick={() => signIn(c.examId)}
                  disabled={isLoading}
                  className="flex w-full items-center justify-between gap-4 rounded-exam border border-slate-200
                             bg-white px-5 py-4 text-left transition-colors hover:border-primary-600
                             hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{c.examTitle}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {c.duration ? `${c.duration} minutes` : ""}
                      {c.closesAt ? ` · closes ${String(c.closesAt).replace("T", " ").slice(0, 16)}` : ""}
                    </span>
                  </span>
                  <FiArrowRight className="shrink-0 text-slate-400" />
                </button>
              ))}

              <button
                onClick={() => { setChoices([]); setApiError(""); }}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Back
              </button>
            </div>
          ) : (
          <div>
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
          )}

          <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
            Trouble signing in? Contact your invigilator.
            <br />
            Do not share your hall ticket number with anyone.
          </p>
        </div>
      </div>
    </SignInFrame>
  );
};

export default Verification;