# Jira Time Tracker

A Chrome extension to track the time you spend on your Jira tickets. You start and stop the timer yourself, add notes while you work, and review your day in a dashboard.

All data stays in your browser (`chrome.storage.local`). Nothing is sent to Jira or to any server.

## Features

- Manual start / stop timer, with a red badge on the icon while it runs
- Ticket key and title are read from the Jira page (the `H1` and the last breadcrumb item)
- Timestamped notes while a timer is running
- Dashboard with a day view, a timeline, daily target, missing time and untracked gaps
- Manual sessions for non-Jira work or old tickets, on any date
- Lunch break button (1 hour by default, you choose start and end), excluded from worked time
- Status change sync from Jira's History tab, and time spent in a status (e.g. In Test) added to sessions in one click
- Edit or delete any past session (times, title, ticket, notes)
- Statistics: week, month, average per active day, longest session, top tickets
- CSV export, plus an automatic JSON backup before clearing the history

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension to the toolbar for quick access.

After pulling an update, click the reload icon on the extension card.

## How to use

### Track a ticket

1. Open a Jira ticket in the active tab.
2. Click the extension icon. The ticket key and title are detected.
3. Click **▶ Start**.
4. Add notes whenever you want with **Add note**. Each note keeps its time.
5. Click **■ Stop** to save the session. A note typed but not added is saved on stop.

Only one timer can run at a time. The ticket must be displayed in the active tab when you click Start.

### Dashboard

Click **📊 Dashboard** in the popup.

- **Day navigation**: `◀ ▶`, the date picker, or **Today**.
- **Target and work window**: set your daily target (default 7.5 h) and your working hours (default 08:00 to 18:00).
- **Timeline**: blue is Jira, purple is manual, orange is the lunch break, red is the running timer.
- **Untracked gaps**: periods of 5 minutes or more without a session. Click a gap to fill the manual form with its date and times.

### Add a session manually

Use the form **Add a session manually** in the dashboard.

1. Enter a description, an optional ticket key, the date, the start and the end.
2. Optionally add a note, then click **Add**.

This covers non-Jira work and old tickets you forgot to track. Known ticket keys are suggested, and the title is filled in for you.

### Lunch break

1. Click **🍽 Pause déj (1 h)**.
2. Choose the start time. The end moves to start + 1 h, and you can change it.
3. Click **Add**.

The break appears in orange, fills the timeline so it is not reported as a gap, and is not counted as work.

### Status changes and time in a status

1. Set your name in **⚙ Config**, exactly as shown in Jira (for example `Mohamed Mediouni`). This keeps only your own changes. If it is empty, everyone's changes are shown.
2. Open a ticket in Jira and click **↻ Synchroniser les statuts** in the popup. It reads the status changes from the History tab, and opens that tab for you if needed. A silent sync also runs on Start and Stop when the History tab is already open.
3. In the dashboard, **Status changes of the day** lists each change (time, ticket, `from → to`).
4. **Time spent in a status** shows the period from entering a tracked status to leaving it, for example `In Test: 09:29 → 11:25` (1h56). The change that ends the period can be made by anyone.
5. Click **＋ Ajouter aux sessions** to create a session from that period. It appears in **Sessions of the day**, where you can still edit it. A period already added shows `✔ déjà ajouté`.

Details:
- Tracked statuses are set in **⚙ Config** under **Statuts à chronométrer** (comma separated, default `In Test`, empty means all statuses).
- A period still open shows no button. A period that spans several days must be added by hand, to avoid a very long session by mistake.
- Only the data read from the History tab is used, so a ticket that was never synced shows nothing.

### Edit or delete a session

In **Sessions of the day**, click ✎ to change the ticket, title, date, start, end and notes (edit, remove or add). Click ✕ to delete a session. A running session cannot be edited until you stop it.

### Export, clear and restore

- **Export CSV** (popup or dashboard) downloads `jira-time.csv`.
- **Vider** (popup) asks you to type `VIDER`. It downloads a `jira-time-backup-YYYY-MM-DD.json` file and keeps a copy inside the extension.
- **Restaurer** (popup, shown after a clear) puts the saved sessions back without duplicates.

## CSV columns

`ticket, titre, date, debut, debut_heure, fin, fin_heure, duree, notes`

- `debut` and `fin` are ISO timestamps, `debut_heure` and `fin_heure` are local `HH:mm`.
- Each note is written as `[YYYY-MM-DD HH:mm] text`, separated by ` | `.
- Non-Jira sessions without a ticket use `HORS-JIRA`, lunch breaks use `PAUSE`.

## Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `popup.html`, `popup.js`, `popup.css` | Timer popup |
| `dashboard.html`, `dashboard.js`, `dashboard.css` | Dashboard page |
| `common.js` | Shared helpers and CSV / JSON export |
| `options.html`, `options.js` | Configuration page (your name, tracked statuses) |
| `background.js` | Badge while a timer is running |

## Notes

- Status changes are read from the Jira History tab using its `data-testid` attributes, so a Jira update can break the sync.
- Jira may change its page markup. If the title is not detected, the ticket key is still read from the URL.
- Permissions used: `storage`, `activeTab` and `scripting`.
