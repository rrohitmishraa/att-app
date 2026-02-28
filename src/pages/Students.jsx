import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import Navbar from "../components/Navbar";
import Card from "../components/Card";
import Modal from "../components/Modal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const studentsRef = collection(db, "students");
const batchesRef = collection(db, "batches");
const attendanceRef = collection(db, "attendance");

export default function Students() {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [type, setType] = useState("external");
  const [batch, setBatch] = useState("");
  const [classDays, setClassDays] = useState([]);

  /* ✅ NEW: per-day times */
  const [dayTimes, setDayTimes] = useState({});

  const [reminderAfter, setReminderAfter] = useState(8);
  const [sharePer8, setSharePer8] = useState(1800);

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [filter, setFilter] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  // const [attendanceLoading, setAttendanceLoading] = useState(false);

  /* ================= FETCH ================= */

  const fetchData = async () => {
    const studentSnap = await getDocs(studentsRef);
    const batchSnap = await getDocs(batchesRef);

    const studentData = studentSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const batchData = batchSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    studentData.sort((a, b) => Number(b.active) - Number(a.active));

    setStudents(studentData);
    setBatches(batchData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get("search");

    if (searchParam) {
      setSearch(searchParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (!selectedStudent) return;

    const fetchAttendance = async () => {
      const snap = await getDocs(attendanceRef);

      const filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a.studentId === selectedStudent.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      setAttendanceData(filtered);
    };

    fetchAttendance();
  }, [selectedStudent]);

  /* ================= ACTIVE COUNTS ================= */

  const activeCounts = useMemo(() => {
    const activeStudents = students.filter((s) => s.active);

    return {
      all: activeStudents.length,
      personal: activeStudents.filter((s) => s.type === "personal").length,
      external: activeStudents.filter((s) => s.type === "external").length,
    };
  }, [students]);

  /* ================= UTIL ================= */

  const formatTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);
    return minute === 0 ? `${hour}` : `${hour}${minute}`;
  };

  const toggleDay = (day) => {
    setClassDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  /* ================= AUTO BATCH ================= */

  useEffect(() => {
    // 🔥 If no days selected → clear batch name
    if (!classDays.length) {
      setBatch("");
      return;
    }

    const prefix = type === "personal" ? "P-" : "Ex-";
    const dayCode = classDays.map((d) => d[0]).join("");

    const firstDay = classDays[0];
    const firstTime = dayTimes[firstDay];
    const formattedTime = formatTime(firstTime);

    setBatch(`${prefix}${dayCode}${formattedTime}`);
  }, [classDays, dayTimes, type]);

  /* ================= ADD MULTIPLE ================= */

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !batch.trim()) return;

    const names = name
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (!names.length) return;

    let existingBatch = batches.find((b) => b.batchName === batch);

    if (!existingBatch) {
      /* ✅ NEW: build schedule with per-day time */
      const schedule = classDays.map((day) => ({
        day,
        time: dayTimes[day],
      }));

      const newBatch = {
        batchName: batch,
        type,
        schedule,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(batchesRef, newBatch);
      existingBatch = { id: docRef.id, ...newBatch };
    }

    const studentPromises = names.map((studentName) => {
      const payload = {
        name: studentName,
        batchId: existingBatch.id,
        batchName: existingBatch.batchName,
        type: existingBatch.type,
        active: true,
        createdAt: serverTimestamp(),
      };

      if (existingBatch.type === "personal") {
        payload.reminderAfterClasses = reminderAfter;
        payload.classesSinceRenewal = 0;
      } else {
        payload.sharePer8Classes = sharePer8;
      }

      return addDoc(studentsRef, payload);
    });

    await Promise.all(studentPromises);

    setName("");
    setBatch("");
    setClassDays([]);
    setDayTimes({});

    fetchData();
  };

  /* ================= DELETE ================= */

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this student?")) return;
    await deleteDoc(doc(db, "students", id));
    fetchData();
  };

  /* ================= TOGGLE ================= */

  const toggleActive = async (student) => {
    await updateDoc(doc(db, "students", student.id), {
      active: !student.active,
    });
    fetchData();
  };

  /* ================= EDIT ================= */

  const startEdit = (student) => {
    setEditingId(student.id);
    setEditData({ ...student });
  };

  const saveEdit = async (student) => {
    await updateDoc(doc(db, "students", student.id), {
      name: editData.name,
      batchId: editData.batchId,
      batchName: editData.batchName,
      type: editData.type,
    });

    setEditingId(null);
    fetchData();
  };

  const cancelEdit = () => setEditingId(null);

  /* ================= FILTER ================= */

  const filteredStudents = useMemo(() => {
    let result = students;

    // Filter by type buttons
    if (filter !== "all") {
      result = result.filter((s) => s.type === filter);
    }

    // Search filtering
    if (search.trim()) {
      const term = search.toLowerCase();

      result = result.filter((s) => {
        const batch = batches.find((b) => b.id === s.batchId);

        const nameMatch = s.name?.toLowerCase().includes(term);
        const batchMatch = s.batchName?.toLowerCase().includes(term);
        const typeMatch = s.type?.toLowerCase().includes(term);

        const dayMatch = batch?.schedule?.some((s) =>
          s.day?.toLowerCase().includes(term),
        );

        return nameMatch || batchMatch || typeMatch || dayMatch;
      });
    }

    return result;
  }, [students, batches, filter, search]);

  const [openMonths, setOpenMonths] = useState({});

  const personalMonthlyAttendance = useMemo(() => {
    if (!selectedStudent || selectedStudent.type !== "personal") return {};

    const grouped = {};

    attendanceData.forEach((a) => {
      const dateObj = new Date(a.date);

      const monthKey = dateObj.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      if (!grouped[monthKey]) grouped[monthKey] = [];

      grouped[monthKey].push({
        date: a.date,
        status: "Present",
      });
    });

    Object.keys(grouped).forEach((month) => {
      grouped[month].sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    return grouped;
  }, [selectedStudent, attendanceData]);

  const monthlyAttendance = useMemo(() => {
    if (!selectedStudent || selectedStudent.type !== "external") return {};

    const batchInfo = batches.find((b) => b.id === selectedStudent.batchId);

    if (!batchInfo?.schedule?.length) return {};

    const presentDates = attendanceData.map((a) => a.date);

    const grouped = {};

    const today = new Date();

    // Start from first attendance or today if none
    const startDate = attendanceData.length
      ? new Date(attendanceData[attendanceData.length - 1].date)
      : today;

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dayName = d.toLocaleDateString("en-US", {
        weekday: "short",
      });

      const isScheduled = batchInfo.schedule.some((s) => s.day === dayName);

      if (!isScheduled) continue;

      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const monthKey = d.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });

      if (!grouped[monthKey]) grouped[monthKey] = [];

      grouped[monthKey].push({
        date: iso,
        status: presentDates.includes(iso) ? "Present" : "Absent",
      });
    }

    return grouped;
  }, [selectedStudent, attendanceData, batches]);

  /* ================= UI ================= */

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 sm:px-6 lg:px-10 xl:px-12 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 lg:gap-12">
          {/* ADD PANEL */}
          <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-md border border-blue-100 p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6 sm:mb-8">
              Add Student
            </h2>

            <form onSubmit={handleAdd} className="space-y-4 sm:space-y-5">
              <textarea
                className="w-full border border-blue-200 rounded-xl px-4 py-3 text-sm sm:text-base bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                placeholder="Student Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <p className="text-xs text-slate-500 -mt-2">
                You can add multiple students separated by commas or new lines.
              </p>

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
              >
                <option value="external">External</option>
                <option value="personal">Personal</option>
              </select>

              <div className="space-y-2">
                {DAYS.map((day) => (
                  <div key={day} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1 rounded-full border transition-all duration-200 ${
                        classDays.includes(day)
                          ? "bg-blue-500 text-white shadow-md border-blue-500"
                          : "bg-white border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {day}
                    </button>

                    {classDays.includes(day) && (
                      <input
                        type="time"
                        value={dayTimes[day]}
                        onChange={(e) =>
                          setDayTimes({
                            ...dayTimes,
                            [day]: e.target.value,
                          })
                        }
                        className="border border-blue-200 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>

              <input
                className="w-full border border-blue-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="Batch Name"
                required
              />

              {type === "personal" ? (
                <input
                  type="number"
                  value={reminderAfter}
                  onChange={(e) => setReminderAfter(Number(e.target.value))}
                  className="w-full border border-blue-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                />
              ) : (
                <input
                  type="number"
                  value={sharePer8}
                  onChange={(e) => setSharePer8(Number(e.target.value))}
                  className="w-full border border-blue-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                />
              )}

              <button className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl shadow-md transition-all duration-200">
                Add Student
              </button>
            </form>
          </div>

          {/* STUDENTS GRID */}
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">Students</h2>

            <div className="relative mb-6">
              <input
                type="text"
                placeholder="Search by name, batch or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-4 py-3 pr-10 text-sm sm:text-base bg-white focus:ring-2 focus:ring-blue-300 outline-none"
              />

              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600 transition"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              {["all", "personal", "external"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium border transition-all duration-200 ${
                    filter === cat
                      ? "bg-blue-500 text-white shadow-md border-blue-500"
                      : "bg-white border-blue-200 hover:bg-blue-50"
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)} (
                  {activeCounts[cat]})
                </button>
              ))}
            </div>

            {/* EXTERNAL STUDENTS */}
            {filteredStudents.filter((s) => s.type === "external").length >
              0 && (
              <div className="mb-10">
                <h3 className="text-lg sm:text-xl font-semibold mb-4">
                  External Students
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
                  {filteredStudents
                    .filter((s) => s.type === "external")
                    .map((s) => {
                      const isEditing = editingId === s.id;
                      const batchInfo = batches.find((b) => b.id === s.batchId);

                      return (
                        <Card inactive={!s.active}>
                          <div className="flex justify-between items-start mb-4 gap-3">
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <>
                                  <input
                                    className="w-full border px-3 py-2 rounded mb-2 text-sm"
                                    value={editData.name}
                                    onChange={(e) =>
                                      setEditData({
                                        ...editData,
                                        name: e.target.value,
                                      })
                                    }
                                  />

                                  <select
                                    value={editData.batchId}
                                    onChange={(e) => {
                                      const selectedBatch = batches.find(
                                        (b) => b.id === e.target.value,
                                      );

                                      setEditData({
                                        ...editData,
                                        batchId: selectedBatch.id,
                                        batchName: selectedBatch.batchName,
                                        type: selectedBatch.type,
                                      });
                                    }}
                                    className="w-full border px-3 py-2 rounded text-sm"
                                  >
                                    {batches.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.batchName}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <>
                                  <div
                                    onClick={() => setSelectedStudent(s)}
                                    className="text-base sm:text-lg font-semibold truncate cursor-pointer hover:text-blue-600 transition"
                                  >
                                    {s.name}
                                  </div>

                                  <div
                                    onClick={() =>
                                      navigate(
                                        `/batches?search=${encodeURIComponent(
                                          s.batchName,
                                        )}`,
                                      )
                                    }
                                    className="mt-2 text-sm text-blue-500 cursor-pointer hover:text-blue-700 transition"
                                  >
                                    {s.batchName}
                                    {batchInfo?.schedule?.length > 0 && (
                                      <span className="ml-2 text-xs text-slate-400">
                                        (
                                        {batchInfo.schedule
                                          .map((s) => s.day)
                                          .join(", ")}
                                        )
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            <button
                              onClick={() => toggleActive(s)}
                              className={`relative w-12 h-6 rounded-full flex-shrink-0 transition-all ${
                                s.active ? "bg-blue-500" : "bg-gray-300"
                              }`}
                            >
                              <span
                                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition ${
                                  s.active ? "translate-x-6" : ""
                                }`}
                              />
                            </button>
                          </div>

                          <div className="flex justify-between text-xs sm:text-sm">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(s)}
                                  className="text-blue-600 hover:underline"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="text-gray-600"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(s)}
                                  className="text-blue-600 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(s.id)}
                                  className="text-red-500 hover:underline"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}

            {/* PERSONAL STUDENTS (AT BOTTOM) */}
            {filteredStudents.filter((s) => s.type === "personal").length >
              0 && (
              <div>
                <h3 className="text-lg sm:text-xl font-semibold mb-4">
                  Personal Students
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
                  {filteredStudents
                    .filter((s) => s.type === "personal")
                    .map((s) => {
                      return (
                        <Card inactive={!s.active}>
                          <div className="flex justify-between items-start mb-4 gap-3">
                            <div className="flex-1 min-w-0">
                              <div
                                onClick={() => setSelectedStudent(s)}
                                className="text-base sm:text-lg font-semibold truncate cursor-pointer hover:text-blue-600 transition"
                              >
                                {s.name}
                              </div>
                              <div
                                onClick={() =>
                                  navigate(
                                    `/batches?search=${encodeURIComponent(s.batchName)}`,
                                  )
                                }
                                className="mt-2 text-sm text-blue-500 cursor-pointer hover:text-blue-700 transition"
                              >
                                {s.batchName}
                              </div>
                            </div>

                            <button
                              onClick={() => toggleActive(s)}
                              className={`relative w-12 h-6 rounded-full flex-shrink-0 transition-all ${
                                s.active ? "bg-blue-500" : "bg-gray-300"
                              }`}
                            >
                              <span
                                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition ${
                                  s.active ? "translate-x-6" : ""
                                }`}
                              />
                            </button>
                          </div>

                          <div className="flex justify-between text-xs sm:text-sm">
                            <button
                              onClick={() => startEdit(s)}
                              className="text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="text-red-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        title={selectedStudent ? `Attendance – ${selectedStudent.name}` : ""}
        size="lg"
      >
        {/* Total Present Count */}
        <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-slate-600">Total Present</p>
          <p className="text-2xl font-semibold text-blue-600">
            {selectedStudent?.type === "external"
              ? Object.values(monthlyAttendance)
                  .flat()
                  .filter((r) => r.status === "Present").length
              : Object.values(personalMonthlyAttendance).flat().length}
          </p>
        </div>

        {
          <div className="space-y-4">
            {Object.entries(
              selectedStudent?.type === "external"
                ? monthlyAttendance
                : personalMonthlyAttendance,
            ).map(([month, records]) => (
              <div key={month} className="border rounded-xl overflow-hidden">
                <button
                  onClick={() =>
                    setOpenMonths((prev) => ({
                      ...prev,
                      [month]: !prev[month],
                    }))
                  }
                  className="w-full text-left px-4 py-3 bg-blue-50 font-semibold flex justify-between"
                >
                  {month}
                  <span>{openMonths[month] ? "−" : "+"}</span>
                </button>

                {openMonths[month] && (
                  <div className="p-4">
                    {(() => {
                      if (!records.length) return null;

                      const firstDate = new Date(records[0].date);
                      const year = firstDate.getFullYear();
                      const monthIndex = firstDate.getMonth();

                      const daysInMonth = new Date(
                        year,
                        monthIndex + 1,
                        0,
                      ).getDate();

                      const firstDayOfWeek = new Date(
                        year,
                        monthIndex,
                        1,
                      ).getDay();

                      const statusMap = {};
                      records.forEach((r) => {
                        statusMap[r.date] = r.status;
                      });

                      const cells = [];

                      for (let i = 0; i < firstDayOfWeek; i++) {
                        cells.push(<div key={`empty-${i}`} />);
                      }

                      for (let d = 1; d <= daysInMonth; d++) {
                        const dateObj = new Date(year, monthIndex, d);
                        const iso = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
                        const status = statusMap[iso];

                        cells.push(
                          <div
                            key={d}
                            className={`h-12 flex items-center justify-center text-[14px] rounded-md border transition-all
                    ${
                      status === "Present"
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-white border-blue-100"
                    }`}
                          >
                            {d}
                          </div>,
                        );
                      }

                      return (
                        <div>
                          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500 mb-2">
                            {[
                              "Sun",
                              "Mon",
                              "Tue",
                              "Wed",
                              "Thu",
                              "Fri",
                              "Sat",
                            ].map((day) => (
                              <div key={day}>{day}</div>
                            ))}
                          </div>

                          <div className="grid grid-cols-7 gap-1">{cells}</div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        }
      </Modal>
    </>
  );
}
