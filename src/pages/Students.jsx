import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const studentsRef = collection(db, "students");
const batchesRef = collection(db, "batches");

export default function Students() {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [type, setType] = useState("external");
  const [batch, setBatch] = useState("");
  const [classDays, setClassDays] = useState([]);
  const [time, setTime] = useState("07:00");

  /* ✅ NEW: per-day times */
  const [dayTimes, setDayTimes] = useState({});

  const [reminderAfter, setReminderAfter] = useState(8);
  const [sharePer8, setSharePer8] = useState(1800);

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [filter, setFilter] = useState("all");

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
    const firstTime = dayTimes[firstDay] || time;
    const formattedTime = formatTime(firstTime);

    setBatch(`${prefix}${dayCode}${formattedTime}`);
  }, [classDays, dayTimes, time, type]);

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
        time: dayTimes[day] || time,
      }));

      const newBatch = {
        batchName: batch,
        type,
        classDays,
        time,
        schedule, // added
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
    setTime("07:00");
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

        const dayMatch = batch?.classDays?.some((day) =>
          day.toLowerCase().includes(term),
        );

        return nameMatch || batchMatch || typeMatch || dayMatch;
      });
    }

    return result;
  }, [students, batches, filter, search]);

  /* ================= UI ================= */

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-10 xl:px-12 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 lg:gap-12">
          {/* ADD PANEL */}
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6 sm:mb-8">
              Add Student
            </h2>

            <form onSubmit={handleAdd} className="space-y-4 sm:space-y-5">
              <textarea
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm sm:text-base"
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
                className="w-full border rounded-xl px-4 py-3"
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
                      className={`px-3 py-1 rounded-full border ${
                        classDays.includes(day)
                          ? "bg-indigo-600 text-white"
                          : "bg-white"
                      }`}
                    >
                      {day}
                    </button>

                    {classDays.includes(day) && (
                      <input
                        type="time"
                        value={dayTimes[day] || time}
                        onChange={(e) =>
                          setDayTimes({
                            ...dayTimes,
                            [day]: e.target.value,
                          })
                        }
                        className="border rounded-lg px-2 py-1"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              /> */}

              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
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
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              ) : (
                <input
                  type="number"
                  value={sharePer8}
                  onChange={(e) => setSharePer8(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              )}

              <button className="w-full bg-indigo-600 text-white py-3 rounded-xl">
                Add Student
              </button>
            </form>
          </div>

          {/* STUDENTS GRID */}
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">Students</h2>

            <input
              type="text"
              placeholder="Search by name, batch or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full mb-6 border border-slate-300 rounded-xl px-4 py-3 text-sm sm:text-base"
            />

            <div className="flex flex-wrap gap-3 mb-6">
              {["all", "personal", "external"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium border ${
                    filter === cat
                      ? "bg-black text-white border-black"
                      : "bg-white border-gray-300"
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)} (
                  {activeCounts[cat]})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
              {filteredStudents.map((s) => {
                const isEditing = editingId === s.id;

                return (
                  <motion.div
                    key={s.id}
                    layout
                    className={`rounded-2xl border p-4 sm:p-6 shadow-sm ${
                      s.active ? "bg-white" : "bg-slate-100 opacity-70"
                    }`}
                  >
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
                              className={`w-full border px-3 py-2 rounded text-sm ${
                                editData.type === "personal"
                                  ? "bg-blue-100 border-blue-400 text-blue-700"
                                  : "bg-red-100 border-red-400 text-red-700"
                              }`}
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
                            <div className="text-base sm:text-lg font-semibold truncate">
                              {s.name}
                            </div>

                            {(() => {
                              const batchInfo = batches.find(
                                (b) => b.id === s.batchId,
                              );

                              return (
                                <div
                                  onClick={() =>
                                    navigate(
                                      `/batches?search=${encodeURIComponent(s.batchName)}`,
                                    )
                                  }
                                  className={`mt-2 inline-block px-3 py-1 text-xs sm:text-sm rounded-full border cursor-pointer hover:scale-105 transition ${
                                    s.type === "personal"
                                      ? "bg-blue-100 border-blue-300"
                                      : "bg-red-100 border-red-300"
                                  }`}
                                >
                                  {s.batchName}
                                  {batchInfo?.classDays?.length > 0 && (
                                    <span className="ml-2 text-[10px] sm:text-xs text-gray-600">
                                      ({batchInfo.classDays.join(", ")})
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => toggleActive(s)}
                        className={`relative w-12 h-6 rounded-full flex-shrink-0 ${
                          s.active ? "bg-emerald-500" : "bg-gray-400"
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
                            className="text-green-600"
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
                            className="text-indigo-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="text-red-600"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
