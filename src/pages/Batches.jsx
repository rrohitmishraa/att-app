import { useEffect, useState, useMemo, useCallback } from "react";
import Modal from "../components/Modal";
import { db } from "../firebase";
import { useLocation } from "react-router-dom";
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

export default function Batches() {
  const batchesRef = collection(db, "batches");
  const studentsRef = collection(db, "students");

  const location = useLocation();

  const [search, setSearch] = useState("");
  const [inactiveModalBatch, setInactiveModalBatch] = useState(null);

  const [batch, setBatch] = useState("");
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);

  const [type, setType] = useState("external");
  const [schedule, setSchedule] = useState([]);
  const [filter, setFilter] = useState("all");

  const [editingId, setEditingId] = useState(null);
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

  /* ===== EDIT HELPERS ===== */

  const toggleEditDay = (day) => {
    const exists = editSchedule.find((s) => s.day === day);

    if (exists) {
      setEditSchedule(editSchedule.filter((s) => s.day !== day));
    } else {
      setEditSchedule([...editSchedule, { day, time: "07:00" }]);
    }
  };

  const updateEditTime = (day, newTime) => {
    setEditSchedule(
      editSchedule.map((s) => (s.day === day ? { ...s, time: newTime } : s)),
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
    setEditingId(batch.id);
    setEditSchedule(batch.schedule || []);
    setEditType(batch.type);
  };

  const saveEdit = async (batch) => {
    if (!editSchedule.length) return;

    const newBatchName = generateBatchName(editType, editSchedule);

    await updateDoc(doc(db, "batches", batch.id), {
      schedule: editSchedule,
      type: editType,
      batchName: newBatchName,
    });

    // update students batchName
    const batchStudents = students.filter((s) => s.batchId === batch.id);

    for (let s of batchStudents) {
      await updateDoc(doc(db, "students", s.id), {
        batchName: newBatchName,
      });
    }

    setEditingId(null);
    fetchData();
  };

  const cancelEdit = () => setEditingId(null);

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

            <input
              type="text"
              placeholder="Search by batch name, type or student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-6"
            />

            <div className="flex gap-3 mb-8">
              {["all", "personal", "external"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-4 py-2 rounded-full border ${
                    filter === cat ? "bg-black text-white" : "bg-white"
                  }`}
                >
                  {cat} ({batchCounts[cat]})
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-8">
              {filteredBatches.map((b) => {
                const isEditing = editingId === b.id;
                const batchStudents = students.filter(
                  (s) => s.batchId === b.id,
                );
                const isInactive = batchStudents.length === 0;

                return (
                  <motion.div
                    key={b.id}
                    layout
                    className={`relative rounded-2xl border bg-white p-6 shadow-sm ${
                      isInactive ? "opacity-60" : ""
                    }`}
                  >
                    {/* Accent stripe */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1 ${
                        b.type === "personal" ? "bg-indigo-500" : "bg-rose-500"
                      }`}
                    />

                    <div className="font-semibold text-lg">
                      {b.batchName}
                      {isInactive && (
                        <span className="ml-2 text-xs text-gray-500">
                          (Inactive)
                        </span>
                      )}
                    </div>

                    {!isEditing ? (
                      <>
                        <div className="text-sm mt-2 text-slate-600">
                          {(b.schedule || [])
                            .map((s) => `${s.day} ${s.time}`)
                            .join(" • ")}
                        </div>

                        <div className="text-sm mt-3">
                          Students:{" "}
                          <span className="font-semibold">
                            {batchStudents.length}
                          </span>
                        </div>

                        {/* ACTIVE STUDENTS */}
                        <div className="mt-3 space-y-1">
                          {batchStudents
                            .filter((s) => s.active)
                            .map((s) => (
                              <div
                                key={s.id}
                                className="text-xs bg-slate-100 px-3 py-1 rounded-lg inline-block mr-2"
                              >
                                {s.name}
                              </div>
                            ))}
                        </div>

                        {/* INACTIVE STUDENTS TOGGLE */}
                        {batchStudents.some((s) => !s.active) && (
                          <div className="mt-2">
                            <button
                              onClick={() => setInactiveModalBatch(b)}
                              className="text-xs text-indigo-600"
                            >
                              Inactive Students (
                              {batchStudents.filter((s) => !s.active).length})
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
                    ) : (
                      <>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          className="w-full border rounded-xl px-4 py-2 mb-3"
                        >
                          <option value="external">External</option>
                          <option value="personal">Personal</option>
                        </select>

                        {DAYS.map((day) => {
                          const selected = editSchedule.find(
                            (s) => s.day === day,
                          );

                          return (
                            <div
                              key={day}
                              className="flex items-center gap-4 mt-2"
                            >
                              <button
                                type="button"
                                onClick={() => toggleEditDay(day)}
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
                                    updateEditTime(day, e.target.value)
                                  }
                                  className="border rounded-lg px-3 py-1"
                                />
                              )}
                            </div>
                          );
                        })}

                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() => saveEdit(b)}
                            className="text-green-600 text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-gray-600 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

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
