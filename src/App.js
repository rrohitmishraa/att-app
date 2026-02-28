import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Attendance from "./pages/Attendance";
import Batches from "./pages/Batches";
import PublicAttendance from "./pages/PublicAttendance";

import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import { useEffect, useState } from "react";

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  deferredPrompt && (
    <button
      onClick={() => {
        deferredPrompt.prompt();
        setDeferredPrompt(null);
      }}
      className="fixed bottom-6 right-6 bg-black text-white px-4 py-2 rounded-lg"
    >
      Install App
    </button>
  );

  return (
    <Routes>
      {/* ===== PUBLIC ROUTES ===== */}

      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Public student attendance check */}
      <Route path="/check" element={<PublicAttendance />} />

      {/* ===== PROTECTED ROUTES ===== */}

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <Students />
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <Attendance />
          </ProtectedRoute>
        }
      />

      <Route
        path="/batches"
        element={
          <ProtectedRoute>
            <Batches />
          </ProtectedRoute>
        }
      />

      {/* ===== DEFAULT ROUTE ===== */}

      {/* If someone lands on "/" → send them to public check page */}
      <Route path="/" element={<Navigate to="/check" />} />

      {/* Catch all unknown routes */}
      <Route path="*" element={<Navigate to="/check" />} />
    </Routes>
  );
}
