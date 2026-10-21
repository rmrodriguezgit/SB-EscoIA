import { useEffect, useState } from "react";
import { request, setCsrf, csrf } from "./api";
import type { Row, User } from "./lib/shared";
import { useTask } from "./components/common";
import { PartituraTracker } from "./components/PartituraTracker";
import { Home } from "./views/Home";
import { Curriculum } from "./views/Curriculum";
import { Schedules } from "./views/Schedules";
import { FacialAttendance } from "./views/FacialAttendance";
import { Grades } from "./views/Grades";
import { SurveyDashboard } from "./views/SurveyDashboard";
import { Admin } from "./views/Admin";
import { Respondent } from "./views/Respondent";
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState(
      new URLSearchParams(location.search).get("modulo") || "Inicio",
    ),
    [health, setHealth] = useState<Row>({});
  const task = useTask();
  const token = location.pathname.match(
    /^\/responder\/([A-Za-z0-9_-]{43})$/,
  )?.[1];
  useEffect(() => {
    if (token) {
      setLoading(false);
      return;
    }
    void request("me")
      .then((r) => {
        setCsrf(r.csrf);
        setUser(r.actor);
        return request("health");
      })
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);
  if (token) return <Respondent token={token} />;
  if (loading) return <main className="public">Cargando…</main>;
  if (!user)
    return (
      <main className="public">
        No se pudo conectar con el servicio local. Recarga EscoIA.
      </main>
    );
  const admin = user.roles.includes("admin"),
    teacher = admin || user.roles.includes("teacher"),
    researcher = admin || user.roles.includes("researcher");
  const tabs = [
    "Inicio",
    "Plan curricular",
    "Horarios",
    ...(teacher ? ["Asistencia", "Calificaciones"] : []),
    ...(researcher ? ["Investigación"] : []),
    ...(admin ? ["Administración"] : []),
  ];
  return (
    <div
      className={
        "layout" +
        (new URLSearchParams(location.search).get("embed") === "1"
          ? " embedded"
          : "")
      }
    >
      <aside>
        <div className="brand">
          EI<span>EscoIA</span>
        </div>
        <p className="muted">Campus local · México</p>
        <nav>
          {tabs.map((t) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <p className="eyebrow">
            Administración e investigación universitaria
          </p>
          <h1>{tab}</h1>
          <p className="muted">
            Datos y operaciones en tu Mac · zona horaria Ciudad de México
          </p>
        </header>
        <div hidden={new URLSearchParams(location.search).get("embed") === "1"}>
          <PartituraTracker />
        </div>
        {tab === "Inicio" ? (
          <Home health={health} />
        ) : tab === "Plan curricular" ? (
          <Curriculum admin={admin} />
        ) : tab === "Horarios" ? (
          <Schedules admin={admin} />
        ) : tab === "Asistencia" ? (
          <FacialAttendance admin={admin} />
        ) : tab === "Calificaciones" ? (
          <Grades />
        ) : tab === "Investigación" ? (
          <SurveyDashboard />
        ) : (
          <Admin />
        )}
      </main>
    </div>
  );
}
