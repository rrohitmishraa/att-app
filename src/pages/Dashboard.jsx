import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import Navbar from "../components/Navbar";
import Modal from "../components/Modal";

import html2canvas from "html2canvas";
import { useRef } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Dashboard() {
  const studentsRef = collection(db, "students");
  const batchesRef = collection(db, "batches");

  const exportRef = useRef(null);

  const attendanceRef = collection(db, "attendance");
  const [attendance, setAttendance] = useState([]);
  const [revenueModal, setRevenueModal] = useState(false);

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);

  const [compactView, setCompactView] = useState(true);

  const todayDay = DAYS[new Date().getDay()];

  /* ================= FETCH ================= */

  useEffect(() => {
    const fetchData = async () => {
      const studentSnap = await getDocs(studentsRef);
      const batchSnap = await getDocs(batchesRef);
      const attendanceSnap = await getDocs(attendanceRef);

      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setBatches(batchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAttendance(
        attendanceSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    };

    fetchData();
  }, [attendanceRef, studentsRef, batchesRef]);

  /* ================= CURRENT MONTH REVENUE ================= */

  const activeStudents = students.filter((s) => s.active);

  const currentMonthRevenue = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const batchMap = {};
    let grandTotal = 0;

    activeStudents
      .filter((s) => s.type === "external")
      .forEach((student) => {
        const monthlyAttendances = attendance.filter((a) => {
          if (a.studentId !== student.id) return false;

          const date = new Date(a.date);
          return date.getMonth() === month && date.getFullYear() === year;
        });

        const classCount = monthlyAttendances.length;
        const perClass = (student.sharePer8Classes || 0) / 8;
        const earned = classCount * perClass;

        if (!batchMap[student.batchId]) {
          batchMap[student.batchId] = {
            batchName: student.batchName,
            students: [],
            batchTotal: 0,
          };
        }

        batchMap[student.batchId].students.push({
          ...student,
          classCount,
          perClass,
          earned,
        });

        batchMap[student.batchId].batchTotal += earned;
        grandTotal += earned;
      });

    return {
      batches: Object.values(batchMap),
      grandTotal,
    };
  }, [attendance, activeStudents]);

  /* ================= COLORS ================= */
  const batchColors = useMemo(() => {
    const colors = {};

    const pastelColors = [
      "bg-blue-50",
      "bg-green-50",
      "bg-purple-50",
      "bg-pink-50",
      "bg-yellow-50",
      "bg-indigo-50",
      "bg-rose-50",
      "bg-cyan-50",
    ];

    currentMonthRevenue?.batches?.forEach((batch, index) => {
      colors[batch.batchName] = pastelColors[index % pastelColors.length];
    });

    return colors;
  }, [currentMonthRevenue]);

  /* ================= ACTIVE ================= */

  const activePersonal = activeStudents.filter(
    (s) => s.type === "personal",
  ).length;
  const activeExternal = activeStudents.filter(
    (s) => s.type === "external",
  ).length;

  /* ================= PERSONAL ================= */

  const personalPending = activeStudents.filter(
    (s) =>
      s.type === "personal" && s.classesSinceRenewal >= s.reminderAfterClasses,
  );

  /* ================= EXTERNAL ================= */

  const externalCompleted = activeStudents.filter(
    (s) =>
      s.type === "external" &&
      s.totalClassesCompleted > 0 &&
      s.totalClassesCompleted % 8 === 0,
  );

  const externalPending = activeStudents.filter(
    (s) => s.type === "external" && (s.totalClassesCompleted || 0) % 8 !== 0,
  ).length;

  /* ================= MONTH ================= */

  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
  }, []);

  /* ================= TODAY VIEW (NO MARKING) ================= */

  const todayBatches = useMemo(() => {
    return batches
      .map((b) => {
        const todaySchedule = b.schedule?.find((s) => s.day === todayDay);

        if (!todaySchedule) return null;

        return {
          ...b,
          todayTime: todaySchedule.time,
          students: activeStudents.filter((s) => s.batchId === b.id),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const [h1, m1] = a.todayTime.split(":").map(Number);
        const [h2, m2] = b.todayTime.split(":").map(Number);

        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
  }, [batches, activeStudents, todayDay]);

  /* ================= TOMORROW ================= */

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = DAYS[tomorrow.getDay()];

  const tomorrowBatches = useMemo(() => {
    return batches
      .map((b) => {
        const tomorrowSchedule = b.schedule?.find((s) => s.day === tomorrowDay);

        if (!tomorrowSchedule) return null;

        return {
          ...b,
          tomorrowTime: tomorrowSchedule.time,
          students: activeStudents.filter((s) => s.batchId === b.id),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const [h1, m1] = a.tomorrowTime.split(":").map(Number);
        const [h2, m2] = b.tomorrowTime.split(":").map(Number);

        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
  }, [batches, activeStudents, tomorrowDay]);

  /* ================= NEXT CLASS DATE ================= */
  const getNextClassDates = (student, remaining) => {
    const batch = batches.find((b) => b.id === student.batchId);
    if (!batch?.schedule || remaining <= 0) return [];

    const today = new Date();
    const result = [];

    for (let i = 1; i <= 30; i++) {
      const future = new Date();
      future.setDate(today.getDate() + i);

      const dayName = DAYS[future.getDay()];
      const match = batch.schedule.find((s) => s.day === dayName);

      if (match) {
        result.push(
          future.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
        );
      }

      if (result.length === remaining) break; // 🔥 only as many as needed
    }

    return result;
  };

  /* ================= SCREENSHOT ================= */

  const handleExport = async () => {
    if (!exportRef.current) return;

    const canvas = await html2canvas(exportRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );

    if (!blob) return;

    const file = new File([blob], `Revenue-${currentMonthLabel}.png`, {
      type: "image/png",
    });

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    try {
      // ✅ If mobile and share supported → use native share
      if (
        isMobile &&
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          title: "Monthly Revenue Report",
          files: [file],
        });
        return;
      }

      // ✅ Desktop → copy to clipboard
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
          }),
        ]);
        alert("Screenshot copied to clipboard");
        return;
      }

      // Fallback → open preview
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
  };

  /* ================= TIME FORMAT ================= */

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

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 px-6 py-10">
        <div className="max-w-7xl mx-auto space-y-12">
          {/* ================= KPI STRIP ================= */}
          <div className="grid md:grid-cols-4 gap-6">
            {/* Revenue */}
            <div
              onClick={() => setRevenueModal(true)}
              className="bg-blue-50 rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
            >
              <p className="text-sm text-gray-500">This Month Revenue</p>
              <p className="text-3xl font-semibold mt-2 text-black tracking-tight">
                ₹{Number(currentMonthRevenue?.grandTotal || 0).toFixed(0)}
              </p>
            </div>

            {/* Active Students */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300">
              <p className="text-sm text-gray-500">Active Students</p>
              <p className="text-3xl font-semibold mt-2 text-black tracking-tight">
                {activeStudents.length}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                P: {activePersonal} | Ex: {activeExternal}
              </p>
            </div>

            {/* Personal Pending */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300">
              <p className="text-sm text-gray-500">Personal Payment Pending</p>
              <p className="text-3xl font-semibold mt-2 text-red-500 tracking-tight">
                {personalPending.length}
              </p>
            </div>

            {/* External Completed */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300">
              <p className="text-sm text-gray-500">External Cycle Status</p>

              <div className="mt-3 flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500">Completed</p>
                  <p className="text-xl font-semibold text-green-600">
                    {externalCompleted.length}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Pending</p>
                  <p className="text-xl font-semibold text-red-600">
                    {externalPending}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ================= TODAY ================= */}
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-black tracking-tight">
              Today's Classes
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {todayBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  <h3 className="font-semibold text-lg">{batch.batchName}</h3>

                  <p className="text-sm text-gray-600">{batch.todayTime}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {batch.students.map((s) => (
                      <span
                        key={s.id}
                        className="text-sm px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ================= TOMORROW ================= */}
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-black tracking-tight">
              Tomorrow's Schedule
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {tomorrowBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  <h3 className="font-semibold text-lg">{batch.batchName}</h3>

                  <p className="text-sm text-gray-600">{batch.tomorrowTime}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {batch.students.map((s) => (
                      <span
                        key={s.id}
                        className="text-sm px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ================= ALERTS SECTION ================= */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Personal Pending List */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300">
              <h3 className="font-semibold mb-4 text-red-600">
                Personal - Payment Pending
              </h3>

              {personalPending.length === 0 && (
                <p className="text-sm text-gray-500">No pending payments</p>
              )}

              {personalPending.map((s) => (
                <p key={s.id} className="text-sm mb-2">
                  {s.name} — {s.batchName}
                </p>
              ))}
            </div>

            {/* External Cycle Status Table */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300">
              <h3 className="font-semibold mb-6 text-blue-600">
                External - Cycle Status
              </h3>

              {batches
                .filter((b) => b.type === "external")
                .map((batch) => {
                  const batchStudents = activeStudents.filter(
                    (s) => s.type === "external" && s.batchId === batch.id,
                  );

                  if (batchStudents.length === 0) return null;

                  return (
                    <div key={batch.id} className="mb-8">
                      {/* Batch Header */}
                      <div className="mb-4 border-b pb-3">
                        {/* Batch Name */}
                        <h4 className="font-semibold text-base text-gray-800">
                          {batch.batchName}
                        </h4>

                        {/* Batch Schedule */}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {batch.schedule
                            ?.sort(
                              (a, b) =>
                                DAYS.indexOf(a.day) - DAYS.indexOf(b.day),
                            )
                            .map((s, i) => (
                              <span
                                key={i}
                                className="px-3 py-1 bg-blue-100 rounded-full text-xs text-blue-700 font-medium"
                              >
                                {s.day} {formatToAMPM(s.time)}
                              </span>
                            ))}
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-2xl shadow-sm">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50">
                            <tr>
                              <th className="px-4 py-3 text-sm font-medium text-gray-700 text-center">
                                Status
                              </th>
                              <th className="px-4 py-3 text-sm font-medium text-gray-700 text-left">
                                Student
                              </th>
                              <th className="px-4 py-3 text-sm font-medium text-gray-700 text-center">
                                Completed
                              </th>
                              <th className="px-4 py-3 text-sm font-medium text-gray-700 text-center">
                                Remaining
                              </th>
                              <th className="px-4 py-3 text-sm font-medium text-gray-700 text-left">
                                Upcoming
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {batchStudents.map((s) => {
                              const completed = s.totalClassesCompleted || 0;
                              const remainder = completed % 8;
                              const remaining =
                                remainder === 0 ? 0 : 8 - remainder;

                              const upcoming =
                                remaining > 0 && remaining <= 2
                                  ? getNextClassDates(s, remaining)
                                  : [];

                              const isCompleted = remaining === 0;

                              return (
                                <tr
                                  key={s.id}
                                  className="hover:bg-blue-50 transition-colors"
                                >
                                  <td className="px-4 py-3 text-sm text-gray-800 text-center">
                                    {isCompleted ? (
                                      <span className="text-green-600 font-semibold">
                                        Completed
                                      </span>
                                    ) : (
                                      <span className="text-red-600 font-semibold">
                                        Pending
                                      </span>
                                    )}
                                  </td>

                                  <td className="px-4 py-3 text-sm text-gray-800">
                                    {s.name}
                                  </td>

                                  <td className="px-4 py-3 text-sm text-gray-800 text-center">
                                    {remainder}
                                  </td>

                                  <td className="px-4 py-3 text-sm text-gray-800 text-center">
                                    {remaining}
                                  </td>

                                  <td className="px-4 py-3 text-sm text-gray-800 text-xs text-gray-600">
                                    {upcoming.length > 0
                                      ? upcoming.join(", ")
                                      : "-"}
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
          </div>
        </div>
      </div>

      <Modal
        isOpen={revenueModal}
        onClose={() => setRevenueModal(false)}
        title={`Revenue Breakdown – ${currentMonthLabel}`}
        size="wide"
      >
        {currentMonthRevenue?.batches?.length === 0 && (
          <p className="text-sm text-gray-500">No data</p>
        )}

        <div className="flex justify-end mb-4">
          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-black text-white rounded-full shadow-md hover:shadow-lg transition-all duration-200"
          >
            Screenshot
          </button>
        </div>

        {/* Toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setCompactView((prev) => !prev)}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-full shadow-md hover:shadow-lg transition-all duration-200"
          >
            {compactView ? "Show Detailed View" : "Hide Fee Details"}
          </button>
        </div>

        <div className="overflow-auto max-h-[75vh]">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-blue-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-gray-700 text-left">
                  Batch
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700 text-left">
                  Student
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700 text-center">
                  Classes
                </th>

                {!compactView && (
                  <>
                    <th className="px-4 py-3 text-sm font-medium text-gray-700 text-right">
                      Per Month (8)
                    </th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-700 text-right">
                      Per Class
                    </th>
                  </>
                )}

                <th className="px-4 py-3 text-sm font-medium text-gray-700 text-right">
                  Earned (This Month)
                </th>
              </tr>
            </thead>

            <tbody>
              {currentMonthRevenue?.batches?.map((batch) =>
                batch.students.map((s, index) => {
                  const perMonth = s.sharePer8Classes || 0;
                  const perClass = perMonth / 8;

                  const batchColor = batchColors[batch.batchName] || "";

                  return (
                    <tr
                      key={s.id}
                      className={`${batchColor} hover:bg-opacity-70`}
                    >
                      <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                        {index === 0 ? batch.batchName : ""}
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-800">
                        {s.name}
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-800 text-center">
                        {s.classCount}
                      </td>

                      {!compactView && (
                        <>
                          <td className="px-4 py-3 text-sm text-gray-800 text-right">
                            ₹{Math.round(perMonth)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 text-right">
                            ₹{Math.round(perClass)}
                          </td>
                        </>
                      )}

                      <td className="px-4 py-3 text-sm text-gray-800 text-right font-semibold">
                        ₹{Math.round(s.earned || 0)}
                      </td>
                    </tr>
                  );
                }),
              )}

              {/* Grand Total */}
              <tr className="bg-blue-100 font-semibold text-lg">
                <td className="px-4 py-4 text-sm text-gray-800">Grand Total</td>

                <td className="px-4 py-4 text-sm text-gray-800"></td>
                <td className="px-4 py-4 text-sm text-gray-800"></td>

                {!compactView && (
                  <>
                    <td className="px-4 py-4 text-sm text-gray-800"></td>
                    <td className="px-4 py-4 text-sm text-gray-800"></td>
                  </>
                )}

                <td className="px-4 py-4 text-sm text-gray-800 text-right text-xl">
                  ₹{Math.round(currentMonthRevenue?.grandTotal || 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* HEDDEN EXPORT BLOCK */}
          <div
            ref={exportRef}
            className="fixed -left-[9999px] top-0 w-[1200px] bg-white p-12 rounded-2xl"
          >
            <h2 className="text-2xl font-semibold mb-6">
              Revenue Breakdown – {currentMonthLabel}
            </h2>

            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-sm font-medium text-gray-700 text-left">
                    Batch
                  </th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-700 text-left">
                    Student
                  </th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-700 text-center">
                    Classes
                  </th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-700 text-right">
                    Fees
                  </th>
                </tr>
              </thead>

              <tbody>
                {currentMonthRevenue?.batches?.map((batch) =>
                  batch.students.map((s, index) => {
                    const batchColor = batchColors?.[batch.batchName] || "";

                    return (
                      <tr key={s.id} className={batchColor}>
                        <td className="px-4 py-3 text-sm text-gray-800">
                          {index === 0 ? batch.batchName : ""}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-800">
                          {s.name}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-800 text-center">
                          {s.classCount}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-800 text-right">
                          ₹{Math.round(s.earned || 0)}
                        </td>
                      </tr>
                    );
                  }),
                )}

                <tr className="bg-blue-100 font-semibold text-lg">
                  <td className="px-4 py-4 text-sm text-gray-800">
                    Grand Total
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-800"></td>
                  <td className="px-4 py-4 text-sm text-gray-800"></td>
                  <td className="px-4 py-4 text-sm text-gray-800 text-right">
                    ₹{Math.round(currentMonthRevenue?.grandTotal || 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </>
  );
}
