import { useEffect, useState, useMemo, useCallback } from "react";
import Modal from "../components/Modal";
import { db } from "../firebase";
import { useLocation, useNavigate } from "react-router-dom";
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

    setBatches(batchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
      personal: batches.filter((b) => b.type === "personal").length,
      external: batches.filter((b) => b.type === "external").length,
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
      type,
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
      type: editType,
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
    const linked = students.filter((s) => s.batchId === id);

    if (linked.length > 0) {
      alert("Cannot delete batch. Students are assigned.");
      return;
    }

    if (!window.confirm("Delete this batch?")) return;

    await deleteDoc(doc(db, "batches", id));
    fetchData();
  };

  /* ================= FILTER ================= */

  const filteredBatches = useMemo(() => {
    let result = batches;

    // Filter by type (existing logic)
    if (filter !== "all") {
      result = result.filter((b) => b.type === filter);
    }

    // 🔥 Search logic
    if (search.trim()) {
      const query = search.toLowerCase();

      result = result.filter((b) => {
        const batchStudents = students.filter((s) => s.batchId === b.id);

        const matchesName = b.batchName?.toLowerCase().includes(query);

        const matchesType = b.type?.toLowerCase().includes(query);

        const matchesStudent = batchStudents.some((s) =>
          s.name?.toLowerCase().includes(query),
        );

        // ✅ NEW: match by day
        const matchesDay = b.classDays?.some((day) =>
          day.toLowerCase().includes(query),
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

      <div className="min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-12 py-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[380px_1fr] gap-16">
          {/* LEFT PANEL */}
          <div className="lg:sticky lg:top-12 h-fit">
            <motion.form
              onSubmit={handleAdd}
              className="bg-white border rounded-3xl p-8 shadow-sm space-y-6"
            >
              <h2 className="text-xl font-semibold">Create Batch</h2>

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border rounded-xl px-4 py-3"
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
                      className={`px-3 py-1 rounded-full border ${
                        selected ? "bg-black text-white" : "bg-white"
                      }`}
                    >
                      {day}
                    </button>

                    {selected && (
                      <input
                        type="time"
                        value={selected.time}
                        onChange={(e) => updateTime(day, e.target.value)}
                        className="border rounded-lg px-3 py-1"
                      />
                    )}
                  </div>
                );
              })}

              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="Batch Name"
                required
              />

              <button className="w-full bg-black text-white py-3 rounded-xl">
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
                className="w-full border border-slate-300 rounded-xl px-4 py-3 pr-10"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black transition"
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
                  className={`px-4 py-2 rounded-full border ${
                    filter === cat ? "bg-black text-white" : "bg-white"
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)} (
                  {batchCounts[cat]})
                </button>
              ))}
            </div>

            {/* EXTERNAL BATCHES */}
            {filteredBatches.filter((b) => b.type === "external").length >
              0 && (
              <div className="mb-12">
                <h2 className="text-xl font-semibold mb-6">
                  External Batches (
                  {filteredBatches.filter((b) => b.type === "external").length})
                </h2>

                <div className="grid sm:grid-cols-2 xl:grid-cols-2 gap-8">
                  {filteredBatches
                    .filter((b) => b.type === "external")
                    .map((b) => {
                      const batchStudents = students.filter(
                        (s) => s.batchId === b.id,
                      );
                      const activeStudents = batchStudents.filter(
                        (s) => s.active,
                      );
                      const isInactive = batchStudents.length === 0;

                      return (
                        <Card inactive={isInactive}>
                          <div className="font-semibold text-lg">
                            {b.batchName}
                            {isInactive && (
                              <span className="ml-2 text-xs text-gray-500">
                                (Inactive)
                              </span>
                            )}
                          </div>

                          <>
                            <div className="text-sm mt-2 text-slate-600">
                              {(b.schedule || [])
                                .map((s) => `${s.day} ${s.time}`)
                                .join(" • ")}
                            </div>

                            <div className="text-sm mt-3">
                              Students:{" "}
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
                                    className="text-xs bg-slate-100 px-3 py-1 rounded-lg inline-block mr-2"
                                  >
                                    <span
                                      onClick={() =>
                                        navigate(
                                          `/students?search=${encodeURIComponent(s.name)}`,
                                        )
                                      }
                                      className="cursor-pointer hover:text-indigo-600 transition"
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
                                  className="text-xs text-indigo-600"
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

                            <div className="flex gap-4 mt-4">
                              <button
                                onClick={() => startEdit(b)}
                                className="text-indigo-600 text-sm"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => handleDelete(b.id)}
                                className="text-red-600 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}

            {/* PERSONAL BATCHES (AT BOTTOM) */}
            {filteredBatches.filter((b) => b.type === "personal").length >
              0 && (
              <div>
                <h2 className="text-xl font-semibold mb-6">
                  Personal Batches (
                  {filteredBatches.filter((b) => b.type === "personal").length})
                </h2>

                <div className="grid sm:grid-cols-2 xl:grid-cols-2 gap-8">
                  {filteredBatches
                    .filter((b) => b.type === "personal")
                    .map((b) => {
                      const batchStudents = students.filter(
                        (s) => s.batchId === b.id,
                      );
                      const activeStudents = batchStudents.filter(
                        (s) => s.active,
                      );
                      const isInactive = batchStudents.length === 0;

                      return (
                        <Card inactive={isInactive}>
                          <div className="font-semibold text-lg">
                            {b.batchName}
                            {isInactive && (
                              <span className="ml-2 text-xs text-gray-500">
                                (Inactive)
                              </span>
                            )}
                          </div>

                          <div className="text-sm mt-2 text-slate-600">
                            {(b.schedule || [])
                              .map((s) => `${s.day} ${s.time}`)
                              .join(" • ")}
                          </div>

                          <div className="text-sm mt-3">
                            Students:{" "}
                            <span className="font-semibold">
                              {activeStudents.length}
                            </span>
                          </div>

                          <div className="flex gap-4 mt-4">
                            <button
                              onClick={() => startEdit(b)}
                              className="text-indigo-600 text-sm"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDelete(b.id)}
                              className="text-red-600 text-sm"
                            >
                              Delete
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

        <Modal
          isOpen={!!editingBatch}
          onClose={() => setEditingBatch(null)}
          title={editingBatch ? `Edit ${editingBatch.batchName}` : ""}
          footer={
            <>
              <button
                onClick={() => setEditingBatch(null)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-black text-white rounded-lg"
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
                className="w-full border rounded-xl px-4 py-2 mb-4"
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
                      className={`px-3 py-1 rounded-full border ${
                        selected ? "bg-black text-white" : "bg-white"
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
                        className="border rounded-lg px-3 py-1"
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
                  className="bg-gray-100 px-3 py-2 rounded-lg text-sm mb-2"
                >
                  {s.name}
                </div>
              ))}
        </Modal>
      </div>
    </>
  );
}
