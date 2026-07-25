import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { FiLock, FiUser, FiEye, FiEyeOff, FiAlertCircle } from "react-icons/fi";
import { API_BASE, readAdmin, REGISTRATION_ENABLED, PLATFORM_NAME } from "../../lib/api";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { adminLogin, isAdminAuthenticated } = useAuth();

  // 👉 STEP 6: Get admin data for the Header (persists name on login screen if already logged once)
  const savedAdmin = readAdmin();

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white p-10 rounded-2xl shadow-sm border border-slate-200">
        
        <div className="mb-8 text-center">
          {/* 👉 STEP 6: Dynamic College Name */}
          <h2 className="text-2xl font-bold text-slate-800">
            {savedAdmin?.collegeName || PLATFORM_NAME}
          </h2>
          <p className="text-slate-500 text-sm mt-1">Enter your credentials to access your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5 ml-1">Email Address</label>
            <div className="relative">
              <FiUser className="absolute left-3 top-3.5 text-slate-400" />
              <input
                type="email"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                placeholder="admin@college.edu"
                value={credentials.username}
                onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5 ml-1">Password</label>
            <div className="relative">
              <FiLock className="absolute left-3 top-3.5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                placeholder="••••••••"
                value={credentials.password}
                onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                required
              />
              <button 
                type="button" 
                className="absolute right-3 top-3.5 text-slate-400 hover:text-blue-500 transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-3 rounded-lg border border-red-100">
              <FiAlertCircle className="flex-shrink-0" /> {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-sm transition-all active:scale-[0.98] mt-2 disabled:bg-blue-300"
          >
            {loading ? "Verifying..." : "Sign In"}
          </button>

          {/* A dedicated install has no self-registration to invite anyone to. */}
          {REGISTRATION_ENABLED && (
            <div className="text-center mt-8 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                New here?{" "}
                <Link to="/admin/register" className="text-blue-600 font-semibold hover:underline">
                  Create an institution account
                </Link>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;