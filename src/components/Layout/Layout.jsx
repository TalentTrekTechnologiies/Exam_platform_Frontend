// src/components/Layout/Layout.jsx
import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";
import MobileNav from "./MobileNav";
import { readAdmin } from "../../lib/api";

const Layout = ({ children, title, subtitle }) => {
  // ADDED: Retrieve admin data from localStorage
  const admin = readAdmin();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} isMobile={isMobile} />
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} isMobile={isMobile} onClose={() => setSidebarOpen(false)} />
        <MobileNav isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main
          className={`flex-1 transition-all duration-300 ${
            !isMobile && sidebarOpen ? "ml-64" : "ml-0"
          }`}
        >
          <div className="p-6 md:p-8">
            {title && (
              <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h1>
                {/* UPDATED: Dynamic welcome message based on admin data */}
                <p className="text-gray-500 mt-1">
                  {/* A greeting belongs on the dashboard, not under "Publish
                      Exam". Pages say what they are for, or say nothing. */}
                  {subtitle ?? admin?.collegeName ?? ""}
                </p>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;