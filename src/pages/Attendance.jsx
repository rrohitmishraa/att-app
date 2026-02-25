import { useEffect, useState, useMemo, useCallback } from "react";
import { db } from "../firebase";

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Undo2 } from "lucide-react";
import Navbar from "../components/Navbar";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Attendance() {
  const studentsRef = collection(db, "students");
  const batchesRef = collection(db, "batches");
  const attendanceRef = collection(db, "attendance");
  const cancellationsRef = collection(db, "batchCancellations");

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [cancelledBatches, setCancelledBatches] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [confirmStudent, setConfirmStudent] = useState(null);

  /* ================= DATE FORMAT ================= */

  const formatFullDate = (dateStr) => {
    const date = new Date(dateStr);
    const full = date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const short = date.toLocaleDateString("en-GB");
    return `${full} (${short})`;
  };

  /* ================= FETCH DATA ================= */

  const fetchData = useCallback(async () => {
    const studentSnap = await getDocs(studentsRef);
    const batchSnap = await getDocs(batchesRef);
    const attendanceSnap = await getDocs(attendanceRef);
    const cancellationSnap = await getDocs(cancellationsRef);

    const activeStudents = studentSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.active);

    const batchData = batchSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const map = {};
    attendanceSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.date === selectedDate) {
        if (!map[data.studentId]) map[data.studentId] = [];
        map[data.studentId].push({ id: docSnap.id });
      }
    });

    const cancelMap = {};
    cancellationSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.date === selectedDate) {
        cancelMap[data.batchId] = data;
      }
    });

    setStudents(activeStudents);
    setBatches(batchData);
    setAttendanceMap(map);
    setCancelledBatches(cancelMap);
  }, [selectedDate, attendanceRef, batchesRef, cancellationsRef, studentsRef]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ================= ATTENDANCE ================= */

  const saveAttendance = async (student) => {
    await addDoc(attendanceRef, {
      studentId: student.id,
      batchId: student.batchId,
      date: selectedDate,
      createdAt: serverTimestamp(),
    });

    // ===== EXTERNAL =====
    if (student.type === "external") {
      const current = student.classesCompleted || 0;
      const newCount = current + 1;

      await updateDoc(doc(db, "students", student.id), {
        classesCompleted: newCount >= 8 ? 0 : newCount,
        totalClassesCompleted: (student.totalClassesCompleted || 0) + 1,
      });

      if (newCount >= 8) {
        await updateDoc(doc(db, "batches", student.batchId), {
          externalAlert: true,
        });
      }
    }

    // ===== PERSONAL =====
    if (student.type === "personal") {
      const current = student.classesSinceRenewal || 0;
      const newCount = current + 1;
      const limit = student.reminderAfterClasses || 8;

      await updateDoc(doc(db, "students", student.id), {
        classesSinceRenewal: newCount,
      });

      if (newCount >= limit) {
        await updateDoc(doc(db, "batches", student.batchId), {
          paymentPending: true,
        });
      }
    }

    fetchData();
  };

  const markAttendance = async (student) => {
    const records = attendanceMap[student.id] || [];
    if (records.length > 0) {
      setConfirmStudent(student);
      return;
    }
    await saveAttendance(student);
  };

  const confirmMarkAgain = async () => {
    await saveAttendance(confirmStudent);
    setConfirmStudent(null);
  };

  const undoAttendance = async (student) => {
    const records = attendanceMap[student.id];
    if (!records || records.length === 0) return;

    const lastRecord = records[records.length - 1];
    await deleteDoc(doc(db, "attendance", lastRecord.id));
    fetchData();
  };

  /* ================= CANCEL BATCH ================= */

  const cancelBatchForDate = async (batch) => {
    if (!window.confirm("Cancel this batch for this date?")) return;

    await addDoc(cancellationsRef, {
      batchId: batch.id,
      date: selectedDate,
      reason: "Teacher Absent",
      createdAt: serverTimestamp(),
    });

    fetchData();
  };

  const revertBatchCancellation = async (batch) => {
    const snap = await getDocs(cancellationsRef);
    const match = snap.docs.find(
      (d) => d.data().batchId === batch.id && d.data().date === selectedDate,
    );
    if (!match) return;

    await deleteDoc(doc(db, "batchCancellations", match.id));
    fetchData();
  };

  /* ================= SORTING ================= */

  const { todayBatches, upcomingBatches } = useMemo(() => {
    const currentDate = new Date(selectedDate);
    const todayIndex = currentDate.getDay();

    const getNextOccurrence = (batch) => {
      if (!batch.classDays || !batch.time) return Infinity;

      let closest = Infinity;

      batch.classDays.forEach((day) => {
        const targetIndex = DAYS.indexOf(day);
        let diff = targetIndex - todayIndex;
        if (diff < 0) diff += 7;

        const nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + diff);

        const [h, m] = batch.time.split(":");
        nextDate.setHours(parseInt(h), parseInt(m), 0, 0);

        if (nextDate >= currentDate) {
          closest = Math.min(closest, nextDate.getTime());
        }
      });

      return closest;
    };

    const mapped = batches.map((batch) => ({
      ...batch,
      students: students.filter((s) => s.batchId === batch.id),
      nextOccurrence: getNextOccurrence(batch),
    }));

    mapped.sort((a, b) => a.nextOccurrence - b.nextOccurrence);

    const todayList = mapped.filter((b) =>
      b.classDays?.includes(DAYS[todayIndex]),
    );

    const upcomingList = mapped.filter(
      (b) => !b.classDays?.includes(DAYS[todayIndex]),
    );

    return {
      todayBatches: todayList,
      upcomingBatches: upcomingList,
    };
  }, [batches, students, selectedDate]);

  /* ================= UI ================= */

  const BatchBlock = ({ batch }) => {
    const isCancelled = cancelledBatches[batch.id];
    const highlight = batch.paymentPending || batch.externalAlert;

    return (
      <div
        className={`border rounded-2xl p-6 shadow-sm ${
          highlight
            ? "bg-orange-50 border-orange-400"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{batch.batchName}</h3>

              {isCancelled && (
                <span className="text-xs text-red-600 font-medium">
                  Cancelled (Teacher Absent)
                </span>
              )}
            </div>

            {batch.classDays?.length > 0 && (
              <div className="text-xs text-slate-500 mt-1">
                {batch.classDays.join(", ")}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {batch.time && (
              <span className="text-xs text-gray-500 bg-slate-100 px-3 py-1 rounded-full">
                {batch.time}
              </span>
            )}

            {batch.externalAlert && (
              <button
                onClick={async () => {
                  await updateDoc(doc(db, "batches", batch.id), {
                    externalAlert: false,
                  });
                  fetchData();
                }}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full"
              >
                Clear Alert
              </button>
            )}

            {isCancelled ? (
              <button
                onClick={() => revertBatchCancellation(batch)}
                className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full"
              >
                Undo Cancel
              </button>
            ) : (
              <button
                onClick={() => cancelBatchForDate(batch)}
                className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full"
              >
                Cancel Batch
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {batch.students.map((student) => {
            const records = attendanceMap[student.id] || [];
            const count = records.length;
            const marked = count > 0;
            const limit = student.reminderAfterClasses || 8;
            const personalLimitReached =
              student.type === "personal" &&
              (student.classesSinceRenewal || 0) >= limit;

            return (
              <div
                key={student.id}
                className={`flex justify-between items-center border rounded-xl px-4 py-4 ${
                  isCancelled
                    ? "bg-red-50 border-red-300"
                    : personalLimitReached
                      ? "bg-orange-50 border-orange-400"
                      : marked
                        ? "bg-green-50 border-green-300"
                        : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{student.name}</span>

                  {student.type === "external" && (
                    <span className="text-xs text-slate-600">
                      {student.classesCompleted || 0} / 8 classes
                    </span>
                  )}

                  {student.type === "personal" && (
                    <span className="text-xs text-slate-600">
                      {student.classesSinceRenewal || 0} / {limit}
                    </span>
                  )}

                  <span className="text-xs text-gray-500">
                    {count} marked today
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isCancelled}
                    onClick={() => markAttendance(student)}
                    className={`p-2 rounded-lg ${
                      isCancelled
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : marked
                          ? "bg-green-600 text-white"
                          : "bg-black text-white"
                    }`}
                  >
                    <Check size={16} />
                  </button>

                  {marked && !isCancelled && (
                    <button
                      onClick={() => undoAttendance(student)}
                      className="p-2 rounded-lg bg-red-500 text-white"
                    >
                      <Undo2 size={16} />
                    </button>
                  )}

                  {personalLimitReached && (
                    <button
                      onClick={async () => {
                        const current = student.classesSinceRenewal || 0;
                        const remainder = current % limit;

                        await updateDoc(doc(db, "students", student.id), {
                          classesSinceRenewal: remainder,
                        });

                        await updateDoc(doc(db, "batches", student.batchId), {
                          paymentPending: false,
                        });

                        fetchData();
                      }}
                      className="text-xs bg-green-600 text-white px-3 py-1 rounded-full"
                    >
                      Mark Paid
                    </button>
                  )}

                  {student.type === "external" && (
                    <button
                      onClick={async () => {
                        if (!window.confirm("Reset class counter?")) return;
                        await updateDoc(doc(db, "students", student.id), {
                          classesCompleted: 0,
                        });
                        fetchData();
                      }}
                      className="text-xs text-blue-600 underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[320px_1fr] gap-16">
          <div className="lg:sticky lg:top-12 h-fit bg-white p-6 rounded-2xl border w-screen/2">
            <h2 className="text-xl font-semibold mb-4">Select Date</h2>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border rounded-xl px-4 py-3"
            />

            <div className="mt-4 text-sm text-gray-600">
              {formatFullDate(selectedDate)}
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-semibold mb-2">Attendance</h1>
            <p className="text-gray-600 mb-8">{formatFullDate(selectedDate)}</p>

            {todayBatches.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-green-600 uppercase tracking-wider mb-4">
                  Today
                </h2>
                <div className="space-y-10">
                  {todayBatches.map((batch) => (
                    <BatchBlock key={batch.id} batch={batch} />
                  ))}
                </div>
              </>
            )}

            {todayBatches.length > 0 && upcomingBatches.length > 0 && (
              <div className="my-12 flex items-center gap-4">
                <div className="flex-1 h-px bg-gray-300" />
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  Upcoming
                </span>
                <div className="flex-1 h-px bg-gray-300" />
              </div>
            )}

            {upcomingBatches.length > 0 && (
              <div className="space-y-10">
                {upcomingBatches.map((batch) => (
                  <BatchBlock key={batch.id} batch={batch} />
                ))}
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {confirmStudent && (
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setConfirmStudent(null)}
              />
              <motion.div className="relative bg-white w-[90%] max-w-md rounded-2xl shadow-2xl p-6 z-10">
                <h3 className="text-lg font-semibold mb-4">Already Marked</h3>

                <p className="text-sm text-gray-600 mb-6">
                  Attendance already marked{" "}
                  <strong>
                    {(attendanceMap[confirmStudent.id] || []).length}
                  </strong>{" "}
                  time(s) today. Mark again?
                </p>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmStudent(null)}
                    className="px-4 py-2 border rounded-lg"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={confirmMarkAgain}
                    className="px-4 py-2 bg-black text-white rounded-lg"
                  >
                    Mark Again
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
