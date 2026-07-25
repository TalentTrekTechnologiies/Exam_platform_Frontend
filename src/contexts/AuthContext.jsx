import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { tokens } from "../lib/api";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const readJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    setUser(readJson("exam_user"));
    // Presence of a token is what makes a session real — a stale `admin` blob
    // with no token would render the dashboard only for every call to 401.
    if (tokens.getAdmin()) setAdmin(readJson("admin"));
  }, []);

  const login = useCallback((studentData) => {
    if (studentData.token) tokens.setStudent(studentData.token);
    const { token, ...safe } = studentData;
    setUser(safe);
    localStorage.setItem("exam_user", JSON.stringify(safe));
  }, []);

  const adminLogin = useCallback((adminData) => {
    if (adminData.token) tokens.setAdmin(adminData.token);
    const { token, ...safe } = adminData;
    setAdmin(safe);
    localStorage.setItem("admin", JSON.stringify(safe));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAdmin(null);
    tokens.clearAdmin();
    tokens.clearStudent();
    localStorage.removeItem("exam_user");
    localStorage.removeItem("admin");
    localStorage.removeItem("exam_admin");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        admin,
        isAdmin: !!admin,
        isAdminAuthenticated: !!admin,
        login,
        adminLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
