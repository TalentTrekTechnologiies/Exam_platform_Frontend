import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { tokens } from "../lib/api";

/**
 * Navigation guards.
 *
 * These decide what to render, nothing more. The real boundary is server-side:
 * every /admin and /student endpoint requires a valid bearer token and checks
 * ownership. Clearing localStorage in devtools gets you a blank dashboard whose
 * every request 401s, not access to anyone's data.
 */

export const RequireVerified = ({ children }) => {
  const location = useLocation();
  const ready = tokens.getStudent() && localStorage.getItem("student_examId");

  if (!ready) return <Navigate to="/verify" replace state={{ from: location.pathname }} />;
  return children;
};

export const RequireAttempt = ({ children }) => {
  const location = useLocation();
  const ready = tokens.getStudent() && localStorage.getItem("attemptId");

  if (!ready) return <Navigate to="/verify" replace state={{ from: location.pathname }} />;
  return children;
};

export const RequireAdmin = ({ children }) => {
  const location = useLocation();

  if (!tokens.getAdmin()) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return children;
};
