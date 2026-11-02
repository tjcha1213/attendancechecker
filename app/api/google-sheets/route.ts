import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { checkins, sessions } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getGoogleSheetsConnection, sendGoogleSheetsSync } from "../../../lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(getGoogleSheetsConnection(), { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) return NextResponse.json({ error: "Session ID is required" }, { status: 400 });

  const db = getDb();
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.ownerId !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connection = getGoogleSheetsConnection();
  if (!connection.configured) {
    return NextResponse.json({ error: "Google Sheets is not configured" }, { status: 503 });
  }

  const rows = await db
    .select({ name: checkins.name, nameKey: checkins.nameKey, checkedInAt: checkins.checkedInAt })
    .from(checkins)
    .where(eq(checkins.sessionId, sessionId))
    .orderBy(asc(checkins.checkedInAt));
  const result = await sendGoogleSheetsSync({ action: "replaceSession", session, checkins: rows });
  if (result.status !== "success") {
    return NextResponse.json({ error: "Google Sheets did not confirm the sync" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, synced: rows.length, sheetUrl: connection.sheetUrl });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}
