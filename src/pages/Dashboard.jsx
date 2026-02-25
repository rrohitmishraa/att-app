import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import Navbar from "../components/Navbar";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Dashboard() {
  const studentsRef = collection(db, "students");
  const batchesRef = collection(db, "batches");

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);

  const todayDay = DAYS[new Date().getDay()];

  /* ================= FETCH ================= */

  useEffect(() => {
    const fetchData = async () => {
      const studentSnap = await getDocs(studentsRef);
      const batchSnap = await getDocs(batchesRef);

      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setBatches(batchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };

    fetchData();
  }, [studentsRef, batchesRef]);

  /* ================= ACTIVE ================= */

  const activeStudents = students.filter((s) => s.active);
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

  /* ================= REVENUE ================= */

  const lifetimeRevenue = activeStudents
    .filter((s) => s.type === "external")
    .reduce((sum, s) => {
      const cycles = Math.floor((s.totalClassesCompleted || 0) / 8);
      return sum + cycles * (s.sharePer8Classes || 0);
    }, 0);

  /* ================= TODAY VIEW (NO MARKING) ================= */

  const todayBatches = useMemo(() => {
    return batches
      .filter((b) => b.classDays?.includes(todayDay))
      .map((b) => ({
        ...b,
        students: activeStudents.filter((s) => s.batchId === b.id),
      }))
      .sort((a, b) => {
        const [h1, m1] = a.time.split(":").map(Number);
        const [h2, m2] = b.time.split(":").map(Number);
        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
  }, [batches, activeStudents, todayDay]);

  /* ================= TOMORROW ================= */

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = DAYS[tomorrow.getDay()];

  const tomorrowBatches = useMemo(() => {
    return batches
      .filter((b) => b.classDays?.includes(tomorrowDay))
      .map((b) => ({
        ...b,
        students: activeStudents.filter((s) => s.batchId === b.id),
      }))
      .sort((a, b) => {
        const [h1, m1] = a.time.split(":").map(Number);
        const [h2, m2] = b.time.split(":").map(Number);
        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
  }, [batches, activeStudents, tomorrowDay]);

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[380px_1fr] gap-12">
          {/* LEFT COLUMN */}
          <div className="space-y-10 lg:sticky lg:top-10 h-fit">
            {/* KPI */}
            <div className="grid gap-6">
              <Card title="Personal Pending" value={personalPending.length} />
              <Card
                title="External Completed"
                value={externalCompleted.length}
              />
              <Card title="Lifetime Revenue" value={`₹${lifetimeRevenue}`} />

              <div className="bg-white border rounded-2xl p-6 shadow-sm">
                <p className="text-sm text-gray-500">Active Students</p>
                <p className="text-2xl font-semibold mt-2">
                  {activeStudents.length}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  P: {activePersonal} | Ex: {activeExternal}
                </p>
              </div>
            </div>

            {/* LISTS */}
            <ListBlock
              title="Personal - Payment Pending"
              data={personalPending}
              color="red"
            />
            <ListBlock
              title="External - Cycle Completed"
              data={externalCompleted}
              color="blue"
            />
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-12">
            {/* TODAY */}
            <div>
              <h2 className="text-xl font-semibold mb-6">Today's Classes</h2>

              <div className="grid md:grid-cols-2 gap-6">
                {todayBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="bg-white border rounded-2xl p-6 shadow-sm"
                  >
                    <h3 className="font-semibold text-lg">{batch.batchName}</h3>
                    <p className="text-sm text-gray-600">{batch.time}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {batch.students.map((s) => (
                        <span
                          key={s.id}
                          className="text-sm px-3 py-1 rounded-full bg-slate-100 border"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* TOMORROW */}
            <div>
              <h2 className="text-xl font-semibold mb-6">
                Tomorrow's Schedule
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                {tomorrowBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="bg-white border rounded-2xl p-6 shadow-sm"
                  >
                    <h3 className="font-semibold text-lg">{batch.batchName}</h3>
                    <p className="text-sm text-gray-600">{batch.time}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {batch.students.map((s) => (
                        <span
                          key={s.id}
                          className="text-sm px-3 py-1 rounded-full bg-slate-100 border"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* Components */

function Card({ title, value }) {
  return (
    <div className="bg-white border rounded-2xl p-6 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-semibold mt-2">{value}</p>
    </div>
  );
}

function ListBlock({ title, data, color }) {
  const styles = color === "red" ? "text-red-600" : "text-blue-600";

  return (
    <div className="bg-white border rounded-2xl p-6 shadow-sm">
      <h3 className={`font-semibold mb-4 ${styles}`}>{title}</h3>
      {data.length === 0 && <p className="text-sm text-gray-500">None</p>}
      {data.map((item) => (
        <p key={item.id} className="text-sm mb-2">
          {item.name} — {item.batchName}
        </p>
      ))}
    </div>
  );
}
