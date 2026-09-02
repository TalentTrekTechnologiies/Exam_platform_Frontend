// src/components/Layout/MobileNav.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { FiHome, FiBook, FiUsers, FiSettings, FiBarChart2, FiClock, FiX } from "react-icons/fi";

const MobileNav = ({ isOpen, onClose }) => {
  const navItems = [
    { path: "/admin/dashboard", icon: FiHome, label: "Dashboard" },
    { path: "/admin/questions", icon: FiBook, label: "Questions" },
    { path: "/admin/slots", icon: FiClock, label: "Schedule" },
    { path: "/admin/students", icon: FiUsers, label: "Students" },
    { path: "/admin/settings", icon: FiSettings, label: "Settings" },
    { path: "/admin/reports", icon: FiBarChart2, label: "Reports" },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-64 bg-white shadow-xl animate-slide-in">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Menu</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <FiX className="text-gray-600" />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                ${isActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-50"}
              `}
            >
              <item.icon className="text-xl" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default MobileNav;