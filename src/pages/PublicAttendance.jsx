import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import Navbar from "../components/Navbar";

export default function PublicAttendance() {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [loading, setLoading] = useState(true);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  useEffect(() => {
    const fetchData = async () => {
      const studentSnap = await getDocs(collection(db, "students"));
      const attendanceSnap = await getDocs(collection(db, "attendance"));
      const batchSnap = await getDocs(collection(db, "batches"));

      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAttendance(attendanceSnap.docs.map((d) => d.data()));
      setBatches(batchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setLoading(false);
    };

    fetchData();
  }, []);

  const formatDateReadable = (dateStr) => {
    const dateObj = new Date(dateStr);

    return dateObj.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handleSearch = () => {
    if (!search.trim()) return;

    const student = students.find((s) =>
      s.name.toLowerCase().includes(search.toLowerCase().trim()),
    );

    if (!student) {
      setResult("notfound");
      return;
    }

    const studentAttendance = attendance.filter(
      (a) => a.studentId === student.id,
    );

    const batch = batches.find((b) => b.id === student.batchId);

    if (!batch || !batch.schedule) {
      setResult({ name: student.name, months: {} });
      return;
    }

    const monthMap = {};

    studentAttendance.forEach((a) => {
      const dateObj = new Date(a.date);

      const monthLabel = dateObj.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      if (!monthMap[monthLabel]) {
        monthMap[monthLabel] = { present: [], absent: [] };
      }

      const formattedDate = formatDateReadable(a.date);

      if (!monthMap[monthLabel].present.includes(formattedDate)) {
        monthMap[monthLabel].present.push(formattedDate);
      }
    });

    Object.keys(monthMap).forEach((monthLabel) => {
      const [monthName, year] = monthLabel.split(" ");
      const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
      const yearNum = parseInt(year);

      const scheduledDays = batch.schedule.map((s) => s.day);
      const daysInMonth = new Date(yearNum, monthIndex + 1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(yearNum, monthIndex, d);
        const dayName = DAYS[dateObj.getDay()];

        if (scheduledDays.includes(dayName)) {
          const formatted = formatDateReadable(dateObj);

          if (!monthMap[monthLabel].present.includes(formatted)) {
            monthMap[monthLabel].absent.push(formatted);
          }
        }
      }

      // Sort dates ascending
      monthMap[monthLabel].present.sort();
      monthMap[monthLabel].absent.sort();
    });

    const sortedMonths = Object.keys(monthMap).sort(
      (a, b) => new Date(b) - new Date(a),
    );

    const sortedMap = {};
    sortedMonths.forEach((m) => (sortedMap[m] = monthMap[m]));

    const currentMonth = new Date().toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    setExpandedMonth(currentMonth);
    setResult({ name: student.name, months: sortedMap });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 py-10">
        <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-md border border-blue-100">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Check Attendance
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-2 mb-8"
          >
            <input
              type="text"
              placeholder="Enter student name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border border-blue-200 px-3 py-2 rounded-xl bg-white focus:ring-2 focus:ring-blue-300 outline-none transition-all"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-md transition-all duration-200"
            >
              Search
            </button>
          </form>

          {result === "notfound" && (
            <p className="text-red-600 text-center font-medium">
              Student not found
            </p>
          )}

          {result && result !== "notfound" && (
            <>
              <h3 className="text-lg font-semibold mb-6 text-center">
                {result.name}
              </h3>

              {Object.entries(result.months).map(([month, data]) => {
                const isOpen = expandedMonth === month;

                const combined = [
                  ...data.present.map((d) => ({ date: d, status: "Present" })),
                  ...data.absent.map((d) => ({ date: d, status: "Absent" })),
                ].sort((a, b) => new Date(a.date) - new Date(b.date));

                return (
                  <div
                    key={month}
                    className="mb-8 border border-blue-100 rounded-2xl overflow-hidden bg-white shadow-sm"
                  >
                    <div
                      onClick={() => setExpandedMonth(isOpen ? null : month)}
                      className="bg-blue-50 px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-blue-100 transition-all"
                    >
                      <div>
                        <p className="font-semibold">{month}</p>
                        <p className="text-xs text-blue-500">
                          Present: {data.present.length} | Absent:{" "}
                          {data.absent.length}
                        </p>
                      </div>
                      <span>{isOpen ? "▲" : "▼"}</span>
                    </div>

                    {isOpen && (
                      <div className="p-4 overflow-x-auto">
                        <table className="w-full text-sm border-separate border-spacing-0">
                          <thead className="bg-blue-50">
                            <tr>
                              <th className="border border-blue-100 px-3 py-2">
                                Date
                              </th>
                              <th className="border border-blue-100 px-3 py-2">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {combined.map((entry, i) => (
                              <tr key={i}>
                                <td className="border border-blue-100 px-3 py-2 text-center">
                                  {formatDateReadable(entry.date)}
                                </td>
                                <td
                                  className={`border border-blue-100 px-3 py-2 text-center font-semibold ${
                                    entry.status === "Present"
                                      ? "text-blue-600"
                                      : "text-red-500"
                                  }`}
                                >
                                  {entry.status}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
