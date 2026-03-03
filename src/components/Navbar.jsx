import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);

  const isPublicAttendance = location.pathname === "/check";
  const isLoginPage = location.pathname === "/login";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const linkBase =
    "block px-4 py-2 rounded-full text-sm font-medium transition-all duration-200";

  const activeStyle = "bg-blue-500 text-white shadow-md shadow-blue-200";
  const inactiveStyle = "text-gray-600 hover:bg-blue-50";

  const navLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/students", label: "Students" },
    { to: "/batches", label: "Batches" },
    { to: "/attendance", label: "Attendance" },
    { to: "/check", label: "Search" },
  ];

  return (
    <div className="sticky top-0 z-50 backdrop-blur-md bg-white/80 shadow-md shadow-black/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        {/* Left */}
        <div className="flex items-center gap-6">
          <Link
            to={user ? "/dashboard" : "/check"}
            className="font-semibold text-xl text-gray-900 tracking-tight"
          >
            Attendance App
          </Link>

          {/* Desktop Admin Links */}
          {user && (
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
          )}
        </div>

        {/* Right Section Desktop */}
        <div className="hidden md:flex items-center gap-3">
          {!user && isPublicAttendance && (
            <Link
              to="/login"
              className="px-5 py-2.5 bg-blue-500 text-white rounded-full shadow-md hover:shadow-lg transition-all duration-200"
            >
              Login
            </Link>
          )}

          {!user && isLoginPage && (
            <Link
              to="/check"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Search Attendance
            </Link>
          )}

          {user && (
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-red-500 text-white rounded-full shadow-md hover:shadow-lg transition-all duration-200"
            >
              Logout
            </button>
          )}
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
        <div className="md:hidden border-t border-gray-100 bg-white/90 backdrop-blur-md px-4 py-4 space-y-2">
          {user &&
            navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive ? activeStyle : "text-gray-700 hover:bg-blue-50"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}

          {!user && isPublicAttendance && (
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="block px-5 py-2.5 bg-blue-500 text-white rounded-full text-center shadow-md"
            >
              Login
            </Link>
          )}

          {!user && isLoginPage && (
            <Link
              to="/check"
              onClick={() => setOpen(false)}
              className="block text-blue-600 text-sm text-center font-medium"
            >
              Search Attendance
            </Link>
          )}

          {user && (
            <button
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
              className="w-full px-5 py-2.5 bg-red-500 text-white rounded-full shadow-md transition"
            >
              Logout
            </button>
          )}
        </div>
      )}
    </div>
  );
}
