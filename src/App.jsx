import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ExamProvider } from "./contexts/ExamContext";
import { RequireVerified, RequireAttempt, RequireAdmin } from "./routes/Guards";
import { REGISTRATION_ENABLED } from "./lib/api";

// ── Student routes are eager ────────────────────────────────────────────────
// A candidate on a slow exam-hall connection must never wait on a chunk fetch
// mid-exam, so everything they touch ships in the first bundle.
import Verification from "./pages/student/Verification";
import Instructions from "./pages/student/Instructions";
import Exam from "./pages/student/Exam";
import Result from "./pages/student/Result";
import Blocked from "./pages/student/Blocked";

// ── Admin routes are lazy ───────────────────────────────────────────────────
// The admin app pulls in chart.js and xlsx, which together dwarf the exam
// screen. Candidates never open these pages, so they should never download
// them — this is the difference between a fast first paint in a lab of 5,000
// machines and 900 kB of dead weight per seat.
const AdminLogin = lazy(() => import("./pages/admin/Login"));
const AdminRegister = lazy(() => import("./pages/admin/Register"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const CreateExam = lazy(() => import("./pages/admin/CreateExam"));
const SectionManagement = lazy(() => import("./pages/admin/SectionManagement"));
const QuestionManagement = lazy(() => import("./pages/admin/QuestionManagement"));
const StudentManagement = lazy(() => import("./pages/admin/StudentManagement"));
const StudentUpload = lazy(() => import("./pages/admin/StudentUpload"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const Monitor = lazy(() => import("./pages/admin/Monitor"));
const ImportQuestions = lazy(() => import("./pages/admin/ImportQuestions"));
const Publish = lazy(() => import("./pages/admin/Publish"));
const AddCandidates = lazy(() => import("./pages/admin/AddCandidates"));
const ReviewPage = lazy(() => import("./pages/admin/ReviewPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const Loading = () => (
  <div className="grid h-screen place-items-center text-sm font-medium text-gray-500">
    Loading…
  </div>
);

/** Wraps a lazily-loaded admin page in its own suspense boundary. */
const Admin = ({ children, guarded = true }) => (
  <Suspense fallback={<Loading />}>
    {guarded ? <RequireAdmin>{children}</RequireAdmin> : children}
  </Suspense>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <ExamProvider>
          <Routes>
            {/* ── Student ────────────────────────────────────────────────── */}
            <Route path="/" element={<Navigate to="/verify" replace />} />
            <Route path="/verify" element={<Verification />} />
            <Route path="/blocked" element={<Blocked />} />

            <Route path="/instructions" element={<RequireVerified><Instructions /></RequireVerified>} />
            <Route path="/exam" element={<RequireAttempt><Exam /></RequireAttempt>} />
            <Route path="/result" element={<RequireAttempt><Result /></RequireAttempt>} />

            {/* ── Admin ──────────────────────────────────────────────────── */}
            <Route path="/admin/login" element={<Admin guarded={false}><AdminLogin /></Admin>} />
            {/* A dedicated install (KSRM's own module) has no self-registration. */}
            {REGISTRATION_ENABLED && (
              <Route path="/admin/register" element={<Admin guarded={false}><AdminRegister /></Admin>} />
            )}

            <Route path="/admin/dashboard" element={<Admin><AdminDashboard /></Admin>} />
            <Route path="/admin/create-exam" element={<Admin><CreateExam /></Admin>} />
            <Route path="/admin/sections" element={<Admin><SectionManagement /></Admin>} />
            <Route path="/admin/questions" element={<Admin><QuestionManagement /></Admin>} />
            <Route path="/admin/students" element={<Admin><StudentManagement /></Admin>} />
            {/* Previously mapped to /admin/students too, which made it unreachable. */}
            <Route path="/admin/students/add" element={<Admin><AddCandidates /></Admin>} />
            <Route path="/admin/students/upload" element={<Admin><StudentUpload /></Admin>} />
            <Route path="/admin/questions/import" element={<Admin><ImportQuestions /></Admin>} />
            <Route path="/admin/publish" element={<Admin><Publish /></Admin>} />
            <Route path="/admin/monitor" element={<Admin><Monitor /></Admin>} />
            <Route path="/admin/reports" element={<Admin><Reports /></Admin>} />
            <Route path="/admin/review" element={<Admin><ReviewPage /></Admin>} />

            <Route path="*" element={<Suspense fallback={<Loading />}><NotFound /></Suspense>} />
          </Routes>
        </ExamProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
