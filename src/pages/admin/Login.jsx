import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { FiLock, FiUser, FiEye, FiEyeOff, FiAlertCircle } from "react-icons/fi";
import { API_BASE, readAdmin, REGISTRATION_ENABLED, PLATFORM_NAME, INSTITUTION_CODE, examApi } from "../../lib/api";
import SignInFrame from "../../components/Layout/SignInFrame";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { adminLogin, isAdminAuthenticated } = useAuth();

  // 👉 STEP 6: Get admin data for the Header (persists name on login screen if already logged once)
  const savedAdmin = readAdmin();

  /**
   * The institution this deployment belongs to.
   *
   * Previously the college's name only appeared if someone had signed in on
   * this browser before, so a fresh machine on exam morning showed a generic
   * page. The candidate side already resolves this by code; the staff side now
   * does the same.
   */
  const [institution, setInstitution] = useState(null);
  useEffect(() => {
    examApi.institution(INSTITUTION_CODE).then(setInstitution).catch(() => setInstitution(null));
  }, []);

  const collegeName = institution?.collegeName || savedAdmin?.collegeName || PLATFORM_NAME;
  const collegeLogo = institution?.collegeLogo || savedAdmin?.collegeLogo || null;

  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdminAuthenticated) {
      navigate("/admin/dashboard");
    }
  }, [isAdminAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: credentials.username,
          password: credentials.password
        })
      });

      const data = await res.json();

      if (res.ok) {
        // adminLogin stores the token and the profile; the response no longer
        // contains a password field to leak into localStorage.
        adminLogin(data);
        navigate("/admin/dashboard", { replace: true });
      } else {
        setError(data.message || "Invalid email or password");
      }
    } catch (err) {
      console.error(err);
      setError("Login failed. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SignInFrame
      logo={collegeLogo}
      title={collegeName}
      paused={loading}
      tagline="Staff sign-in for setting papers, enrolling candidates and watching a sitting."
      notes={[
        "Build a paper by importing a PDF or Word question paper.",
        "Enrol a batch and issue hall tickets in one step.",
        "Watch the hall live, and publish results the moment it closes.",
      ]}
    >
      <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
      <p className="mt-1 text-sm text-slate-500">
        Use the staff account your institution issued you.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email address
          </label>
          <div className="relative">
            <FiUser className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              autoComplete="username"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none
                         transition-colors focus:border-primary-600 focus:ring-4 focus:ring-primary-600/10"
              placeholder="you@college.edu"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Password
          </label>
          <div className="relative">
            <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-11 text-sm outline-none
                         transition-colors focus:border-primary-600 focus:ring-4 focus:ring-primary-600/10"
              placeholder="Your password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              required
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <FiAlertCircle className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-primary-700 text-sm font-semibold text-white shadow-sm
                     transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        {REGISTRATION_ENABLED && (
          <p className="pt-1 text-center text-sm text-slate-500">
            New institution?{" "}
            <Link to="/admin/register" className="font-semibold text-primary-700 hover:underline">
              Create an account
            </Link>
          </p>
        )}
      </form>
    </SignInFrame>
  );
};

export default AdminLogin;