import { useEffect, useRef, useState } from "react";
import { request, tool } from "../api";
import { RosterAdmin } from "../components/RosterAdmin";
import { AttendanceContext } from "../components/AttendanceContext";
import { biometrics } from "../lib/shared";
import type { Row } from "../lib/shared";
import { useTask } from "../components/common";
export function FacialAttendance({ admin }: { admin: boolean }) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    currentSession = useRef(""),
    dialog = useRef<HTMLDialogElement>(null),
    scanInFlight = useRef(false),
    scanRunner = useRef<() => Promise<number>>(async()=>2200);
  const [active, setActive] = useState(false),
    [session, setSession] = useState(""),
    [student, setStudent] = useState(""),
    [studentIdentity, setStudentIdentity] = useState<{name:string;number:string;list_number?:number} | null>(null),
    [mode, setMode] = useState<"attendance" | "enroll">("attendance"),
    [identityConfirmed, setIdentityConfirmed] = useState(false),
    [consent, setConsent] = useState(false),
    [supervised, setSupervised] = useState(false);
  const [opened, setOpened] = useState(false);
  const [autoPaused,setAutoPaused] = useState(false);
  const [classContext, setClassContext] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [lastRegistered, setLastRegistered] = useState("");
  const [lastRecognition,setLastRecognition] = useState<{name:string;number:string;at:number;duplicate:boolean;status?:string;confidence?:number}|null>(null);
  const [clock, setClock] = useState(Date.now());
  const [notice, setNotice] = useState<{kind:"success"|"warning"|"error"|"working"|"ready";title:string;detail:string} | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const task = useTask();
  async function perform(fn: () => Promise<any>) {
    setNotice({kind:"working",title:"Procesando",detail:"Espera la confirmación del sistema antes de continuar."});
    return task.run(async () => {
      try {
        const result = await fn();
        setNotice(previous => previous?.kind === "working" ? {kind:"ready",title:"Captura preparada",detail:"Sigue las indicaciones de la cámara."} : previous);
        return result;
      } catch (error) {
        setNotice({kind:"error",title:"No se completó",detail:error instanceof Error ? error.message : "Revisa la cámara y vuelve a intentarlo."});
        throw error;
      }
    });
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function attendanceAction(payload: Row) {
    const result = await tool(biometrics, payload);
    const id = result?.studentId ?? result?.enrolled ?? result?.deleted;
    if (!id) return result;
    let identity = String(id) === student ? studentIdentity : null;
    if (!identity) {
      try {
        const students = await request("records/students");
        const matched = students.find((s: Row) => s.id === id);
        if (matched) identity = {name:matched.name, number:matched.number};
      } catch { /* La asistencia ya se guardó; una consulta de nombre no la repite. */ }
    }
    const display = identity ? `${identity.name} · Matrícula ${identity.number}` : "Alumno identificado por el sistema";
    const nextNotice = result.alreadyRecorded
      ? {kind:"warning" as const,title:"Asistencia ya registrada",detail:`${display}. Ya se tomó asistencia en esta clase; no se duplicó el registro.`}
      : result.alreadyRegistered
      ? {kind:"warning" as const,title:"Rostro ya registrado",detail:`${display}. Utiliza la asistencia con rostro registrado; este intento no añadió asistencia.`}
      : payload.action === "enroll"
      ? {kind:"success" as const,title:"Registro inicial completado",detail:`${display}. Biometría guardada en su matrícula${result.attendanceRegistered ? " y asistencia acreditada en esta clase" : ""}.`}
      : payload.action === "delete"
      ? {kind:"ready" as const,title:"Registro facial eliminado",detail:display}
      : {kind:"success" as const,title:result.status === "present" ? `Presente${typeof result.confidence === "number" ? ` · confianza ${Math.round(result.confidence*100)}%` : ""}` : result.status === "late" ? `Retardo${typeof result.confidence === "number" ? ` · confianza ${Math.round(result.confidence*100)}%` : ""}` : "Registro manual guardado",detail:`${display}. ${payload.action === "verify" ? "Alumno con biometría ya registrada: rostro reconocido y asistencia guardada en el sistema." : "El sistema confirmó el registro solicitado."}`};
    setNotice(nextNotice);
    if(payload.action === "verify" && identity) setLastRecognition({...identity,at:Date.now(),duplicate:!!result.alreadyRecorded,status:result.status,confidence:result.confidence});
    if(payload.action === "verify" && !result.alreadyRecorded) chime(result.status === "late" ? 440 : 880);
    if (!result.alreadyRegistered) {
      setRefreshRevision(value => value + 1);
      
      if (payload.action === "enroll") {setConsent(false);setIdentityConfirmed(false);setLastRegistered(String(id));}
    }
    if (!identity) return result;
    return {...result, ...(result.studentId !== undefined ? {studentId:display} : {}),
      ...(result.enrolled !== undefined ? {enrolled:display} : {}),
      ...(result.deleted !== undefined ? {deleted:display} : {})};
  }
  async function start() {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    if (!mounted.current || !dialog.current?.open) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = s;
    if (video.current) video.current.srcObject = s;
    setActive(true);
  }
  function frame() {
    const v = video.current;
    if (!v?.videoWidth) throw Error("Activa la cámara");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return c.toDataURL("image/jpeg", 0.85);
  }
  function resetPerson() {
    setStudent("");setStudentIdentity(null);setConsent(false);setIdentityConfirmed(false);setNotice(null);setSearch("");
  }
  function selectPerson(value: string) {
    resetPerson();
    const selected = classContext?.students.find((s:Row) => String(s.id) === value && !s.biometric);
    if (selected) {setStudent(String(selected.id));setStudentIdentity({name:selected.name,number:selected.number,list_number:selected.list_number});}
  }
  function openCapture(nextMode: "attendance" | "enroll") {
    resetPerson();setLastRecognition(null);setLastRegistered("");setSupervised(false);setAutoPaused(false);setMode(nextMode);setOpened(true);
  }
  function closeCapture() { if (!task.busy) setOpened(false); }
  function nextPerson() {
    resetPerson();
    if (mode === "enroll") {
      const next = classContext?.students.filter((s:Row) => !s.biometric && String(s.id) !== lastRegistered)
        .sort((a:Row,b:Row) => (a.list_number ?? 9999)-(b.list_number ?? 9999) || a.name.localeCompare(b.name,"es"))[0];
      if (next) selectPerson(String(next.id));
      else setNotice({kind:"ready",title:"Lista completada",detail:"No quedan alumnos pendientes de registro biométrico en este grupo."});
    } else setNotice({kind:"ready",title:"Siguiente alumno",detail:"Coloca a la siguiente persona frente a la cámara e inicia la verificación."});
  }
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()),1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!opened) return;
    dialog.current?.showModal();
    void perform(start);
    return () => {
      dialog.current?.close();
      stream.current?.getTracks().forEach(t => t.stop());
      stream.current=null;setActive(false);
    };
  }, [opened]);
  useEffect(() => {
    if (opened && (!session || !classContext || clock / 1000 >= classContext.ends)) {
      setOpened(false);
      setNotice({kind:"warning",title:"Clase finalizada o cambiada",detail:"Confirma nuevamente docente y grupo antes de abrir la captura."});
    }
  }, [session, classContext, opened, clock]);
  scanRunner.current = async () => {
    if (!video.current?.videoWidth || document.visibilityState !== "visible") return 900;
    const result = await perform(async () => {
      try {
        const images = [frame()];
        for (let i=0;i<2;i++) {
          await new Promise(resolve => setTimeout(resolve,180));
          if (!dialog.current?.open || !stream.current) return null;
          images.push(frame());
        }
        const challenge = await request("attendance/challenge",{sessionId:Number(session)});
        return await attendanceAction({action:"verify",sessionId:Number(session),challengeId:challenge.challengeId,frames:images,captureMode:"passive",supervised:true});
      } catch(error) {
        const message=error instanceof Error ? error.message : String(error);
        if (/único rostro|demasiado pequeño|borrosa|oscura|Identidad no confirmada/.test(message)) {
          setNotice({kind:"ready",title:"Esperando un rostro reconocible",detail:message+". No se registró asistencia; la cámara volverá a comprobar automáticamente."});
          return {waiting:true};
        }
        setAutoPaused(true);
        throw error;
      }
    });
    return result?.waiting ? 900 : result ? 2600 : 4000;
  };
  useEffect(() => {
    if (!opened || !active || !supervised || mode !== "attendance" || autoPaused || !session) return;
    let stopped=false;
    const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
    const loop=async()=>{
      await wait(700);
      while (!stopped) {
        let delay=900;
        if (!scanInFlight.current && document.visibilityState === "visible") {
          scanInFlight.current=true;
          try {delay=await scanRunner.current();} finally {scanInFlight.current=false;}
        }
        await wait(delay);
      }
    };
    void loop();
    return ()=>{stopped=true;};
  },[opened,active,supervised,mode,autoPaused,session]);
  const time = (stamp:number) => new Date(stamp*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"});
  const pending = (classContext?.students || []).filter((s:Row) => !s.biometric && String(s.id) !== lastRegistered)
    .sort((a:Row,b:Row) => (a.list_number ?? 9999)-(b.list_number ?? 9999) || a.name.localeCompare(b.name,"es"));
  const filtered = pending.filter((s:Row) => !search.trim() || `${s.name} ${s.number} ${s.list_number ?? ""}`.toLocaleLowerCase("es-MX").includes(search.trim().toLocaleLowerCase("es-MX")));
  const ready = !!session && !!classContext && clock/1000 >= classContext.starts && clock/1000 < classContext.ends;
  return (
    <section className="attendance-home">
      <div className="attendance-heading"><div><small>CONTROL DE ASISTENCIA</small><h2>Tu clase, en tiempo real</h2><p>Elige docente y confirma el grupo del horario actual.</p></div><span className="attendance-clock">{new Date(clock).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</span></div>
      {admin && <RosterAdmin onChanged={() => setRefreshRevision(v => v+1)} />}
      <fieldset className="attendance-context" disabled={task.busy || opened}>
        <AttendanceContext refreshRevision={refreshRevision} registrationMode={false} onClass={setClassContext}
          captureActions={<div className="capture-launchers">
        <button className="capture-launch" disabled={!ready || task.busy} onClick={() => openCapture("attendance")}><span className="capture-launch-icon">◎</span><span><strong>Tomar asistencia</strong><small>Reconocer rostros ya registrados, en cualquier orden</small></span><span>↗</span></button>
        {admin && <button className="capture-launch secondary" disabled={!ready || task.busy} onClick={() => openCapture("enroll")}><span className="capture-launch-icon">＋</span><span><strong>Registro por primera vez</strong><small>Elegir alumno, guardar rostro y acreditar asistencia</small></span><span>↗</span></button>}
      </div>}
          onSelectionClear={resetPerson} onStudent={(id,identity) => {setStudent(id);setStudentIdentity(identity);}}
          onSession={id => {if(id !== currentSession.current) resetPerson();currentSession.current=id;setSession(id);}} />
      </fieldset>
      {!ready && <p className="muted">Las ventanas de captura se habilitan al confirmar una clase vigente.</p>}
      {!opened && notice && <p role="status">{notice.title}: {notice.detail}</p>}
      <dialog ref={dialog} className="capture-dialog" aria-labelledby="capture-dialog-title" onCancel={e => {e.preventDefault();closeCapture();}} onClick={e => {if(e.target===dialog.current) closeCapture();}}>
        <header className="capture-dialog-header"><div><small>{mode === "enroll" ? "ALTA BIOMÉTRICA" : "ASISTENCIA FACIAL"}</small><h2 id="capture-dialog-title">{mode === "enroll" ? "Primer registro del alumno" : "Reconocimiento y asistencia"}</h2><p>{classContext?.teacher} · {classContext?.group_code} · {classContext?.subject}</p></div><button disabled={task.busy} onClick={closeCapture} aria-label="Cerrar ventana de captura">×</button></header>
        <div className="capture-class-strip"><span>{classContext ? `${time(classContext.starts)}–${time(classContext.ends)}` : ""}</span><span>{new Date(clock).toLocaleDateString("es-MX",{timeZone:"America/Mexico_City"})}</span><span className="capture-live">● {active ? "Cámara activa" : "Cámara detenida"}</span></div>
        <div className="capture-dialog-body">
          <div className="capture-camera-column">
            <div className="capture-camera-stage"><video ref={video} autoPlay muted playsInline /><div className="capture-camera-guide" aria-hidden="true" /><span>{active ? "Una persona a la vez · rostro centrado" : "Permite el acceso a la cámara para comenzar"}</span></div>
            {mode === "enroll" ? <div className="capture-authorization">
              <label className="check"><input type="checkbox" checked={identityConfirmed} disabled={task.busy || !studentIdentity} onChange={e => setIdentityConfirmed(e.target.checked)} />Confirmo que la persona es {studentIdentity ? `${studentIdentity.name} · ${studentIdentity.number}` : "el alumno seleccionado"}</label>
              <label className="check"><input type="checkbox" checked={consent} disabled={task.busy || !studentIdentity} onChange={e => setConsent(e.target.checked)} />El alumno otorgó consentimiento para guardar su rostro</label>
            </div> : <label className="check capture-authorization"><input type="checkbox" checked={supervised} disabled={task.busy} onChange={e => setSupervised(e.target.checked)} />El docente supervisa esta captura</label>}
            <div className="actions"><button className="secondary" disabled={task.busy || active} onClick={() => perform(start)}>Activar cámara</button><button className="secondary" disabled={task.busy || !active} onClick={() => {stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setActive(false);}}>Apagar cámara</button></div>
          </div>
          <div className="capture-work-column">
            {mode === "enroll" ? <>
              <div className="capture-panel-heading"><h3>Alumno que vas a registrar</h3><span>{pending.length} pendientes</span></div>
              <label>Buscar en la lista<input disabled={task.busy} value={search} onChange={e => {setSearch(e.target.value);setStudent("");setStudentIdentity(null);setConsent(false);setIdentityConfirmed(false);}} placeholder="Nombre, matrícula o NL" /></label>
              <label>Elegir alumno<select disabled={task.busy} value={student} onChange={e => selectPerson(e.target.value)}><option value="">Selecciona un alumno del grupo</option>{filtered.map((s:Row) => <option key={s.id} value={s.id}>{s.list_number ? `NL ${s.list_number} · ` : ""}{s.name} · {s.number}</option>)}</select></label>
              <div className="capture-identity"><small>IDENTIDAD ASIGNADA</small><strong>{studentIdentity?.name || "Sin alumno seleccionado"}</strong><span>{studentIdentity ? `Matrícula ${studentIdentity.number}${studentIdentity.list_number ? ` · NL ${studentIdentity.list_number}` : ""}` : "Selecciona antes de guardar la biometría"}</span></div>
              <button className="capture-primary" disabled={task.busy || !ready || !active || !student || !consent || !identityConfirmed} onClick={() => perform(() => attendanceAction({action:"enroll",sessionId:Number(session),studentId:Number(student),studentNumber:studentIdentity!.number,frame:frame(),consent:true}))}>Guardar rostro y asistencia</button>
            </> : <>
              <h3>Identificación sin selección previa</h3><p>La cámara busca al alumno entre los inscritos en este grupo. No importa el orden de llegada.</p>
              <p className="muted">Detección automática: el alumno solo se coloca frente a la cámara unos instantes. No necesita pulsar botones, girar la cabeza ni seguir pasos. Espera el aviso antes de salir del área de la cámara.</p>
              {lastRecognition && <div className="capture-identity"><small>ÚLTIMO ALUMNO RECONOCIDO · {new Date(lastRecognition.at).toLocaleTimeString("es-MX")}</small><strong>{lastRecognition.name}</strong><span>Matrícula {lastRecognition.number} · {lastRecognition.duplicate ? "Ya tenía asistencia; no se duplicó" : lastRecognition.status === "late" ? "Retardo registrado" : "Presente"}{typeof lastRecognition.confidence === "number" ? ` · confianza ${Math.round(lastRecognition.confidence*100)}%` : ""}</span></div>}
              <div className="passive-indicator" role="status"><span className={active&&supervised&&!autoPaused?"passive-dot active":"passive-dot"}/>{!supervised?"Activa la supervisión docente para iniciar":autoPaused?"Reconocimiento pausado":active?"Reconocimiento automático activo":"Esperando cámara"}</div>
              <button className="secondary" disabled={!active||!supervised} onClick={()=>setAutoPaused(value=>!value)}>{autoPaused?"Reanudar reconocimiento":"Pausar nuevas capturas"}</button>
              <small>La confirmación usa varias imágenes automáticas y una sola identidad del grupo. No sustituye la supervisión ni constituye una prueba de vida.</small>
            </>}
            <div className={`capture-result ${notice?.kind || "ready"}`} role={notice?.kind === "error" ? "alert" : "status"} aria-live="polite"><span className="capture-result-icon">{notice?.kind === "success" ? "✓" : notice?.kind === "error" ? "!" : notice?.kind === "working" ? "◌" : "◎"}</span><div><strong>{notice?.title || "Listo para capturar"}</strong><p>{notice?.detail || "El resultado aparecerá aquí después de la confirmación del sistema."}</p></div></div>
          </div>
        </div>
        <footer className="capture-dialog-footer"><small>Una asistencia por alumno y clase. Los duplicados se conservan como un único registro.</small><div className="actions"><button className="secondary" disabled={task.busy} onClick={closeCapture}>Cerrar</button>{mode === "enroll" && <button disabled={task.busy || !ready || !notice || !["success","warning"].includes(notice.kind)} onClick={nextPerson}>Siguiente alumno →</button>}</div></footer>
      </dialog>
    </section>
  );
}

/** Confirmación auditiva breve (tono agudo = presente, grave = retardo). Sin audio disponible no hace nada. */
function chime(freq: number) {
  try {
    const ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = freq; gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.26); osc.onended = () => void ctx.close();
  } catch { /* sin audio */ }
}
