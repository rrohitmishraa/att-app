import { useEffect, useState, useMemo, useCallback } from "react";
import { db } from "../firebase";
import Modal from "../components/Modal";

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

const studentsRef = collection(db, "students");
const batchesRef = collection(db, "batches");
const attendanceRef = collection(db, "attendance");
const cancellationsRef = collection(db, "batchCancellations");

export default function Attendance() {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [cancelledBatches, setCancelledBatches] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [confirmStudent, setConfirmStudent] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(null);

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
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ================= MARK ATTENDANCE ================= */

  const saveAttendance = async (student) => {
    setLoadingStudent(student.id);

    const docRef = await addDoc(attendanceRef, {
      studentId: student.id,
      batchId: student.batchId,
      date: selectedDate,
      createdAt: serverTimestamp(),
    });

    setAttendanceMap((prev) => {
      const updated = { ...prev };
      if (!updated[student.id]) updated[student.id] = [];
      updated[student.id].push({ id: docRef.id });
      return updated;
    });

    /* ===== EXTERNAL (FIXED CYCLE LOGIC) ===== */
    if (student.type === "external") {
      const newTotal = (student.totalClassesCompleted || 0) + 1;
      const newCompleted = newTotal % 8;

      await updateDoc(doc(db, "students", student.id), {
        totalClassesCompleted: newTotal,
        classesCompleted: newCompleted,
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? {
                ...s,
                totalClassesCompleted: newTotal,
                classesCompleted: newCompleted,
              }
            : s,
        ),
      );

      if (newCompleted === 0) {
        await updateDoc(doc(db, "students", student.id), {
          externalAlert: true,
        });

        setStudents((prev) =>
          prev.map((s) =>
            s.id === student.id ? { ...s, externalAlert: true } : s,
          ),
        );
      }
    }

    /* ===== PERSONAL ===== */
    if (student.type === "personal") {
      const newCount = (student.classesSinceRenewal || 0) + 1;
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

    await fetchData();
    setLoadingStudent(null);
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

  /* ================= UNDO (FIXED) ================= */

  const undoAttendance = async (student) => {
    const records = attendanceMap[student.id];
    if (!records || records.length === 0) return;

    setLoadingStudent(student.id);

    const lastRecord = records[records.length - 1];
    await deleteDoc(doc(db, "attendance", lastRecord.id));

    if (student.type === "external") {
      const newTotal = Math.max(0, (student.totalClassesCompleted || 0) - 1);
      const newCompleted = newTotal % 8;

      await updateDoc(doc(db, "students", student.id), {
        totalClassesCompleted: newTotal,
        classesCompleted: newCompleted,
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? {
                ...s,
                totalClassesCompleted: newTotal,
                classesCompleted: newCompleted,
              }
            : s,
        ),
      );

      if (newCompleted !== 0) {
        await updateDoc(doc(db, "students", student.id), {
          externalAlert: false,
        });

        setStudents((prev) =>
          prev.map((s) =>
            s.id === student.id ? { ...s, externalAlert: false } : s,
          ),
        );
      }
    }

    if (student.type === "personal") {
      const newSinceRenewal = Math.max(
        0,
        (student.classesSinceRenewal || 0) - 1,
      );

      await updateDoc(doc(db, "students", student.id), {
        classesSinceRenewal: newSinceRenewal,
      });

      if (newSinceRenewal < (student.reminderAfterClasses || 8)) {
        await updateDoc(doc(db, "batches", student.batchId), {
          paymentPending: false,
        });
      }
    }

    await fetchData();
    setLoadingStudent(null);
  };

  /* ================= SORTING ================= */

  const { todayBatches, upcomingBatches } = useMemo(() => {
    const currentDate = new Date(selectedDate);
    const todayIndex = currentDate.getDay();

    const mapped = batches.map((batch) => ({
      ...batch,
      students: students.filter((s) => s.batchId === batch.id),
    }));

    const todayList = mapped.filter((b) =>
      b.classDays?.includes(DAYS[todayIndex]),
    );

    const upcomingList = mapped.filter(
      (b) => !b.classDays?.includes(DAYS[todayIndex]),
    );

    return { todayBatches: todayList, upcomingBatches: upcomingList };
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
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {batch.students.map((student) => {
            const records = attendanceMap[student.id] || [];
            const marked = records.length > 0;
            const count = records.length;

            return (
              <div
                key={student.id}
                className="flex justify-between items-center border rounded-xl px-4 py-4 bg-slate-50 border-slate-200"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{student.name}</span>

                  {student.type === "external" && (
                    <span className="text-xs text-slate-600">
                      {student.classesCompleted || 0} / 8 classes
                    </span>
                  )}

                  <span className="text-xs text-gray-500">
                    {count} attendance marked today
                  </span>
                </div>

                {student.externalAlert && (
                  <button
                    onClick={async () => {
                      await updateDoc(doc(db, "students", student.id), {
                        externalAlert: false,
                      });

                      setStudents((prev) =>
                        prev.map((s) =>
                          s.id === student.id
                            ? { ...s, externalAlert: false }
                            : s,
                        ),
                      );
                    }}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full"
                  >
                    Clear Alert
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    disabled={loadingStudent === student.id}
                    onClick={() => markAttendance(student)}
                    className={`p-2 rounded-lg ${
                      marked ? "bg-green-600 text-white" : "bg-black text-white"
                    }`}
                  >
                    <Check size={16} />
                  </button>

                  {marked && (
                    <button
                      onClick={() => undoAttendance(student)}
                      className="p-2 rounded-lg bg-red-500 text-white"
                    >
                      <Undo2 size={16} />
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
          <div className="lg:sticky lg:top-12 h-fit bg-white p-6 rounded-2xl border">
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
        <Modal
          isOpen={!!confirmStudent}
          onClose={() => setConfirmStudent(null)}
          title="Already Marked"
          footer={
            <>
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
            </>
          }
        >
          {confirmStudent && (
            <p className="text-sm text-gray-600">
              Attendance already marked{" "}
              <strong>{(attendanceMap[confirmStudent.id] || []).length}</strong>{" "}
              time(s) today. Mark again?
            </p>
          )}
        </Modal>
      </div>
    </>
  );
}
