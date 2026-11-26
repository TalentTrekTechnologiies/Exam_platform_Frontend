import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { FiAlertCircle, FiArrowRight, FiUser } from "react-icons/fi";
import { examApi, clearStudentSession, uploadUrl, INSTITUTION_CODE, PLATFORM_NAME } from "../../lib/api";
import SignInFrame from "../../components/Layout/SignInFrame";

const Verification = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ hallTicket: "" });
  /*
   * Who the hall ticket belongs to, once looked up: the candidate confirms
   * their name instead of typing it. Typed names were the commonest reason a
   * real candidate could not get in -- an extra space, initials in another
   * order, a spelling unlike the college's records.
   */
  const [found, setFound] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [notMe, setNotMe] = useState(false);
  const confirmRef = useRef(null);
  const lookupSeq = useRef(0);
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
    if (found) signIn(null);
    else lookup(formData.hallTicket);
  };

  /** Finds the name for a hall ticket. Only the latest request counts. */
  const lookup = async (raw) => {
    const hallTicket = (raw || "").trim();
    if (!hallTicket) { setApiError("Enter your hall ticket number."); return; }
    const seq = ++lookupSeq.current;
    setLookingUp(true);
    setApiError("");
    setNotMe(false);
    try {
      const data = await examApi.lookup(hallTicket);
      if (seq !== lookupSeq.current) return;
      setFound(data);
    } catch (error) {
      if (seq !== lookupSeq.current) return;
      setFound(null);
      // Not found, not open yet, closed, already submitted: the server says which.
      setApiError(error.message || "We could not find that hall ticket number.");
    } finally {
      if (seq === lookupSeq.current) setLookingUp(false);
    }
  };

  // Looked up a moment after typing stops, so the name simply appears.
  useEffect(() => {
    const value = formData.hallTicket.trim();
    if (found || value.length < 4) return;
    const id = setTimeout(() => lookup(value), 700);
    return () => clearTimeout(id);
  }, [formData.hallTicket]); // eslint-disable-line react-hooks/exhaustive-deps

  // The confirm button takes focus, so Enter signs in.
  useEffect(() => { if (found) confirmRef.current?.focus(); }, [found]);

  const signIn = async (examId) => {
    setIsLoading(true);
    setApiError("");

    const hallTicket = (found?.hallTicket || formData.hallTicket).trim();
    const name = (found?.name || "").trim();

    if (!hallTicket || !name) {
      setApiError("Enter your hall ticket number.");
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
      //
      // Only when somebody else is signing in. The same candidate coming back
      // after a power cut or a crashed browser still has answers queued on
      // this machine that never reached the server; clearing them here lost
      // exactly the work the queue exists to protect.
      const sameCandidate =
        localStorage.getItem("studentId") === String(data.studentId)
        && localStorage.getItem("student_examId") === String(data.examId);
      if (!sameCandidate) clearStudentSession();

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
              Enter your hall ticket number. Your name will appear — check it, then sign in.
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
                      {c.opensAt ? ` · opens ${String(c.opensAt).replace("T", " ").slice(0, 16)}` : ""}
                      {c.closesAt ? ` · last entry ${String(c.closesAt).replace("T", " ").slice(0, 16)}` : ""}
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
                  onChange={(e) => {
                    // A different number is a different person: drop the name shown.
                    lookupSeq.current++;
                    setFound(null);
                    setNotMe(false);
                    setApiError("");
                    setLookingUp(false);
                    setFormData({ hallTicket: e.target.value });
                  }}
                  required
                />
              </div>

              {found && (
                <div className="rounded-exam border border-primary-200 bg-primary-50 px-5 py-4">
                  <p className="exam-label">Is this you?</p>
                  <div className="mt-2 flex items-center gap-3">
                    <FiUser className="shrink-0 text-xl text-primary-700" />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-gray-900">{found.name}</p>
                      {(found.branch || found.year) && (
                        <p className="text-sm text-gray-600">
                          {[found.branch, found.year && `Year ${found.year}`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {notMe && (
                <div className="flex items-start gap-3 rounded-exam border border-amber-200 bg-amber-50 px-4 py-3">
                  <FiAlertCircle className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-sm font-medium text-amber-900">
                    Check the hall ticket number. If it is right and the name is not yours, ask your
                    invigilator — do not sign in as someone else.
                  </p>
                </div>
              )}

              <button
                ref={confirmRef}
                type="submit"
                disabled={isLoading || lookingUp}
                className="exam-action-primary w-full py-3.5 text-base"
              >
                {isLoading ? "Signing in…"
                  : lookingUp ? "Finding your name…"
                  : found ? <>Yes, this is me — sign in <FiArrowRight className="ml-1 inline" /></>
                  : "Continue"}
              </button>

              {found && (
                <button
                  type="button"
                  onClick={() => { setFound(null); setNotMe(true); setApiError(""); }}
                  className="w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-800"
                >
                  This is not me
                </button>
              )}
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