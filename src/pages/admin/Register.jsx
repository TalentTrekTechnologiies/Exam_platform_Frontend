import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom"; // Added Link for navigation
import { API_BASE } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";

export default function AdminRegister() {
  const navigate = useNavigate();
  const { adminLogin } = useAuth();
  const [form, setForm] = useState({
    collegeName: "",
    email: "",
    password: "",
    address: "",
    logo: null
  });

  const handleSubmit = async () => {
    if (!form.collegeName || !form.email || !form.password) {
      alert("Please fill in all required fields.");
      return;
    }
    // Mirrors the server's rule, so the user finds out before a round trip.
    if (form.password.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }

    const data = new FormData();
    data.append("collegeName", form.collegeName);
    data.append("email", form.email);
    data.append("password", form.password);
    data.append("collegeAddress", form.address);
    // Only append a logo if one was chosen — appending null sends the string
    // "null" as a file and the upload validator rejects the whole request.
    if (form.logo) data.append("logo", form.logo);

    try {
      const res = await fetch(`${API_BASE}/admin/register`, {
        method: "POST",
        body: data
      });
      const body = await res.json();

      if (!res.ok) {
        alert(body.message || "Registration failed");
        return;
      }

      // Registration signs the institution straight in.
      adminLogin(body);
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      alert("Registration failed — could not reach the server.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Create Account</h2>
          <p className="text-slate-500 text-sm mt-1">Register your institution to get started</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 ml-1">College Name</label>
            <input 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="e.g. Stanford University"
              onChange={e => setForm({...form, collegeName: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 ml-1">Email Address</label>
            <input 
              type="email"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="admin@college.edu"
              onChange={e => setForm({...form, email: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 ml-1">Password</label>
            <input 
              type="password" 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="••••••••"
              onChange={e => setForm({...form, password: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 ml-1">College Logo</label>
            <input 
              type="file"
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              onChange={e => setForm({...form, logo: e.target.files[0]})} 
            />
          </div>

          <button 
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-all active:scale-[0.98] mt-4"
          >
            Register
          </button>

          <div className="text-center mt-6">
            <p className="text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/admin/login" className="text-blue-600 font-semibold hover:underline">
                Login here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}