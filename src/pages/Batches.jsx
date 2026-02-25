import { useEffect, useState, useMemo, useCallback } from "react";
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
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Batches() {
  const batchesRef = collection(db, "batches");
  const studentsRef = collection(db, "students");

  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);

  const [type, setType] = useState("external");
  const [selectedDays, setSelectedDays] = useState([]);
  const [time, setTime] = useState("07:00");
  const [filter, setFilter] = useState("all");

  const [editingId, setEditingId] = useState(null);
  const [editDays, setEditDays] = useState([]);
  const [editTime, setEditTime] = useState("");

  const [inactiveModal, setInactiveModal] = useState(null);

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

  /* ================= COUNTS ================= */

  const batchCounts = useMemo(() => {
    return {
      all: batches.length,
      personal: batches.filter((b) => b.type === "personal").length,
      external: batches.filter((b) => b.type === "external").length,
    };
  }, [batches]);

  /* ================= HELPERS ================= */

  const formatTime = (t) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);
    return minute === 0 ? `${hour}` : `${hour}${minute}`;
  };

  const generateBatchName = () => {
    if (!selectedDays.length) return "";
    const prefix = type === "personal" ? "P-" : "Ex-";
    const sorted = [...selectedDays].sort(
      (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b),
    );
    const dayCode = sorted.map((d) => d[0]).join("");
    return `${prefix}${dayCode}${formatTime(time)}`;
  };

  const toggleDay = (day) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  /* ================= CREATE ================= */

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selectedDays.length) return;

    await addDoc(batchesRef, {
      type,
      classDays: selectedDays,
      time,
      batchName: generateBatchName(),
      createdAt: serverTimestamp(),
    });

    setSelectedDays([]);
    setTime("07:00");
    fetchData();
  };

  /* ================= EDIT ================= */

  const startEdit = (batch) => {
    setEditingId(batch.id);
    setEditDays(batch.classDays);
    setEditTime(batch.time);
  };

  const toggleEditDay = (day) => {
    setEditDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const saveEdit = async (batch) => {
    const prefix = batch.type === "personal" ? "P-" : "Ex-";

    const sorted = [...editDays].sort(
      (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b),
    );

    const dayCode = sorted.map((d) => d[0]).join("");

    const [h, m] = editTime.split(":");
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);
    const formattedTime = minute === 0 ? `${hour}` : `${hour}${minute}`;

    const newBatchName = `${prefix}${dayCode}${formattedTime}`;

    // 1️⃣ Update batch
    await updateDoc(doc(db, "batches", batch.id), {
      classDays: editDays,
      time: editTime,
      batchName: newBatchName,
    });

    // 2️⃣ Update all students in that batch
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
    if (filter === "all") return batches;
    return batches.filter((b) => b.type === filter);
  }, [batches, filter]);

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
              className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6"
            >
              <h2 className="text-xl font-semibold">Create Batch</h2>

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={`w-full border rounded-xl px-4 py-3 font-medium ${
                  type === "personal"
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-red-100 border-red-300 text-red-700"
                }`}
              >
                <option value="external">External</option>
                <option value="personal">Personal</option>
              </select>

              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-2 text-sm rounded-full border ${
                      selectedDays.includes(day)
                        ? "bg-black text-white border-black"
                        : "bg-white"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full/2 min-w-0 max-w-full border border-slate-300 rounded-xl px-4 py-3 text-sm sm:text-base"
              />

              <button className="w-full bg-black text-white py-3 rounded-xl">
                Create Batch
              </button>
            </motion.form>
          </div>

          {/* RIGHT PANEL */}
          <div>
            <h1 className="text-3xl font-semibold mb-8">Batches</h1>

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
                    className={`rounded-2xl border p-6 shadow-sm ${
                      isInactive
                        ? "bg-gray-100 border-gray-300 opacity-60"
                        : b.type === "personal"
                          ? "bg-blue-50 border-blue-200"
                          : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="font-semibold text-lg text-black">
                      {b.batchName}
                      {isInactive && (
                        <span className="ml-2 text-xs text-gray-500">
                          (Inactive)
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <>
                        <div className="flex flex-wrap gap-2 mt-4">
                          {DAYS.map((day) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleEditDay(day)}
                              className={`px-3 py-1 text-sm rounded-full border ${
                                editDays.includes(day)
                                  ? "bg-black text-white"
                                  : "bg-white"
                              }`}
                            >
                              {day}
                            </button>
                          ))}
                        </div>

                        <input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="w-full border rounded-xl px-4 py-3 mt-4"
                        />

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
                    ) : (
                      <>
                        <div className="text-sm text-slate-600 mt-2">
                          {b.classDays.join(", ")} • {b.time}
                        </div>

                        <div className="text-sm mt-3">
                          Students:{" "}
                          <span className="font-semibold">
                            {batchStudents.length}
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
                      </>
                    )}
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
