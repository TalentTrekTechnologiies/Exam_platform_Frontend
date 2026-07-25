// src/components/Layout/TopNav.jsx
import React, { useState, useRef, useEffect } from "react";
import { FiMenu, FiBell, FiUser, FiChevronDown, FiLogOut } from "react-icons/fi";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { readAdmin } from "../../lib/api";

const TopNav = ({ sidebarOpen, setSidebarOpen, isMobile }) => {
  // ✅ STEP 2: ADD THIS AT TOP
  const admin = readAdmin();

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef(null);
  const notificationRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout(); 
    navigate("/admin/login");
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-20">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        {/* Left side - Menu button */}
        <div className="flex items-center space-x-3 md:space-x-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <FiMenu className="text-gray-600 text-xl" />
          </button>
        </div>

        {/* Right side - User */}
        <div className="flex items-center space-x-2 md:space-x-4">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FiBell className="text-gray-600 text-xl" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-100 z-50">
                <div className="p-3 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800">Notifications</h3>
                </div>
                <div className="p-4 text-center text-gray-500 text-sm">
                  No new notifications
                </div>
              </div>
            )}
          </div>

          {/* User Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center space-x-2 md:space-x-3 pl-2 md:pl-4 border-l border-gray-200">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center space-x-2 md:space-x-3"
              >
                <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <FiUser className="text-white text-sm md:text-lg" />
                </div>
                <div className="hidden md:block text-left">
                  {/* 🔥 REPLACED: adminName with admin?.email */}
                  <p className="text-sm font-medium text-gray-700">{admin?.email}</p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
                <FiChevronDown className="text-gray-500 text-sm" />
              </button>
            </div>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-50">
                <div className="p-3 border-b border-gray-100">
                  {/* 🔥 REPLACED: adminName with admin?.email */}
                  <p className="font-medium text-gray-800">{admin?.email}</p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
                <div className="py-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <FiLogOut className="text-red-500" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNav;