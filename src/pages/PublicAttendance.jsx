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
  const [showChart, setShowChart] = useState(true);

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

    setShowChart(false);

    const student = students.find(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase().trim()) &&
        s.active !== false,
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 px-3 sm:px-4 py-6 sm:py-10">
        <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur-md p-4 sm:p-8 rounded-3xl shadow-md border border-blue-100">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Check Attendance
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-2 mb-8"
          >
            <input
              type="text"
              placeholder="Enter student name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border border-blue-200 px-3 py-2 rounded-xl bg-white focus:ring-2 focus:ring-blue-300 outline-none transition-all"
            />
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-md transition-all duration-200"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  setResult(null); // clear search result
                  setShowChart((prev) => !prev);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-xl shadow-md transition-all duration-200"
              >
                Chart
              </button>
            </div>
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
                      <div className="p-4">
                        {(() => {
                          const presentDates = data.present.map(
                            (d) => new Date(d),
                          );
                          const absentDates = data.absent.map(
                            (d) => new Date(d),
                          );

                          const year =
                            presentDates[0]?.getFullYear() ||
                            absentDates[0]?.getFullYear();
                          const monthIndex =
                            presentDates[0]?.getMonth() ||
                            absentDates[0]?.getMonth();

                          if (year === undefined || monthIndex === undefined)
                            return "—";

                          const firstDay = new Date(year, monthIndex, 1);
                          const startDay = firstDay.getDay();
                          const daysInMonth = new Date(
                            year,
                            monthIndex + 1,
                            0,
                          ).getDate();

                          return (
                            <div>
                              <div className="font-semibold text-blue-600 mb-3">
                                {firstDay.toLocaleString("default", {
                                  month: "long",
                                  year: "numeric",
                                })}
                              </div>

                              <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs">
                                {Array.from({ length: startDay }).map(
                                  (_, i) => (
                                    <div key={`empty-${i}`} />
                                  ),
                                )}

                                {Array.from({ length: daysInMonth }).map(
                                  (_, i) => {
                                    const day = i + 1;

                                    const isPresent = presentDates.some(
                                      (d) => d.getDate() === day,
                                    );
                                    const isAbsent = absentDates.some(
                                      (d) => d.getDate() === day,
                                    );

                                    return (
                                      <div
                                        key={day}
                                        className={`h-7 sm:h-8 flex items-center justify-center rounded ${
                                          isPresent
                                            ? "bg-blue-500 text-white"
                                            : isAbsent
                                              ? "bg-red-100 text-red-500"
                                              : "text-gray-400"
                                        }`}
                                      >
                                        {day}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {showChart && !result && (
            <div className="mt-10">
              <h3 className="text-lg font-semibold mb-6 text-center">
                Batch Attendance Overview
              </h3>

              {batches.map((batch) => {
                const batchStudents = students.filter(
                  (s) =>
                    s.batchId === batch.id &&
                    s.type === "external" &&
                    s.active !== false,
                );

                if (batchStudents.length === 0) return null;

                return (
                  <div key={batch.id} className="mb-10">
                    <h4 className="text-md font-semibold mb-4 text-blue-600">
                      {batch.batchName}
                    </h4>

                    <div className="overflow-x-auto -mx-3 sm:mx-0">
                      <table className="w-full text-xs sm:text-sm border-separate border-spacing-0">
                        <thead className="bg-blue-50">
                          <tr>
                            <th className="border border-blue-100 px-3 py-2">
                              Student
                            </th>
                            <th className="border border-blue-100 px-3 py-2">
                              Present
                            </th>
                            <th className="border border-blue-100 px-3 py-2">
                              Dates
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchStudents.map((student) => {
                            const studentAttendance = attendance.filter(
                              (a) => a.studentId === student.id,
                            );

                            const presentCount = studentAttendance.length;

                            return (
                              <tr key={student.id}>
                                <td className="border border-blue-100 px-3 py-2 text-center">
                                  {student.name}
                                </td>
                                <td className="border border-blue-100 px-3 py-2 text-center text-blue-600 font-semibold">
                                  {presentCount}
                                </td>
                                <td className="border border-blue-100 px-3 py-2 text-xs">
                                  {studentAttendance.length === 0
                                    ? "—"
                                    : (() => {
                                        const dates = studentAttendance
                                          .map((a) => new Date(a.date))
                                          .sort((a, b) => a - b);

                                        const grouped = {};
                                        dates.forEach((d) => {
                                          const key = `${d.getFullYear()}-${d.getMonth()}`;
                                          if (!grouped[key]) grouped[key] = [];
                                          grouped[key].push(d.getDate());
                                        });

                                        return Object.entries(grouped).map(
                                          ([key, days]) => {
                                            const [year, month] = key
                                              .split("-")
                                              .map(Number);
                                            const firstDay = new Date(
                                              year,
                                              month,
                                              1,
                                            );
                                            const startDay = firstDay.getDay();
                                            const daysInMonth = new Date(
                                              year,
                                              month + 1,
                                              0,
                                            ).getDate();

                                            return (
                                              <div key={key} className="mb-4">
                                                <div className="font-semibold text-blue-600 mb-2">
                                                  {firstDay.toLocaleString(
                                                    "default",
                                                    {
                                                      month: "long",
                                                      year: "numeric",
                                                    },
                                                  )}
                                                </div>

                                                <div className="grid grid-cols-7 gap-1 text-center text-[9px] sm:text-[10px]">
                                                  {Array.from({
                                                    length: startDay,
                                                  }).map((_, i) => (
                                                    <div key={`empty-${i}`} />
                                                  ))}

                                                  {Array.from({
                                                    length: daysInMonth,
                                                  }).map((_, i) => {
                                                    const day = i + 1;
                                                    const isPresent =
                                                      days.includes(day);

                                                    return (
                                                      <div
                                                        key={day}
                                                        className={`h-5 sm:h-6 flex items-center justify-center rounded text-[9px] sm:text-[10px] ${
                                                          isPresent
                                                            ? "bg-blue-500 text-white"
                                                            : "text-gray-400"
                                                        }`}
                                                      >
                                                        {day}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            );
                                          },
                                        );
                                      })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
