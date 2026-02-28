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
  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayLocal());
  const [confirmStudent, setConfirmStudent] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(null);

  // ---- Helper for local ISO date (no timezone shift) ----
  const toLocalISO = (dateObj) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

  const resetStudentClasses = async (student) => {
    const confirm = window.confirm(`Reset class count for ${student.name}?`);

    if (!confirm) return;

    if (student.type === "external") {
      await updateDoc(doc(db, "students", student.id), {
        totalClassesCompleted: 0,
        classesCompleted: 0,
        externalAlert: false,
      });
    }

    if (student.type === "personal") {
      await updateDoc(doc(db, "students", student.id), {
        classesSinceRenewal: 0,
      });

      await updateDoc(doc(db, "batches", student.batchId), {
        paymentPending: false,
      });
    }

    await fetchData();
  };

  const formatToAMPM = (timeStr) => {
    if (!timeStr) return "";

    const [hourStr, minuteStr] = timeStr.split(":");
    let hour = parseInt(hourStr, 10);
    const minutes = minuteStr;

    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;

    return `${hour}:${minutes} ${ampm}`;
  };

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

  const { todayBatches, otherBatches } = useMemo(() => {
    const currentDate = new Date(selectedDate);
    const todayIndex = currentDate.getDay();
    const todayName = DAYS[todayIndex];

    const mapped = batches.map((batch) => {
      const todaySchedule = batch.schedule?.find((s) => s.day === todayName);

      return {
        ...batch,
        students: students.filter((s) => s.batchId === batch.id),
        todayTime: todaySchedule?.time || null,
      };
    });

    const sortByTime = (a, b) => {
      if (!a.todayTime) return 1;
      if (!b.todayTime) return -1;
      return a.todayTime.localeCompare(b.todayTime);
    };

    const todayList = mapped
      .filter((b) => b.todayTime !== null)
      .sort(sortByTime);

    const upcomingList = mapped.filter((b) => b.todayTime === null);

    return {
      todayBatches: todayList,
      otherBatches: upcomingList,
    };
  }, [batches, students, selectedDate]);

  /* ================= UI ================= */

  const BatchBlock = ({ batch }) => {
    const isCancelled = cancelledBatches[batch.id];
    const highlight = batch.paymentPending || batch.externalAlert;

    return (
      <div
        className={`rounded-3xl p-6 bg-white/90 backdrop-blur-md shadow-md border ${
          batch.type === "external"
            ? "border-red-400"
            : batch.type === "personal"
              ? "border-blue-300"
              : "border-blue-100"
        } ${highlight ? "ring-2 ring-red-300" : ""}`}
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
            {(() => {
              const [year, month, day] = selectedDate.split("-");
              const localDate = new Date(
                Number(year),
                Number(month) - 1,
                Number(day),
              );
              const currentDayName = DAYS[localDate.getDay()];

              // If batch has per-day schedule
              if (batch.schedule && batch.schedule.length > 0) {
                const todaySchedule = batch.schedule.find(
                  (s) => s.day === currentDayName,
                );

                if (todaySchedule?.time) {
                  return (
                    <span className="text-xs text-gray-500 bg-slate-100 px-3 py-1 rounded-full">
                      {formatToAMPM(todaySchedule.time)}
                    </span>
                  );
                }
              }
              return null;
            })()}
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
                className="flex justify-between items-center rounded-2xl px-4 py-4 bg-blue-50/60 border border-blue-100 shadow-sm hover:shadow-md transition-all duration-200"
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
                    className={`p-2 rounded-xl transition-all duration-200 ${
                      marked
                        ? "bg-blue-500 text-white shadow-md"
                        : "bg-black text-white hover:bg-blue-600"
                    }`}
                  >
                    <Check size={16} />
                  </button>

                  {marked && (
                    <button
                      onClick={() => undoAttendance(student)}
                      className="p-2 rounded-xl bg-red-500 text-white shadow-md hover:bg-red-600 transition-all"
                    >
                      <Undo2 size={16} />
                    </button>
                  )}

                  <button
                    onClick={() => resetStudentClasses(student)}
                    className="p-2 rounded-xl bg-blue-100 text-blue-700 text-xs hover:bg-blue-200 transition-all"
                  >
                    Reset
                  </button>
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

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 px-6 py-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[320px_1fr] gap-16">
          <div className="lg:sticky lg:top-12 h-fit bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-blue-100 shadow-md">
            <h2 className="text-xl font-semibold mb-4">Select Date</h2>

            {/* ===== FULL MONTH CALENDAR ===== */}

            {(() => {
              const current = new Date(selectedDate);
              const year = current.getFullYear();
              const month = current.getMonth();

              const firstDay = new Date(year, month, 1);
              const lastDay = new Date(year, month + 1, 0);

              const startDayIndex = firstDay.getDay();
              const totalDays = lastDay.getDate();

              const daysArray = [];

              // Empty slots before month starts
              for (let i = 0; i < startDayIndex; i++) {
                daysArray.push(null);
              }

              // Actual days
              for (let d = 1; d <= totalDays; d++) {
                daysArray.push(new Date(year, month, d));
              }

              return (
                <div>
                  {/* Month Header */}
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <button
                      onClick={() =>
                        setSelectedDate(
                          toLocalISO(new Date(year, month - 1, 1)),
                        )
                      }
                      className="text-sm px-2 py-1 border rounded"
                    >
                      ←
                    </button>

                    <div className="flex flex-col items-center">
                      <span className="font-medium text-sm">
                        {current.toLocaleString("default", {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>

                      <button
                        onClick={() => setSelectedDate(toLocalISO(new Date()))}
                        className="text-xs text-blue-600 hover:underline mt-1"
                      >
                        Today
                      </button>
                    </div>

                    <button
                      onClick={() =>
                        setSelectedDate(
                          toLocalISO(new Date(year, month + 1, 1)),
                        )
                      }
                      className="text-sm px-2 py-1 border rounded"
                    >
                      →
                    </button>
                  </div>

                  {/* Weekdays */}
                  <div className="grid grid-cols-7 text-xs text-center text-gray-500 mb-2">
                    {DAYS.map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {daysArray.map((day, index) => {
                      if (!day) return <div key={index} className="h-8" />;

                      const iso = toLocalISO(day);
                      const isSelected = iso === selectedDate;

                      return (
                        <button
                          key={index}
                          onClick={() => setSelectedDate(iso)}
                          className={`h-8 text-xs rounded-lg ${
                            isSelected
                              ? "bg-blue-500 text-white shadow-md"
                              : "hover:bg-blue-100"
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 text-xs text-gray-600">
                    {formatFullDate(selectedDate)}
                  </div>
                </div>
              );
            })()}
          </div>

          <div>
            <h1 className="text-3xl font-semibold mb-2">Attendance</h1>
            <p className="text-gray-600 mb-8">{formatFullDate(selectedDate)}</p>

            {todayBatches.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-4">
                  Today
                </h2>
                <div className="space-y-10">
                  {todayBatches.map((batch) => (
                    <BatchBlock key={batch.id} batch={batch} />
                  ))}
                </div>
              </>
            )}

            {otherBatches.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mt-12 mb-4">
                  Other Batches (Manual / Cover Class)
                </h2>

                <div className="space-y-10">
                  {otherBatches.map((batch) => (
                    <BatchBlock key={batch.id} batch={batch} />
                  ))}
                </div>
              </>
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
