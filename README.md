# Kasuri – Restaurant staff & salary manager

A Windows desktop app for a restaurant owner to track staff attendance and calculate monthly salaries automatically, including leave cuts, advances, bonuses and overtime. Everything is stored on the owner's own computer, so no internet or account is needed.

## Features

- **Daily attendance**: everyone is present by default, so you only tap the people who are absent, on a half day, on paid leave or on a week off. You can also record check-in/out times, overtime hours and a note.
- **Monthly timesheet**: a grid of everyone × every day. Pick a mark, then click the boxes to fill them. It shows leaves used against leaves allowed and highlights extra leaves. You can export it to CSV/Excel.
- **Automatic salary**: per person per month:
  `salary − (extra leaves × one day's pay) + overtime + bonus − advances − other deductions`
  - Absent = 1 leave, half day = ½ leave. Paid leave and week offs are never cut.
  - A person who joins mid-month is paid from their joining date, and their leave allowance is pro-rated.
  - One day's pay is either *salary ÷ days in that month* or *salary ÷ 30* (you choose this in Settings).
  - Optional: pay extra for allowed leaves that weren't taken.
- **Advances, bonuses & deductions**: they're adjusted in that month's salary automatically.
- **Mark as paid**: records the date and method and saves a snapshot of the calculation, so later edits don't change past payments.
- **Salary slips**: printable, or saved as a PDF from the print dialog.
- **Staff profiles**: a calendar view, advance history and payment history for each person.
- **Automatic daily backup**: saved to a folder you choose (e.g. Google Drive / OneDrive). The last 60 days are kept, and you can restore from any of them.

## Where the data lives

The data is in a single SQLite file:

```
C:\Users\<name>\AppData\Roaming\in.kasuri.desktop\kasuri.db
```

The exact path is also shown under **Settings → Backup**. Uninstalling or updating the app does **not** delete it.

## Building the Windows installer

Do this once on the Windows PC you build on:

1. Install **Node.js 22 or newer**: https://nodejs.org
2. Install **Rust**: https://rustup.rs (accept the defaults).
3. Install **Microsoft C++ Build Tools**: https://visualstudio.microsoft.com/visual-cpp-build-tools/. In the installer, tick **"Desktop development with C++"**.
4. WebView2 already ships with Windows 10 and 11, so there's nothing to install for it.

Then, in the project folder:

```bash
npm install
```

```bash
npm run package
```

The first build takes several minutes while Rust compiles everything. Later builds are much faster. The installer is created at:

```
src-tauri\target\release\bundle\nsis\Kasuri_1.0.0_x64-setup.exe
```

Copy that `.exe` to the restaurant's computer and run it. Windows may say *"Windows protected your PC"* because the installer isn't code-signed. Click **More info → Run anyway**. The installer doesn't need admin rights.

**Updating:** change `version` in `src-tauri/tauri.conf.json`, build again, and run the new installer on top of the old one. The data is kept.

## Development

| Command | What it does |
| --- | --- |
| `npm run app` | Runs the real desktop app with hot reload (needs Rust) |
| `npm run dev` | Runs the app in a normal browser at http://localhost:5173 using `data/kasuri.db`. Doesn't need Rust; good for working on screens |
| `npm run demo` | Fills `data/kasuri.db` with sample staff for `npm run dev` |
| `npm test` | Unit tests for the salary calculation |
| `npm run package` | Builds the Windows installer |

| Folder | What's inside |
| --- | --- |
| `shared/payroll.ts` | The salary calculation (pure function, tested in `payroll.test.ts`) |
| `shared/schema.ts` | Database tables |
| `src/api.ts` | All data operations (SQL), used by the pages |
| `src/db.ts` | Opens the database: the Tauri SQL plugin in the desktop app, or a dev-only bridge in the browser |
| `src/desktop.ts` | Dialogs, saving files and automatic backups |
| `src/pages/` | One file per screen (React + Tailwind) |
| `src-tauri/` | The Tauri (Rust) desktop shell: window, installer settings, file-writing commands |
