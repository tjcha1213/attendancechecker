"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type Checkin = { id: number; name: string; checkedInAt: string };
type Session = {
  id: string;
  course: string;
  classDate: string;
  createdAt: string;
  canManage: boolean;
  checkins: Checkin[];
};

const MEMES = [
  {
    src: "/data-visualization-meme.png",
    alt: "A professor presents a confusing 3D pie chart while a student points to a clear bar chart",
    setup: "When the 3D pie chart looks “impressive”…",
    punchline: "…but a bar chart tells the story better.",
    lesson: "Lesson: position and length are easier to compare than angles and area.",
  },
  {
    src: "/data-visualization-meme-axis.png",
    alt: "A presenter exaggerates a bar chart while a student uses a magnifying glass to reveal the small difference",
    setup: "When the axis starts wherever the drama needs…",
    punchline: "…zoom out before the chart fools you.",
    lesson: "Lesson: bar charts usually need a zero baseline for honest comparisons.",
  },
  {
    src: "/data-visualization-meme-correlation.png",
    alt: "A data detective arrests an ice cream cone while a student identifies sunshine as a shared cause",
    setup: "When two lines rise together…",
    punchline: "…and correlation puts the ice cream in handcuffs.",
    lesson: "Lesson: a shared trend does not prove that one variable caused the other.",
  },
  {
    src: "/data-visualization-meme-clutter.png",
    alt: "A presenter is tangled in chart lines while a student highlights one important trend",
    setup: "When every data series demands the spotlight…",
    punchline: "…highlight the one that answers the question.",
    lesson: "Lesson: reduce clutter and guide attention with emphasis.",
  },
] as const;

type HistoryItem = {
  id: string;
  course: string;
  classDate: string;
  createdAt: string;
  attendanceCount: number;
};

type SheetConnection = { configured: boolean; sheetUrl?: string };

export default function AttendanceDashboard({ instructorName }: { instructorName: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [course, setCourse] = useState("Course Attendance");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<Session | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [memeIndex, setMemeIndex] = useState(0);
  const [sheetConnection, setSheetConnection] = useState<SheetConnection>({ configured: false });
  const [sheetSyncingId, setSheetSyncingId] = useState("");
  const [sheetMessage, setSheetMessage] = useState("");

  const loadActiveSession = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/session?active=1", { cache: "no-store" });
      if (response.status === 404) {
        setSession(null);
        return;
      }
      if (!response.ok) throw new Error("Unable to load active session");
      const data = (await response.json()) as Session;
      setSession(data);
      setCourse(data.course);
      setError("");
    } catch {
      if (!quiet) setError("Could not load the shared attendance session. Please refresh to try again.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    loadActiveSession();
    return () => window.clearInterval(timer);
  }, [loadActiveSession]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => loadActiveSession(true), 2500);
    return () => window.clearInterval(timer);
  }, [loadActiveSession, session?.id]);

  useEffect(() => {
    if (!session) return;
    const checkinUrl = `${window.location.origin}/check-in?session=${encodeURIComponent(session.id)}`;
    QRCode.toDataURL(checkinUrl, {
      width: 1200,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#123d38", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setError("The QR code could not be generated. Refresh the page to try again."));
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/google-sheets", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<SheetConnection> : { configured: false })
      .then(setSheetConnection)
      .catch(() => setSheetConnection({ configured: false }));
  }, [session?.id]);

  async function startSession(event: React.FormEvent) {
    event.preventDefault();
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course }),
      });
      if (!response.ok) throw new Error("Unable to start session");
      const data = (await response.json()) as Session;
      const firstMemeIndex = Math.floor(Math.random() * MEMES.length);
      setMemeIndex(firstMemeIndex);
      setCourse(data.course);
      setSession(data);
    } catch {
      setError("Could not start attendance. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function renewSession() {
    if (!session) return;
    if (!window.confirm("Start a new attendance session? The current roster will remain available in Session history.")) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: session.course, renew: true }),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Session;
      const nextMemeIndex = (memeIndex + 1) % MEMES.length;
      setMemeIndex(nextMemeIndex);
      setSession(data);
      setQrDataUrl("");
      setHistory([]);
    } catch {
      setError("Could not renew attendance. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryDetail(null);
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setHistory(await response.json());
    } catch {
      setError("Could not load session history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function viewHistorySession(id: string) {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/session?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setHistoryDetail(await response.json());
    } catch {
      setError("Could not load that attendance session.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteHistorySession(target: HistoryItem | Session) {
    const attendanceCount = "attendanceCount" in target ? target.attendanceCount : target.checkins.length;
    const warning = attendanceCount === 1 ? "1 attendance record" : `${attendanceCount} attendance records`;
    if (!window.confirm(`Permanently delete ${target.course} from ${new Date(target.createdAt).toLocaleString()} and ${warning}? This cannot be undone.`)) return;

    setDeletingId(target.id);
    setError("");
    try {
      const response = await fetch(`/api/session?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setHistory((items) => items.filter((item) => item.id !== target.id));
      if (historyDetail?.id === target.id) setHistoryDetail(null);
      if (session?.id === target.id) {
        setLoading(true);
        await loadActiveSession();
      }
    } catch {
      setError("Could not delete that attendance session. Please try again.");
    } finally {
      setDeletingId("");
    }
  }

  async function syncToGoogleSheets(targetSession = session) {
    if (!targetSession || !sheetConnection.configured) return;
    setSheetSyncingId(targetSession.id);
    setSheetMessage("");
    setError("");
    try {
      const response = await fetch("/api/google-sheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: targetSession.id }),
      });
      const result = (await response.json().catch(() => ({}))) as { synced?: number; error?: string };
      if (!response.ok) throw new Error(result.error);
      setSheetMessage(`${result.synced ?? 0} attendance ${result.synced === 1 ? "record" : "records"} synced to Google Sheets.`);
    } catch {
      setError("Google Sheets did not confirm the sync. Your attendance is still safely stored here; try Sync now again.");
    } finally {
      setSheetSyncingId("");
    }
  }

  function downloadAttendance(targetSession = session) {
    if (!targetSession || targetSession.checkins.length === 0) return;

    const csvCell = (value: string) => {
      let safe = value.replace(/[\r\n]+/g, " ").trim();
      if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const rows = [
      ["Course", targetSession.course],
      ["Class date", targetSession.classDate],
      ["Exported at", new Date().toLocaleString()],
      [],
      ["Student name", "Check-in time"],
      ...targetSession.checkins.map((checkin) => [
        checkin.name,
        new Date(checkin.checkedInAt).toLocaleString(),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const courseSlug = targetSession.course
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "class";
    link.href = url;
    link.download = `${courseSlug}-attendance-${targetSession.classDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now),
    [now.toDateString()]
  );
  const formattedTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(now),
    [now]
  );
  const activeMeme = MEMES[memeIndex];

  if (loading) return <main className="loading-screen">Preparing attendance…</main>;

  if (!session) {
    return (
      <main className="setup-screen">
        <form className="setup-card" onSubmit={startSession}>
          <p className="eyebrow">New attendance session</p>
          <h1>Ready for class?</h1>
          <p>Enter the course name. The projector view and student QR code will be created automatically.</p>
          <label htmlFor="course">Course name</label>
          <input
            id="course"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
          <button disabled={starting}>{starting ? "Starting…" : "Start attendance"}</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="attendance-screen">
      <header className="class-header">
        <div>
          <p className="eyebrow">Live attendance</p>
          <h1>{session.course}</h1>
        </div>
        <div className="header-tools">
          <div className="date-time" aria-label={`${formattedDate}, ${formattedTime}`}>
            <strong>{formattedDate}</strong>
            <span>{formattedTime}</span>
          </div>
          {session.canManage && (
            <div className="session-actions">
              <button type="button" onClick={openHistory}>History</button>
              <button type="button" onClick={renewSession} disabled={starting}>{starting ? "Renewing…" : "↻ Renew"}</button>
            </div>
          )}
        </div>
      </header>

      <section className="qr-section" aria-label="Student check-in and data visualization tip">
        <div className="visual-grid">
          <div className="visual-item">
            <div className="qr-frame">
              {qrDataUrl ? <img src={qrDataUrl} alt="QR code for student attendance check-in" /> : <div className="qr-loading">Generating QR…</div>}
            </div>
            <p>Scan to sign in</p>
          </div>
          <figure className="meme-card">
            <img key={activeMeme.src} src={activeMeme.src} alt={activeMeme.alt} />
            <figcaption>
              <strong>{activeMeme.setup}</strong>
              <span>{activeMeme.punchline}</span>
              <small>{activeMeme.lesson}</small>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="roster" aria-labelledby="roster-title">
        <div className="roster-heading">
          <h2 id="roster-title">Signed in</h2>
          <div className="roster-actions">
            <span>{session.checkins.length} {session.checkins.length === 1 ? "student" : "students"}</span>
            {session.canManage && sheetConnection.configured && (
              <button
                className="sheet-button"
                type="button"
                onClick={() => syncToGoogleSheets()}
                disabled={sheetSyncingId === session.id}
                title="Reconcile this session with the connected Google Sheet"
              >
                {sheetSyncingId === session.id ? "Syncing…" : "↗ Sync now"}
              </button>
            )}
            {session.canManage && sheetConnection.sheetUrl && (
              <a className="sheet-link" href={sheetConnection.sheetUrl} target="_blank" rel="noreferrer">Open Sheet</a>
            )}
            <button
              className="download-button"
              type="button"
              onClick={downloadAttendance}
              disabled={session.checkins.length === 0}
              title={session.checkins.length === 0 ? "No attendance to download yet" : "Download attendance as CSV"}
            >
              <span aria-hidden="true">↓</span> Download CSV
            </button>
          </div>
        </div>
        {session.checkins.length ? (
          <ol className="name-list">
            {session.checkins.map((checkin) => (
              <li key={checkin.id}>
                <span className="initial">{checkin.name.charAt(0).toUpperCase()}</span>
                <strong>{checkin.name}</strong>
                <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(checkin.checkedInAt))}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-roster">Waiting for the first student to sign in…</p>
        )}
        {sheetMessage && <p className="sheet-message" role="status">✓ {sheetMessage}</p>}
      </section>
      {error && <p className="display-error" role="alert">{error}</p>}

      {historyOpen && (
        <div className="history-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setHistoryOpen(false);
        }}>
          <section className="history-panel" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <div className="history-header">
              <div>
                <p className="eyebrow">Instructor archive</p>
                <h2 id="history-title">Session history</h2>
                <p>Signed in as {instructorName}</p>
              </div>
              <button className="close-button" type="button" onClick={() => setHistoryOpen(false)} aria-label="Close session history">×</button>
            </div>

            {historyDetail ? (
              <div className="history-detail">
                <button className="back-button" type="button" onClick={() => setHistoryDetail(null)}>← All sessions</button>
                <div className="history-detail-title">
                  <div>
                    <h3>{historyDetail.course}</h3>
                    <p>{new Date(historyDetail.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="history-detail-actions">
                    {sheetConnection.configured && <button className="sheet-button" type="button" onClick={() => syncToGoogleSheets(historyDetail)} disabled={sheetSyncingId === historyDetail.id}>{sheetSyncingId === historyDetail.id ? "Syncing…" : "↗ Sync to Sheet"}</button>}
                    <button className="download-button" type="button" onClick={() => downloadAttendance(historyDetail)} disabled={historyDetail.checkins.length === 0}>↓ Download CSV</button>
                    <button className="delete-button" type="button" onClick={() => deleteHistorySession(historyDetail)} disabled={deletingId === historyDetail.id}>{deletingId === historyDetail.id ? "Deleting…" : "Delete session"}</button>
                  </div>
                </div>
                {historyDetail.checkins.length ? (
                  <ol className="history-names">
                    {historyDetail.checkins.map((checkin, index) => (
                      <li key={checkin.id}><span>{index + 1}</span><strong>{checkin.name}</strong><time>{new Date(checkin.checkedInAt).toLocaleString()}</time></li>
                    ))}
                  </ol>
                ) : <p className="empty-roster">No students signed in during this session.</p>}
              </div>
            ) : historyLoading ? (
              <p className="history-status">Loading sessions…</p>
            ) : history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <div className="history-row" key={item.id}>
                    <button className="history-view-button" type="button" onClick={() => viewHistorySession(item.id)}>
                      <span><strong>{item.course}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
                      <b>{item.attendanceCount} {item.attendanceCount === 1 ? "student" : "students"} →</b>
                    </button>
                    <button className="history-delete-button" type="button" onClick={() => deleteHistorySession(item)} disabled={deletingId === item.id} aria-label={`Delete ${item.course} session from ${new Date(item.createdAt).toLocaleString()}`} title="Delete session">{deletingId === item.id ? "…" : "Delete"}</button>
                  </div>
                ))}
              </div>
            ) : <p className="history-status">No previous sessions yet.</p>}
          </section>
        </div>
      )}
    </main>
  );
}
