import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { checkins, sessions } from "../../../db/schema";
import { sendGoogleSheetsSync } from "../../../lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session")?.trim();
  if (!sessionId) return NextResponse.json({ error: "Session ID is required" }, { status: 400 });

  const session = await getDb()
    .select({ id: sessions.id, course: sessions.course, classDate: sessions.classDate })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; name?: string };
  const sessionId = body.sessionId?.trim();
  const name = body.name?.trim().replace(/\s+/g, " ");
  if (!sessionId || !name || name.length > 80) return NextResponse.json({ error: "Session and name are required" }, { status: 400 });

  const db = getDb();
  const session = await db
    .select({ id: sessions.id, course: sessions.course, classDate: sessions.classDate })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const checkedInAt = new Date().toISOString();
  const nameKey = name.toLocaleLowerCase();
  await db.insert(checkins)
    .values({ sessionId, name, nameKey, checkedInAt })
    .onConflictDoUpdate({
      target: [checkins.sessionId, checkins.nameKey],
      set: { name, checkedInAt },
    });
  const sheetSync = await sendGoogleSheetsSync({
    action: "upsertCheckin",
    session,
    checkin: { name, nameKey, checkedInAt },
  });
  return NextResponse.json({ ok: true, name, checkedInAt, sheetSync: sheetSync.status });
}
