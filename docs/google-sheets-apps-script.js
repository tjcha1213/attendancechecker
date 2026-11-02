/* eslint-disable @typescript-eslint/no-unused-vars */

const HEADERS = [
  "Session ID",
  "Course",
  "Class date",
  "Student name",
  "Student key",
  "Checked in at",
  "Synced at",
];

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("ATTENDANCE_WEBHOOK_SECRET");
    if (!expectedSecret || payload.secret !== expectedSecret) return json({ ok: false, error: "Unauthorized" });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getAttendanceSheet(payload.session.classDate);
      if (payload.action === "upsertCheckin") upsertCheckin(sheet, payload);
      else if (payload.action === "replaceSession") replaceSession(sheet, payload);
      else return json({ ok: false, error: "Unknown action" });
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function getAttendanceSheet(classDate) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = tabNameForDate(classDate);
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#123d38").setFontColor("#ffffff");
  }
  return sheet;
}

function tabNameForDate(classDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) throw new Error("Invalid class date");
  const parts = classDate.split("-").map(Number);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay()];
  return `${day} ${classDate}`;
}

function upsertCheckin(sheet, payload) {
  const row = toRow(payload.session, payload.checkin, payload.syncedAt);
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (values[index][0] === payload.session.id && values[index][4] === payload.checkin.nameKey) {
      sheet.getRange(index + 1, 1, 1, HEADERS.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function replaceSession(sheet, payload) {
  const values = sheet.getDataRange().getValues();
  const retained = values.slice(1).filter((row) => row[0] !== payload.session.id);
  const replacement = payload.checkins.map((checkin) => toRow(payload.session, checkin, payload.syncedAt));
  const rows = [HEADERS].concat(retained, replacement);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#123d38").setFontColor("#ffffff");
}

function toRow(session, checkin, syncedAt) {
  return [session.id, session.course, session.classDate, checkin.name, checkin.nameKey, checkin.checkedInAt, syncedAt];
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
