# Classroom Attendance

A live classroom attendance display. An instructor signs in, starts a session, students scan the projected QR code and enter their names, and the attendance list updates automatically. Renewing starts a fresh session while preserving prior rosters in the instructor-only history archive.

The newest session is the shared active session stored in D1. Opening the Site from another browser, device, or signed-in account loads that same session and roster. Every signed-in viewer can renew the live roster and review the shared history; destructive deletion remains limited to the account that created each session.

The source is maintained in `tjcha1213/dataviz`. Production uses a hosted Worker and D1 database because GitHub Pages cannot accept or synchronize student check-ins.

## Google Sheets sync

The app can mirror check-ins to a Google Sheet while keeping D1 as the source of truth. Each student check-in is upserted automatically, and instructors can manually replace a session's Sheet rows from the dashboard if a retry is needed. The bound script creates one tab per class date, named like `Mon 2026-11-02`.

1. Create or open the destination Google Sheet, then choose **Extensions → Apps Script**.
2. Paste `docs/google-sheets-apps-script.js` into the bound script.
3. In Apps Script, add a script property named `ATTENDANCE_WEBHOOK_SECRET` with a long random value.
4. Deploy the script as a Web app that executes as you and can be accessed by anyone with the URL.
5. Configure the Site runtime with:
   - `GOOGLE_SHEETS_URL`: the normal `https://docs.google.com/spreadsheets/...` URL.
   - `GOOGLE_SHEETS_WEBHOOK_URL`: the deployed `https://script.google.com/macros/s/.../exec` URL.
   - `GOOGLE_SHEETS_WEBHOOK_SECRET`: the same script property value, stored as a secret.

The webhook URL and secret are server-only and are never sent to the browser. If Sheets is unavailable, the D1 check-in still succeeds and **Sync now** can reconcile the whole session later.

Renewing first reconciles the complete current roster with Google Sheets. The Apps Script replaces rows only for that session ID and retains every other session's rows, so clearing the live roster never clears prior Sheet logs.
