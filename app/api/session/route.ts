import { asc, count, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { checkins, sessions } from "../../../db/schema";
import { sendGoogleSheetsSync } from "../../../lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id")?.trim();
  const active = request.nextUrl.searchParams.get("active") === "1";
  const db = getDb();

  if (active) {
    const session = await latestSession(db);
    if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });
    return NextResponse.json(await sessionResponse(db, session, user.userId), {
      headers: { "cache-control": "private, no-store" },
    });
  }

  if (!id) {
    const history = await db
      .select({
        id: sessions.id,
        course: sessions.course,
        classDate: sessions.classDate,
        createdAt: sessions.createdAt,
        ownerId: sessions.ownerId,
        attendanceCount: count(checkins.id),
      })
      .from(sessions)
      .leftJoin(checkins, eq(checkins.sessionId, sessions.id))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.createdAt));
    return NextResponse.json(history.map(({ ownerId, ...item }) => ({
      ...item,
      canManage: ownerId === user.userId,
    })), { headers: { "cache-control": "private, no-store" } });
  }

  const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(await sessionResponse(db, session, user.userId), {
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { course?: string; renew?: boolean };
  const course = body.course?.trim().replace(/\s+/g, " ");
  if (!course || course.length > 80) return NextResponse.json({ error: "Valid course name required" }, { status: 400 });

  const db = getDb();
  const activeSession = await latestSession(db);
  if (!body.renew && activeSession) {
    return NextResponse.json(await sessionResponse(db, activeSession, user.userId), {
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (body.renew && activeSession) {
    const rows = await db
      .select({ name: checkins.name, nameKey: checkins.nameKey, checkedInAt: checkins.checkedInAt })
      .from(checkins)
      .where(eq(checkins.sessionId, activeSession.id))
      .orderBy(asc(checkins.checkedInAt));
    const sheetSync = await sendGoogleSheetsSync({
      action: "replaceSession",
      session: activeSession,
      checkins: rows,
    });
    if (sheetSync.status !== "success" && sheetSync.status !== "not_configured") {
      return NextResponse.json({
        error: "Google Sheets did not confirm the current roster. No new session was started.",
      }, { status: 502 });
    }
  }

  const now = new Date();
  const session = {
    id: crypto.randomUUID(),
    ownerId: user.userId,
    course,
    classDate: now.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
  };
  await db.insert(sessions).values(session);
  return NextResponse.json({
    id: session.id,
    course: session.course,
    classDate: session.classDate,
    createdAt: session.createdAt,
    canManage: true,
    checkins: [],
  }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Session ID is required" }, { status: 400 });

  const db = getDb();
  const session = await db.select({ id: sessions.id, ownerId: sessions.ownerId })
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.ownerId !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(checkins).where(eq(checkins.sessionId, id));
  await db.delete(sessions).where(eq(sessions.id, id));
  return NextResponse.json({ deleted: true, id });
}

type AttendanceDb = ReturnType<typeof getDb>;
type StoredSession = typeof sessions.$inferSelect;

async function latestSession(db: AttendanceDb) {
  return db.select().from(sessions).orderBy(desc(sessions.createdAt)).get();
}

async function sessionResponse(db: AttendanceDb, session: StoredSession, userId: string) {
  const names = await db
    .select({ id: checkins.id, name: checkins.name, checkedInAt: checkins.checkedInAt })
    .from(checkins)
    .where(eq(checkins.sessionId, session.id))
    .orderBy(asc(checkins.checkedInAt));

  return {
    id: session.id,
    course: session.course,
    classDate: session.classDate,
    createdAt: session.createdAt,
    canManage: session.ownerId === userId,
    checkins: names,
  };
}
