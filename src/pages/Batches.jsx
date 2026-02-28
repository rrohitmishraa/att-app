import { useEffect, useState, useMemo, useCallback } from "react";
import Modal from "../components/Modal";
import { db } from "../firebase";
import { useLocation, useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
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
import Card from "../components/Card";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Batches() {
  const batchesRef = collection(db, "batches");
  const studentsRef = collection(db, "students");

  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState("");
  const [inactiveModalBatch, setInactiveModalBatch] = useState(null);

  const [batch, setBatch] = useState("");
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);

  const [type, setType] = useState("external");
  const [schedule, setSchedule] = useState([]);
  const [filter, setFilter] = useState("all");

  const [editingBatch, setEditingBatch] = useState(null);
  const [editSchedule, setEditSchedule] = useState([]);
  const [editType, setEditType] = useState("external");

  /* ================= FETCH ================= */

  const fetchData = useCallback(async () => {
    const batchSnap = await getDocs(batchesRef);
    const studentSnap = await getDocs(studentsRef);

    setBatches(
      batchSnap.docs.map((d) => {
        const data = d.data();

        return {
          id: d.id,
          ...data,
          type: data.type ? data.type.toLowerCase().trim() : "external",
        };
      }),
    );
    setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, [batchesRef, studentsRef]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get("search");

    if (searchParam) {
      setSearch(searchParam);
    }
  }, [location.search]);

  /* ================= COUNTS ================= */

  const batchCounts = useMemo(() => {
    return {
      all: batches.length,
      personal: batches.filter((b) => b.type?.toLowerCase() === "personal")
        .length,
      external: batches.filter((b) => b.type?.toLowerCase() === "external")
        .length,
    };
  }, [batches]);

  /* ================= HELPERS ================= */

  const generateBatchName = (batchType, batchSchedule) => {
    const prefix = batchType === "personal" ? "P-" : "Ex-";

    const sorted = [...batchSchedule].sort(
      (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day),
    );

    const dayCode = sorted.map((d) => d.day[0]).join("");

    // 🔥 Take first day's time
    const firstTime = sorted[0]?.time;

    if (!firstTime) return `${prefix}${dayCode}`;

    const [h, m] = firstTime.split(":");
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);

    const formattedTime = minute === 0 ? `${hour}` : `${hour}${minute}`;

    return `${prefix}${dayCode}${formattedTime}`;
  };

  /* ================= AUTO BATCH NAME ================= */

  useEffect(() => {
    if (!schedule.length) {
      setBatch("");
      return;
    }

    const generated = generateBatchName(type, schedule);
    setBatch(generated);
  }, [type, schedule]);

  /* ===== CREATE HELPERS ===== */

  const toggleDay = (day) => {
    const exists = schedule.find((s) => s.day === day);

    if (exists) {
      setSchedule(schedule.filter((s) => s.day !== day));
    } else {
      setSchedule([...schedule, { day, time: "07:00" }]);
    }
  };

  const updateTime = (day, newTime) => {
    setSchedule(
      schedule.map((s) => (s.day === day ? { ...s, time: newTime } : s)),
    );
  };

  /* ================= CREATE ================= */

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!schedule.length) return;

    const batchName = batch.trim();

    await addDoc(batchesRef, {
      type: type.toLowerCase(),
      schedule,
      batchName,
      createdAt: serverTimestamp(),
    });

    setSchedule([]);
    fetchData();
  };

  /* ================= EDIT ================= */

  const startEdit = (batch) => {
    setEditingBatch(batch);
    setEditSchedule(batch.schedule || []);
    setEditType(batch.type);
  };

  const saveEdit = async () => {
    if (!editingBatch || !editSchedule.length) return;

    const newBatchName = generateBatchName(editType, editSchedule);

    await updateDoc(doc(db, "batches", editingBatch.id), {
      schedule: editSchedule,
      type: editType.toLowerCase(),
      batchName: newBatchName,
    });

    const batchStudents = students.filter((s) => s.batchId === editingBatch.id);

    for (let s of batchStudents) {
      await updateDoc(doc(db, "students", s.id), {
        batchName: newBatchName,
        type: editType,
      });
    }

    setEditingBatch(null);
    fetchData();
  };

  /* ================= DELETE ================= */

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this batch?")) return;

    await deleteDoc(doc(db, "batches", id));
    fetchData();
  };

  /* ================= FILTER ================= */

  const filteredBatches = useMemo(() => {
    let result = batches;

    // Case-safe type filter
    if (filter !== "all") {
      result = result.filter(
        (b) => b.type?.toLowerCase() === filter.toLowerCase(),
      );
    }

    if (search.trim()) {
      const query = search.toLowerCase();

      result = result.filter((b) => {
        const batchStudents = students.filter((s) => s.batchId === b.id);

        const matchesName = b.batchName?.toLowerCase().includes(query);

        const matchesType = b.type?.toLowerCase().includes(query);

        const matchesStudent = batchStudents.some((s) =>
          s.name?.toLowerCase().includes(query),
        );

        // ✅ Correct day search (use schedule)
        const matchesDay = b.schedule?.some((s) =>
          s.day?.toLowerCase().includes(query),
        );

        return matchesName || matchesType || matchesStudent || matchesDay;
      });
    }

    return result;
  }, [batches, filter, search, students]);

  /* ================= UI ================= */

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 sm:px-6 lg:px-12 py-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[380px_1fr] gap-16">
          {/* LEFT PANEL */}
          <div className="lg:sticky lg:top-12 h-fit">
            <motion.form
              onSubmit={handleAdd}
              className="bg-white/90 backdrop-blur-md border border-blue-100 rounded-3xl p-8 shadow-md space-y-6"
            >
              <h2 className="text-xl font-semibold">Create Batch</h2>

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
              >
                <option value="external">External</option>
                <option value="personal">Personal</option>
              </select>

              {DAYS.map((day) => {
                const selected = schedule.find((s) => s.day === day);
                return (
                  <div key={day} className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1 rounded-full border transition-all duration-200 ${
                        selected
                          ? "bg-blue-500 text-white shadow-md border-blue-500"
                          : "bg-white border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {day}
                    </button>

                    {selected && (
                      <input
                        type="time"
                        value={selected.time}
                        onChange={(e) => updateTime(day, e.target.value)}
                        className="border border-blue-200 rounded-lg px-3 py-1 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                      />
                    )}
                  </div>
                );
              })}

              <input
                className="w-full border border-blue-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="Batch Name"
                required
              />

              <button className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl shadow-md transition-all duration-200">
                Create Batch
              </button>
            </motion.form>
          </div>

          {/* RIGHT PANEL */}
          <div>
            <h1 className="text-3xl font-semibold mb-8">Batches</h1>

            <div className="relative mb-6">
              <input
                type="text"
                placeholder="Search by batch name, type or student..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-4 py-3 pr-10 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
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

            <div className="flex gap-3 mb-8">
              {["all", "personal", "external"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-4 py-2 rounded-full border transition-all duration-200 ${
                    filter === cat
                      ? "bg-blue-500 text-white shadow-md border-blue-500"
                      : "bg-white border-blue-200 hover:bg-blue-50"
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)} (
                  {batchCounts[cat]})
                </button>
              ))}
            </div>

            {/* EXTERNAL BATCHES */}
            {filteredBatches.filter((b) => b.type?.toLowerCase() === "external")
              .length > 0 && (
              <div className="mb-12">
                <h2 className="text-xl font-semibold mb-6">
                  External Batches (
                  {
                    filteredBatches.filter(
                      (b) => b.type?.toLowerCase() === "external",
                    ).length
                  }
                  )
                </h2>

                <div className="grid sm:grid-cols-2 xl:grid-cols-2 gap-8">
                  {filteredBatches
                    .filter((b) => b.type?.toLowerCase() === "external")
                    .map((b) => {
                      const batchStudents = students.filter(
                        (s) => s.batchId === b.id,
                      );
                      const activeStudents = batchStudents.filter(
                        (s) => s.active,
                      );
                      const isInactive = activeStudents.length === 0;

                      return (
                        <Card key={b.id} inactive={isInactive}>
                          <div className="flex flex-col h-full">
                            <div className="flex items-start justify-between">
                              {/* Left side */}
                              <div className="font-semibold text-lg flex items-center gap-2">
                                <span>{b.batchName}</span>
                                {isInactive && (
                                  <span className="text-xs text-gray-500">
                                    (Inactive)
                                  </span>
                                )}
                              </div>

                              {/* Right side – stacked schedule */}
                              {b.schedule?.length > 0 && (
                                <div className="text-xs text-slate-500 text-right leading-5">
                                  {b.schedule
                                    .map((s) => {
                                      if (!s.time) return null;
                                      const [h, m] = s.time.split(":");
                                      const hour = parseInt(h, 10);
                                      const ampm = hour >= 12 ? "PM" : "AM";
                                      const formattedHour =
                                        hour % 12 === 0 ? 12 : hour % 12;
                                      return `${s.day}: ${formattedHour}:${m} ${ampm}`;
                                    })
                                    .filter(Boolean)
                                    .map((line, idx) => (
                                      <div key={idx}>{line}</div>
                                    ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-3 text-sm text-slate-700">
                              <Users size={16} className="text-blue-500" />
                              <span className="font-semibold">
                                {activeStudents.length}
                              </span>
                            </div>

                            <div className="mt-3 space-y-1">
                              {batchStudents
                                .filter((s) => s.active)
                                .map((s) => (
                                  <div
                                    key={s.id}
                                    className="text-xs bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg inline-block mr-2"
                                  >
                                    <span
                                      onClick={() =>
                                        navigate(
                                          `/students?search=${encodeURIComponent(s.name)}`,
                                        )
                                      }
                                      className="cursor-pointer hover:text-blue-600 transition"
                                    >
                                      {s.name}
                                    </span>
                                  </div>
                                ))}
                            </div>

                            {batchStudents.some((s) => !s.active) && (
                              <div className="mt-2">
                                <button
                                  onClick={() => setInactiveModalBatch(b)}
                                  className="text-xs text-blue-600"
                                >
                                  Inactive Students (
                                  {
                                    batchStudents.filter((s) => !s.active)
                                      .length
                                  }
                                  )
                                </button>
                              </div>
                            )}

                            <div className="flex gap-4 mt-auto pt-4">
                              <button
                                onClick={() => startEdit(b)}
                                className="text-blue-600 text-sm hover:underline"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => handleDelete(b.id)}
                                className="text-red-500 text-sm hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}

            {/* PERSONAL BATCHES (AT BOTTOM) */}
            {filteredBatches.filter((b) => b.type?.toLowerCase() === "personal")
              .length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-6">
                  Personal Batches (
                  {
                    filteredBatches.filter(
                      (b) => b.type?.toLowerCase() === "personal",
                    ).length
                  }
                  )
                </h2>

                <div className="grid sm:grid-cols-2 xl:grid-cols-2 gap-8">
                  {filteredBatches
                    .filter((b) => b.type?.toLowerCase() === "personal")
                    .map((b) => {
                      const batchStudents = students.filter(
                        (s) => s.batchId === b.id,
                      );
                      const activeStudents = batchStudents.filter(
                        (s) => s.active,
                      );
                      const isInactive = activeStudents.length === 0;

                      return (
                        <Card key={b.id} inactive={isInactive}>
                          <div className="flex flex-col h-full">
                            <div className="flex items-start justify-between">
                              {/* Left side */}
                              <div className="font-semibold text-lg flex items-center gap-2">
                                <span>{b.batchName}</span>
                                {isInactive && (
                                  <span className="text-xs text-gray-500">
                                    (Inactive)
                                  </span>
                                )}
                              </div>

                              {/* Right side – stacked schedule */}
                              {b.schedule?.length > 0 && (
                                <div className="text-xs text-slate-500 text-right leading-5">
                                  {b.schedule
                                    .map((s) => {
                                      if (!s.time) return null;
                                      const [h, m] = s.time.split(":");
                                      const hour = parseInt(h, 10);
                                      const ampm = hour >= 12 ? "PM" : "AM";
                                      const formattedHour =
                                        hour % 12 === 0 ? 12 : hour % 12;
                                      return `${s.day}: ${formattedHour}:${m} ${ampm}`;
                                    })
                                    .filter(Boolean)
                                    .map((line, idx) => (
                                      <div key={idx}>{line}</div>
                                    ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-3 text-sm text-slate-700">
                              <Users size={16} className="text-blue-500" />
                              <span className="font-semibold">
                                {activeStudents.length}
                              </span>
                            </div>

                            <div className="mt-3 space-y-1">
                              {batchStudents
                                .filter((s) => s.active)
                                .map((s) => (
                                  <div
                                    key={s.id}
                                    className="text-xs bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg inline-block mr-2"
                                  >
                                    <span
                                      onClick={() =>
                                        navigate(
                                          `/students?search=${encodeURIComponent(s.name)}`,
                                        )
                                      }
                                      className="cursor-pointer hover:text-blue-600 transition"
                                    >
                                      {s.name}
                                    </span>
                                  </div>
                                ))}
                            </div>

                            {batchStudents.some((s) => !s.active) && (
                              <div className="mt-2">
                                <button
                                  onClick={() => setInactiveModalBatch(b)}
                                  className="text-xs text-blue-600"
                                >
                                  Inactive Students (
                                  {
                                    batchStudents.filter((s) => !s.active)
                                      .length
                                  }
                                  )
                                </button>
                              </div>
                            )}

                            <div className="flex gap-4 mt-auto pt-4">
                              <button
                                onClick={() => startEdit(b)}
                                className="text-blue-600 text-sm hover:underline"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => handleDelete(b.id)}
                                className="text-red-500 text-sm hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        <Modal
          isOpen={!!editingBatch}
          onClose={() => setEditingBatch(null)}
          title={editingBatch ? `Edit ${editingBatch.batchName}` : ""}
          footer={
            <>
              <button
                onClick={() => setEditingBatch(null)}
                className="px-4 py-2 border border-blue-200 rounded-lg bg-white hover:bg-blue-50 transition"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-md transition"
              >
                Save Changes
              </button>
            </>
          }
        >
          {editingBatch && (
            <>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full border border-blue-200 rounded-xl px-4 py-2 mb-4 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
              >
                <option value="external">External</option>
                <option value="personal">Personal</option>
              </select>

              {DAYS.map((day) => {
                const selected = editSchedule.find((s) => s.day === day);

                return (
                  <div key={day} className="flex items-center gap-4 mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        const exists = editSchedule.find((s) => s.day === day);
                        if (exists) {
                          setEditSchedule(
                            editSchedule.filter((s) => s.day !== day),
                          );
                        } else {
                          setEditSchedule([
                            ...editSchedule,
                            { day, time: "07:00" },
                          ]);
                        }
                      }}
                      className={`px-3 py-1 rounded-full border transition-all duration-200 ${
                        selected
                          ? "bg-blue-500 text-white shadow-md border-blue-500"
                          : "bg-white border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {day}
                    </button>

                    {selected && (
                      <input
                        type="time"
                        value={selected.time}
                        onChange={(e) =>
                          setEditSchedule(
                            editSchedule.map((s) =>
                              s.day === day
                                ? { ...s, time: e.target.value }
                                : s,
                            ),
                          )
                        }
                        className="border border-blue-200 rounded-lg px-3 py-1 bg-white focus:ring-2 focus:ring-blue-300 outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </Modal>

        <Modal
          isOpen={!!inactiveModalBatch}
          onClose={() => setInactiveModalBatch(null)}
          title={
            inactiveModalBatch
              ? `Previous Students – ${inactiveModalBatch.batchName}`
              : ""
          }
        >
          {inactiveModalBatch &&
            students
              .filter((s) => s.batchId === inactiveModalBatch.id && !s.active)
              .map((s) => (
                <div
                  key={s.id}
                  className="bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg text-sm mb-2"
                >
                  {s.name}
                </div>
              ))}
        </Modal>
      </div>
    </>
  );
}
