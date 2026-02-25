import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const linkBase = "block px-4 py-2 rounded-lg text-sm font-medium transition";

  const activeStyle = "bg-black text-white";
  const inactiveStyle = "text-gray-600 hover:bg-gray-200";

  const navLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/students", label: "Students" },
    { to: "/batches", label: "Batches" },
    { to: "/attendance", label: "Attendance" },
  ];

  return (
    <div className="bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        {/* Left */}
        <div className="flex items-center gap-6">
          <h1 className="font-semibold text-lg">Admin Panel</h1>

          {/* Desktop Links */}
          <div className="hidden md:flex gap-2">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? activeStyle : inactiveStyle}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Desktop Logout */}
        <div className="hidden md:block">
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            Logout
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-gray-700"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {open && (
        <div className="md:hidden border-t bg-white px-4 py-4 space-y-2">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `${linkBase} ${isActive ? activeStyle : inactiveStyle}`
              }
            >
              {link.label}
            </NavLink>
          ))}

          <button
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
