import { useState, useEffect, useCallback } from "react";

/* ─── UTILS ──────────────────────────────────────────────────── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const daysBetween = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const n = new Date(); n.setHours(0,0,0,0);
  return Math.max(0, Math.ceil((d - n) / 86400000));
};
const weeksBetween = (dateStr) => Math.floor(daysBetween(dateStr) / 7);

const getExamProgress = (exam) => {
  const all = exam.courses.flatMap(c => c.topics);
  if (!all.length) return 0;
  return Math.round(all.filter(t => t.done).length / all.length * 100);
};
const getCourseProgress = (course) => {
  if (!course.topics.length) return 0;
  return Math.round(course.topics.filter(t => t.done).length / course.topics.length * 100);
};
const getUrgency = (weeks, topicsLeft) => {
  const score = weeks - topicsLeft;
  if (score < 0) return { label:"ESTUDIA TRANQUILO", color:"#10b981", bg:"rgba(16,185,129,.14)" };
  if (score === 0) return { label:"ESTÁS JUSTO",       color:"#9ca3af", bg:"rgba(156,163,175,.14)" };
  if (score <= 2)  return { label:"APRENDER MÁS",      color:"#f59e0b", bg:"rgba(245,158,11,.14)" };
  return                   { label:"APRENDER URGENTE", color:"#ef4444", bg:"rgba(239,68,68,.14)" };
};

/* ─── PERSISTENCE ─────────────────────────────────────────────── */
const KEY = "tackedux_v2";
const loadData = async () => {
  try { const r = await window.storage.get(KEY); return r ? JSON.parse(r.value) : null; } catch { return null; }
};
const saveData = async (d) => {
  try { await window.storage.set(KEY, JSON.stringify(d)); } catch {}
};

/* ─── THEME ───────────────────────────────────────────────────── */
const useDark = () => {
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme:dark)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme:dark)");
    const fn = e => setDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return dark;
};
const getT = (dark) => ({
  bg:          dark ? "#0b0f1a" : "#f0f2f9",
  surface:     dark ? "#111827" : "#ffffff",
  card:        dark ? "#141d2e" : "#ffffff",
  border:      dark ? "#1e2d44" : "#e2e8f0",
  borderSub:   dark ? "#162030" : "#f1f5f9",
  text:        dark ? "#e2e8f0" : "#0f172a",
  textSub:     dark ? "#7d8fa8" : "#64748b",
  textFaint:   dark ? "#3d4f66" : "#94a3b8",
  accent:      "#6366f1",
  accentHover: "#4f46e5",
  accentLight: dark ? "rgba(99,102,241,.18)" : "rgba(99,102,241,.08)",
  sidebar:     "#080c18",
  sideB:       "#141e33",
  inputBg:     dark ? "#162030" : "#f8fafc",
  danger:      "#ef4444",
  dangerBg:    "rgba(239,68,68,.08)",
});

/* ─── SHARED COMPONENTS ───────────────────────────────────────── */
function ProgressBar({ pct, color="#6366f1", trackBg, height=8, showPointer=false }) {
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ position:"relative", paddingTop: showPointer ? 30 : 0 }}>
      {showPointer && (
        <div style={{
          position:"absolute", top:0,
          left:`${safe}%`, transform:"translateX(-50%)",
          background:color, color:"#fff",
          fontSize:11, fontWeight:800,
          padding:"2px 8px", borderRadius:6, whiteSpace:"nowrap",
          lineHeight:"18px", zIndex:1
        }}>
          {safe}%
          <div style={{
            position:"absolute", bottom:-5, left:"50%", transform:"translateX(-50%)",
            width:0, height:0,
            borderLeft:"5px solid transparent",
            borderRight:"5px solid transparent",
            borderTop:`5px solid ${color}`
          }}/>
        </div>
      )}
      <div style={{ height, background: trackBg || "rgba(255,255,255,.08)", borderRadius:99, overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${safe}%`, background:color,
          borderRadius:99, transition:"width 0.7s cubic-bezier(.4,0,.2,1)"
        }}/>
      </div>
    </div>
  );
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"3px 9px", borderRadius:99,
      background:bg, fontSize:10, fontWeight:800,
      color, letterSpacing:"0.05em", whiteSpace:"nowrap"
    }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0 }}/>
      {label}
    </span>
  );
}

function Inp({ value, onChange, onKeyDown, placeholder, type="text", min, style: extra }) {
  return (
    <input
      type={type} value={value} onChange={onChange} onKeyDown={onKeyDown}
      placeholder={placeholder} min={min}
      style={{
        width:"100%", padding:"9px 13px",
        background:"transparent", border:"1px solid #1e2d44",
        borderRadius:8, color:"#c9d5e8", fontSize:13, outline:"none",
        fontFamily:"inherit", boxSizing:"border-box",
        colorScheme:"dark", ...extra
      }}
    />
  );
}

/* ─── LOGIN ───────────────────────────────────────────────────── */
function Login({ dark, t, onStart }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const ok = name.trim().length > 1 && date > today;

  return (
    <div style={{
      minHeight:"100vh", background: dark ? "#080c18" : "#0f172a",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      padding:24, position:"relative", overflow:"hidden"
    }}>
      {/* Background decoration */}
      <div style={{
        position:"absolute", top:-120, right:-120, width:400, height:400,
        borderRadius:"50%", background:"rgba(99,102,241,.06)", pointerEvents:"none"
      }}/>
      <div style={{
        position:"absolute", bottom:-80, left:-80, width:300, height:300,
        borderRadius:"50%", background:"rgba(139,92,246,.04)", pointerEvents:"none"
      }}/>

      <div style={{ width:"100%", maxWidth:420, position:"relative" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:12, marginBottom:14 }}>
            <div style={{
              width:52, height:52, borderRadius:14,
              background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 8px 32px rgba(99,102,241,.4)"
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <span style={{ fontSize:34, fontWeight:900, color:"#f8fafc", letterSpacing:"-1.5px" }}>
              tackedux
            </span>
          </div>
          <p style={{ color:"#7d8fa8", fontSize:14, margin:0, letterSpacing:"0.01em" }}>
            Somos tu mejor opción para organizar tus aprendizajes
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:"#111827", border:"1px solid #1e2d44",
          borderRadius:20, padding:"36px 32px", marginBottom:20
        }}>
          <h2 style={{ margin:"0 0 4px", fontSize:22, fontWeight:800, color:"#e2e8f0", letterSpacing:"-0.5px" }}>
            ¡Comienza a estudiar!
          </h2>
          <p style={{ margin:"0 0 28px", fontSize:14, color:"#5a7090" }}>
            Configura tu primer examen para iniciar
          </p>

          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#5a7090", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>
            Nombre del examen
          </label>
          <div style={{ marginBottom:16 }}>
            <Inp
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej. Matemáticas II, ENAM 2025, Biología..."
            />
          </div>

          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#5a7090", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>
            Fecha del examen
          </label>
          <div style={{ marginBottom:32 }}>
            <Inp type="date" min={today} value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <button
            onClick={() => ok && onStart(name.trim(), date)}
            style={{
              width:"100%", padding:"13px 20px",
              background: ok ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#1a2332",
              border:"none", borderRadius:10,
              color: ok ? "#fff" : "#3d4f66",
              fontSize:15, fontWeight:800, cursor: ok ? "pointer" : "default",
              fontFamily:"inherit", transition:"all 0.15s",
              letterSpacing:"-0.2px"
            }}
          >
            Comenzar a estudiar →
          </button>
        </div>

        <p style={{ textAlign:"center", color:"#2d3e56", fontSize:12, margin:0 }}>
          Desarrollado por{" "}
          <span style={{ color:"#4a5e7a", fontWeight:700 }}>Sebastian Paolo Shulla Garcia</span>
        </p>
      </div>
    </div>
  );
}

/* ─── SIDEBAR ─────────────────────────────────────────────────── */
function Sidebar({ exams, currentId, onSelect, onAddExam, onSettings }) {
  const [adding, setAdding] = useState(false);
  const [nm, setNm] = useState("");
  const [dt, setDt] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const doAdd = () => {
    if (nm.trim() && dt > today) {
      onAddExam(nm.trim(), dt);
      setNm(""); setDt(""); setAdding(false);
    }
  };

  const sb = {
    width:244, flexShrink:0, background:"#080c18",
    borderRight:"1px solid #141e33",
    display:"flex", flexDirection:"column",
    fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'
  };

  return (
    <div style={sb}>
      {/* Brand */}
      <div style={{ padding:"20px 18px 16px", borderBottom:"1px solid #141e33" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:34, height:34, borderRadius:9,
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:900, color:"#e2e8f0", letterSpacing:"-0.8px" }}>tackedux</div>
            <div style={{ fontSize:9, color:"#3d4f66", letterSpacing:"0.03em", lineHeight:1.2 }}>Organiza tu aprendizaje</div>
          </div>
        </div>
      </div>

      {/* Exams */}
      <div style={{ flex:1, padding:"14px 10px", overflowY:"auto" }}>
        <div style={{ fontSize:9, fontWeight:800, color:"#2d3e56", textTransform:"uppercase", letterSpacing:"0.1em", padding:"0 8px", marginBottom:8 }}>
          Exámenes activos
        </div>

        {exams.map(e => {
          const active = e.id === currentId;
          const pct = getExamProgress(e);
          const days = daysBetween(e.date);
          return (
            <div key={e.id} onClick={() => onSelect(e.id)} style={{
              padding:"11px 12px", borderRadius:9, cursor:"pointer", marginBottom:2,
              background: active ? "rgba(99,102,241,.18)" : "transparent",
              borderLeft: `3px solid ${active ? "#6366f1" : "transparent"}`,
              transition:"all 0.12s"
            }}>
              <div style={{ fontSize:13, fontWeight:700, color: active ? "#a5b4fc" : "#7d8fa8", marginBottom:5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {e.name}
              </div>
              <div style={{ height:3, background:"#1a2235", borderRadius:99, marginBottom:4, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background: active ? "#6366f1" : "#2d3e56", borderRadius:99 }}/>
              </div>
              <div style={{ fontSize:10, color:"#3d4f66", display:"flex", justifyContent:"space-between" }}>
                <span>{pct}% completado</span>
                <span>{days}d restantes</span>
              </div>
            </div>
          );
        })}

        {adding ? (
          <div style={{ padding:"10px 8px", marginTop:6 }}>
            <input
              value={nm} onChange={e => setNm(e.target.value)}
              placeholder="Nombre del examen"
              style={{
                width:"100%", padding:"7px 10px", marginBottom:6,
                background:"#111827", border:"1px solid #1e2d44",
                borderRadius:6, color:"#c9d5e8", fontSize:12, outline:"none",
                fontFamily:"inherit", boxSizing:"border-box"
              }}
            />
            <input
              type="date" min={today} value={dt} onChange={e => setDt(e.target.value)}
              style={{
                width:"100%", padding:"7px 10px", marginBottom:10,
                background:"#111827", border:"1px solid #1e2d44",
                borderRadius:6, color:"#c9d5e8", fontSize:12, outline:"none",
                fontFamily:"inherit", boxSizing:"border-box", colorScheme:"dark"
              }}
            />
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={doAdd} style={{
                flex:1, padding:"7px 0", background:"#6366f1", border:"none",
                borderRadius:6, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit"
              }}>Añadir</button>
              <button onClick={() => setAdding(false)} style={{
                flex:1, padding:"7px 0", background:"#1a2235", border:"none",
                borderRadius:6, color:"#5a7090", fontSize:12, cursor:"pointer", fontFamily:"inherit"
              }}>✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{
            width:"100%", marginTop:8, padding:"9px 12px",
            background:"transparent", border:"1px dashed #1e2d44",
            borderRadius:8, color:"#3d4f66", fontSize:12,
            cursor:"pointer", textAlign:"left", fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:8
          }}>
            <span style={{ fontSize:18, lineHeight:1 }}>+</span>
            <span>Añadir nuevo examen</span>
          </button>
        )}
      </div>

      {/* Settings + credit */}
      <div style={{ padding:"12px 10px", borderTop:"1px solid #141e33" }}>
        <button onClick={onSettings} style={{
          width:"100%", padding:"10px 14px",
          background:"transparent", border:"1px solid #1e2d44",
          borderRadius:9, color:"#7d8fa8", fontSize:12,
          cursor:"pointer", fontFamily:"inherit",
          display:"flex", alignItems:"center", gap:9,
          transition:"all 0.12s"
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Cambiar Configuración
        </button>
        <p style={{ fontSize:10, color:"#1e2d44", textAlign:"center", margin:"10px 0 0" }}>
          Por Sebastian Paolo Shulla Garcia
        </p>
      </div>
    </div>
  );
}

/* ─── DASHBOARD ───────────────────────────────────────────────── */
function Dashboard({ exam, t, dark }) {
  const pct = getExamProgress(exam);
  const days = daysBetween(exam.date);
  const weeks = weeksBetween(exam.date);
  const allTopics = exam.courses.flatMap(c => c.topics);
  const done = allTopics.filter(tp => tp.done).length;

  const statCard = (label, val, unit) => (
    <div style={{
      background:t.card, border:`1px solid ${t.border}`,
      borderRadius:14, padding:"18px 22px", flex:1
    }}>
      <div style={{ fontSize:10, fontWeight:800, color:t.textFaint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
        <span style={{ fontSize:34, fontWeight:900, color:t.text, letterSpacing:"-1.5px", lineHeight:1 }}>{val}</span>
        <span style={{ fontSize:13, color:t.textSub }}>{unit}</span>
      </div>
    </div>
  );

  return (
    <div style={{ padding:"36px 40px", maxWidth:820 }}>
      <div style={{ marginBottom:32 }}>
        <div style={{ fontSize:11, fontWeight:800, color:t.accent, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>
          Examen Activo
        </div>
        <h1 style={{ margin:0, fontSize:30, fontWeight:900, color:t.text, letterSpacing:"-1px" }}>
          {exam.name}
        </h1>
        <p style={{ margin:"6px 0 0", color:t.textSub, fontSize:14 }}>
          {new Date(exam.date + "T12:00:00").toLocaleDateString("es-PE", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
        </p>
      </div>

      {/* Main progress card */}
      <div style={{
        background:t.card, border:`1px solid ${t.border}`,
        borderRadius:18, padding:"28px 32px", marginBottom:18
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:26 }}>
          <div>
            <div style={{ fontSize:12, color:t.textSub, marginBottom:5, fontWeight:600 }}>Progreso General</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
              <span style={{ fontSize:52, fontWeight:900, color:t.text, letterSpacing:"-2px", lineHeight:1 }}>{pct}</span>
              <span style={{ fontSize:22, color:t.textSub, fontWeight:700 }}>%</span>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:t.textFaint, marginBottom:4 }}>Temas aprendidos</div>
            <div style={{ fontSize:28, fontWeight:900, color:t.text, letterSpacing:"-1px" }}>
              {done}<span style={{ fontSize:16, color:t.textSub, fontWeight:600 }}>/{allTopics.length}</span>
            </div>
          </div>
        </div>
        <ProgressBar
          pct={pct}
          color="#6366f1"
          trackBg={dark ? "#1a2235" : "#e8eaf6"}
          height={14}
          showPointer={true}
        />
      </div>

      {/* Stats row */}
      <div style={{ display:"flex", gap:14, marginBottom:22 }}>
        {statCard("Días restantes", days, "días")}
        {statCard("Semanas", weeks, "sem.")}
        {statCard("Cursos", exam.courses.length, "total")}
      </div>

      {/* Course summary */}
      {exam.courses.length > 0 ? (
        <div style={{
          background:t.card, border:`1px solid ${t.border}`,
          borderRadius:16, padding:"22px 26px"
        }}>
          <h3 style={{ margin:"0 0 18px", fontSize:13, fontWeight:800, color:t.textSub, textTransform:"uppercase", letterSpacing:"0.07em" }}>
            Resumen de Cursos
          </h3>
          {exam.courses.map(course => {
            const cp = getCourseProgress(course);
            const tl = course.topics.filter(tp => !tp.done).length;
            const u = getUrgency(weeks, tl);
            return (
              <div key={course.id} style={{ marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:t.text }}>{course.name}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <Badge {...u} />
                    <span style={{ fontSize:13, fontWeight:800, color:t.textSub, minWidth:36, textAlign:"right" }}>{cp}%</span>
                  </div>
                </div>
                <ProgressBar pct={cp} color="#6366f1" trackBg={dark ? "#1a2235" : "#e8eaf6"} height={6} />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          textAlign:"center", padding:"60px 24px",
          background:t.card, border:`1px dashed ${t.border}`, borderRadius:18
        }}>
          <div style={{ fontSize:52, marginBottom:14 }}>📚</div>
          <p style={{ color:t.textSub, fontSize:14, margin:0 }}>
            No hay cursos aún. ¡Ve a <strong>Cursos</strong> para comenzar a organizar tu estudio!
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── COURSE CARD ─────────────────────────────────────────────── */
function CourseCard({ course, weeks, onUpdate, onDelete, t, dark }) {
  const [newTopic, setNewTopic] = useState("");
  const topicsLeft = course.topics.filter(tp => !tp.done).length;
  const pct = getCourseProgress(course);
  const u = getUrgency(weeks, topicsLeft);

  const addTopic = () => {
    if (!newTopic.trim()) return;
    onUpdate({ ...course, topics:[...course.topics, { id:uid(), name:newTopic.trim(), done:false }] });
    setNewTopic("");
  };
  const toggle = (id) => onUpdate({ ...course, topics: course.topics.map(tp => tp.id===id ? {...tp,done:!tp.done} : tp) });
  const remove = (id) => onUpdate({ ...course, topics: course.topics.filter(tp => tp.id!==id) });

  return (
    <div style={{
      background:t.card, border:`1px solid ${t.border}`,
      borderRadius:14, padding:"20px 22px", marginBottom:16
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9, flexWrap:"wrap" }}>
            <span style={{ fontSize:16, fontWeight:800, color:t.text, letterSpacing:"-0.3px" }}>{course.name}</span>
            <Badge {...u} />
          </div>
          <ProgressBar pct={pct} color="#6366f1" trackBg={dark?"#1a2235":"#e8eaf6"} height={6} />
          <div style={{ fontSize:12, color:t.textSub, marginTop:6, display:"flex", gap:14 }}>
            <span>{course.topics.filter(tp=>tp.done).length}/{course.topics.length} temas</span>
            <span style={{ color:t.textFaint }}>·</span>
            <span style={{ fontWeight:700 }}>{pct}% completado</span>
          </div>
        </div>
        <button onClick={onDelete} style={{
          background:"transparent", border:"none", color:t.textFaint,
          cursor:"pointer", padding:"3px 7px", fontSize:18, lineHeight:1,
          borderRadius:6, marginLeft:14, flexShrink:0
        }}>×</button>
      </div>

      {/* Topics list */}
      {course.topics.length > 0 && (
        <div style={{ marginBottom:12 }}>
          {course.topics.map(tp => (
            <div key={tp.id} style={{
              display:"flex", alignItems:"center", gap:9,
              padding:"7px 10px", borderRadius:8, marginBottom:3,
              background: tp.done
                ? (dark ? "rgba(99,102,241,.1)" : "rgba(99,102,241,.05)")
                : (dark ? "#111827" : "#f8fafc"),
              transition:"background 0.2s"
            }}>
              <div onClick={() => toggle(tp.id)} style={{
                width:18, height:18, borderRadius:5, flexShrink:0, cursor:"pointer",
                border: tp.done ? "none" : `2px solid ${dark?"#2d3e56":"#d1d5db"}`,
                background: tp.done ? "#6366f1" : "transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.15s"
              }}>
                {tp.done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span style={{
                flex:1, fontSize:13, color: tp.done ? t.textSub : t.text,
                textDecoration: tp.done ? "line-through" : "none", transition:"all 0.2s"
              }}>{tp.name}</span>
              <button onClick={() => remove(tp.id)} style={{
                background:"transparent", border:"none", color:t.textFaint,
                cursor:"pointer", padding:"2px 5px", fontSize:14, lineHeight:1
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add topic */}
      <div style={{ display:"flex", gap:8 }}>
        <input
          value={newTopic}
          onChange={e => setNewTopic(e.target.value)}
          onKeyDown={e => e.key==="Enter" && addTopic()}
          placeholder="Añadir tema de estudio..."
          style={{
            flex:1, padding:"8px 12px",
            background:dark?"#111827":"#f8fafc",
            border:`1px solid ${t.border}`, borderRadius:8,
            color:t.text, fontSize:13, outline:"none", fontFamily:"inherit"
          }}
        />
        <button onClick={addTopic} style={{
          padding:"8px 16px", background:"#6366f1", border:"none",
          borderRadius:8, color:"#fff", fontSize:15, fontWeight:800,
          cursor:"pointer", fontFamily:"inherit", lineHeight:1
        }}>+</button>
      </div>
    </div>
  );
}

/* ─── COURSES VIEW ────────────────────────────────────────────── */
function Courses({ exam, t, dark, onUpdateExam }) {
  const [newCourse, setNewCourse] = useState("");
  const weeks = weeksBetween(exam.date);

  const addCourse = () => {
    if (!newCourse.trim()) return;
    onUpdateExam({ ...exam, courses:[...exam.courses, { id:uid(), name:newCourse.trim(), topics:[] }] });
    setNewCourse("");
  };
  const updateCourse = (updated) =>
    onUpdateExam({ ...exam, courses: exam.courses.map(c => c.id===updated.id ? updated : c) });
  const deleteCourse = (id) =>
    onUpdateExam({ ...exam, courses: exam.courses.filter(c => c.id!==id) });

  return (
    <div style={{ padding:"36px 40px", maxWidth:740 }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:11, fontWeight:800, color:t.accent, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>
          {exam.name}
        </div>
        <h1 style={{ margin:0, fontSize:28, fontWeight:900, color:t.text, letterSpacing:"-0.8px" }}>
          Mis Cursos
        </h1>
        <p style={{ margin:"6px 0 0", color:t.textSub, fontSize:14 }}>
          {weeks} semanas restantes para el examen
        </p>
      </div>

      {/* Add course */}
      <div style={{ display:"flex", gap:10, marginBottom:26 }}>
        <input
          value={newCourse}
          onChange={e => setNewCourse(e.target.value)}
          onKeyDown={e => e.key==="Enter" && addCourse()}
          placeholder="Nombre del nuevo curso (Ej: Matemáticas, Biología, Historia...)"
          style={{
            flex:1, padding:"11px 16px",
            background:t.card, border:`1px solid ${t.border}`,
            borderRadius:11, color:t.text, fontSize:14, outline:"none", fontFamily:"inherit"
          }}
        />
        <button onClick={addCourse} style={{
          padding:"11px 22px", background:"#6366f1", border:"none",
          borderRadius:11, color:"#fff", fontSize:14, fontWeight:800,
          cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap"
        }}>+ Añadir Curso</button>
      </div>

      {exam.courses.map(c => (
        <CourseCard
          key={c.id} course={c} weeks={weeks}
          onUpdate={updateCourse} onDelete={() => deleteCourse(c.id)}
          t={t} dark={dark}
        />
      ))}

      {exam.courses.length === 0 && (
        <div style={{
          textAlign:"center", padding:"70px 24px",
          background:t.card, border:`1px dashed ${t.border}`, borderRadius:18
        }}>
          <div style={{ fontSize:52, marginBottom:14 }}>🎯</div>
          <p style={{ color:t.textSub, fontSize:14, margin:0 }}>
            ¡Añade tu primer curso para comenzar a organizar tu estudio!
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── SETTINGS MODAL ──────────────────────────────────────────── */
function Settings({ exam, t, dark, onClose, onUpdate, onDeleteCourses }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState(exam.name);
  const [date, setDate] = useState(exam.date);
  const today = new Date().toISOString().split("T")[0];

  const inp = (val, fn, type="text", extra) => (
    <input
      type={type} value={val} onChange={e => fn(e.target.value)}
      min={type==="date" ? today : undefined}
      style={{
        width:"100%", padding:"10px 14px",
        background:dark?"#162030":"#f8fafc",
        border:`1px solid ${t.border}`, borderRadius:8,
        color:t.text, fontSize:14, outline:"none",
        fontFamily:"inherit", boxSizing:"border-box",
        colorScheme:dark?"dark":"light", ...extra
      }}
    />
  );

  return (
    <div style={{
      position:"absolute", inset:0, zIndex:100, minHeight:600,
      display:"flex", alignItems:"center", justifyContent:"center",
      backgroundColor:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
      padding:24
    }}>
      <div style={{
        width:"100%", maxWidth:420,
        background:dark?"#111827":"#ffffff",
        borderRadius:20, padding:"32px 28px",
        border:`1px solid ${t.border}`,
        fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:t.text, letterSpacing:"-0.3px" }}>
            Configuración
          </h2>
          <button onClick={onClose} style={{
            background:dark?"#1f2937":"#f3f4f6", border:"none", borderRadius:8,
            width:32, height:32, cursor:"pointer", color:t.textSub,
            fontSize:20, display:"flex", alignItems:"center", justifyContent:"center"
          }}>×</button>
        </div>

        <div style={{
          padding:"10px 14px", borderRadius:10, marginBottom:22,
          background:t.accentLight, border:`1px solid ${dark?"#2d3a5c":"#c7d2fe"}`
        }}>
          <span style={{ fontSize:13, color:t.accent, fontWeight:600 }}>📋 {exam.name}</span>
        </div>

        {!mode && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <button onClick={() => setMode("keep")} style={{
              padding:"16px 18px", borderRadius:11, cursor:"pointer",
              background:t.accentLight, border:`1px solid ${dark?"#3d4f8c":"#c7d2fe"}`,
              color:t.accent, fontSize:14, fontWeight:700, textAlign:"left",
              fontFamily:"inherit", display:"flex", alignItems:"flex-start", gap:12
            }}>
              <span style={{ fontSize:22, lineHeight:1 }}>💾</span>
              <div>
                <div style={{ marginBottom:3 }}>Conservar cursos</div>
                <div style={{ fontSize:12, fontWeight:500, color:t.textSub }}>
                  Edita el nombre o la fecha sin perder el progreso
                </div>
              </div>
            </button>
            <button onClick={() => setMode("delete")} style={{
              padding:"16px 18px", borderRadius:11, cursor:"pointer",
              background:t.dangerBg, border:"1px solid rgba(239,68,68,.25)",
              color:"#ef4444", fontSize:14, fontWeight:700, textAlign:"left",
              fontFamily:"inherit", display:"flex", alignItems:"flex-start", gap:12
            }}>
              <span style={{ fontSize:22, lineHeight:1 }}>🗑️</span>
              <div>
                <div style={{ marginBottom:3 }}>Eliminar cursos</div>
                <div style={{ fontSize:12, fontWeight:500, color:t.textSub }}>
                  Borrar todo el progreso y comenzar desde cero
                </div>
              </div>
            </button>
          </div>
        )}

        {mode === "keep" && (
          <div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:t.textSub, marginBottom:7, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Nombre del examen
              </label>
              {inp(name, setName)}
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:t.textSub, marginBottom:7, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Fecha del examen
              </label>
              {inp(date, setDate, "date")}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setMode(null)} style={{
                flex:1, padding:"11px", background:dark?"#1f2937":"#f3f4f6",
                border:"none", borderRadius:9, color:t.textSub, fontSize:14,
                cursor:"pointer", fontFamily:"inherit"
              }}>← Atrás</button>
              <button onClick={() => { onUpdate({ ...exam, name, date }); onClose(); }} style={{
                flex:2, padding:"11px", background:"#6366f1", border:"none",
                borderRadius:9, color:"#fff", fontSize:14, fontWeight:800,
                cursor:"pointer", fontFamily:"inherit"
              }}>Guardar cambios</button>
            </div>
          </div>
        )}

        {mode === "delete" && (
          <div>
            <div style={{
              padding:"16px", borderRadius:11, marginBottom:22,
              background:t.dangerBg, border:"1px solid rgba(239,68,68,.2)"
            }}>
              <p style={{ margin:0, color:"#ef4444", fontSize:13, lineHeight:1.5 }}>
                ⚠️ Se eliminarán todos los cursos y temas de <strong>{exam.name}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setMode(null)} style={{
                flex:1, padding:"11px", background:dark?"#1f2937":"#f3f4f6",
                border:"none", borderRadius:9, color:t.textSub, fontSize:14,
                cursor:"pointer", fontFamily:"inherit"
              }}>Cancelar</button>
              <button onClick={() => { onDeleteCourses(); onClose(); }} style={{
                flex:2, padding:"11px", background:"#ef4444", border:"none",
                borderRadius:9, color:"#fff", fontSize:14, fontWeight:800,
                cursor:"pointer", fontFamily:"inherit"
              }}>Eliminar todo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── APP ─────────────────────────────────────────────────────── */
export default function App() {
  const dark = useDark();
  const t = getT(dark);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({ exams:[], currentId:null });
  const [view, setView] = useState("dashboard");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadData().then(d => { if (d) setState(d); setLoading(false); });
  }, []);

  useEffect(() => { if (!loading) saveData(state); }, [state, loading]);

  const exam = state.exams.find(e => e.id === state.currentId);

  const handleStart = (name, date) => {
    const e = { id:uid(), name, date, courses:[] };
    setState({ exams:[e], currentId:e.id });
  };
  const handleSelect = (id) => setState(s => ({ ...s, currentId:id }));
  const handleAddExam = (name, date) => {
    const e = { id:uid(), name, date, courses:[] };
    setState(s => ({ exams:[...s.exams, e], currentId:e.id }));
  };
  const handleUpdateExam = (updated) =>
    setState(s => ({ ...s, exams:s.exams.map(e => e.id===updated.id ? updated : e) }));
  const handleDeleteCourses = () =>
    setState(s => ({ ...s, exams:s.exams.map(e => e.id===state.currentId ? {...e,courses:[]} : e) }));

  if (loading) return (
    <div style={{ minHeight:"100vh", background:t.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:t.textSub, fontSize:14 }}>Cargando...</div>
    </div>
  );

  if (!exam) return <Login dark={dark} t={t} onStart={handleStart} />;

  return (
    <div style={{
      display:"flex", position:"relative", minHeight:"100vh",
      background:t.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'
    }}>
      <Sidebar
        exams={state.exams}
        currentId={state.currentId}
        onSelect={handleSelect}
        onAddExam={handleAddExam}
        onSettings={() => setShowSettings(true)}
      />

      <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:"100vh", overflow:"hidden" }}>
        {/* Top nav */}
        <div style={{
          height:52, borderBottom:`1px solid ${t.border}`,
          background:t.surface,
          display:"flex", alignItems:"center", paddingLeft:36, gap:4,
          flexShrink:0
        }}>
          {[["dashboard","Inicio"],["courses","Cursos"]].map(([v,lbl]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:"6px 18px", borderRadius:8, border:"none", cursor:"pointer",
              background: view===v ? t.accentLight : "transparent",
              color: view===v ? t.accent : t.textSub,
              fontSize:13, fontWeight: view===v ? 800 : 500,
              fontFamily:"inherit", transition:"all 0.12s"
            }}>{lbl}</button>
          ))}

          <div style={{ marginLeft:"auto", paddingRight:32, fontSize:12, color:t.textFaint }}>
            {daysBetween(exam.date)}d · {weeksBetween(exam.date)} sem. restantes
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {view === "dashboard"
            ? <Dashboard exam={exam} t={t} dark={dark} />
            : <Courses exam={exam} t={t} dark={dark} onUpdateExam={handleUpdateExam} />
          }
        </div>
      </div>

      {showSettings && (
        <Settings
          exam={exam} t={t} dark={dark}
          onClose={() => setShowSettings(false)}
          onUpdate={handleUpdateExam}
          onDeleteCourses={handleDeleteCourses}
        />
      )}
    </div>
  );
}
