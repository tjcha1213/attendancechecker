import { env } from "cloudflare:workers";

export type SheetCheckin = {
  name: string;
  nameKey: string;
  checkedInAt: string;
};

export type SheetSession = {
  id: string;
  course: string;
  classDate: string;
};

type SyncPayload =
  | {
      action: "upsertCheckin";
      session: SheetSession;
      checkin: SheetCheckin;
    }
  | {
      action: "replaceSession";
      session: SheetSession;
      checkins: SheetCheckin[];
    };

export function getGoogleSheetsConnection() {
  const webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  const sheetUrl = env.GOOGLE_SHEETS_URL?.trim();
  return {
    configured: Boolean(webhookUrl && secret),
    sheetUrl: isGoogleSheetsUrl(sheetUrl) ? sheetUrl : undefined,
  };
}

export async function sendGoogleSheetsSync(payload: SyncPayload) {
  const webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !secret) return { status: "not_configured" as const };

  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    return { status: "invalid_configuration" as const };
  }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com") {
    return { status: "invalid_configuration" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, secret, syncedAt: new Date().toISOString() }),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) return { status: "failed" as const };
    const result = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    return result?.ok ? { status: "success" as const } : { status: "failed" as const };
  } catch {
    return { status: "failed" as const };
  } finally {
    clearTimeout(timeout);
  }
}

function isGoogleSheetsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" && url.pathname.startsWith("/spreadsheets/");
  } catch {
    return false;
  }
}
