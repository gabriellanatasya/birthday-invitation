# Google Apps Script Setup Guide

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Rename it **"Birthday Invitation"** (or anything you like)

### Sheet 1: "Guests"
Rename the first tab to **Guests** and add these headers in row 1:

| A: Name         | B: MaxPax | C: InviteLink |
|-----------------|-----------|---------------|
| John            | 2         |               |
| Sarah           | 4         |               |
| Budi Keluarga   | 6         |               |

- **Name** — must match exactly what you put in the URL `?to=John`
- **MaxPax** — maximum number of guests this person can bring (including themselves)
- **InviteLink** — leave blank; it will be auto-filled by a script

### Sheet 2: "RSVPs"
Click the **+** button to add a second sheet. Rename it **RSVPs**.  
Leave it empty — the script will create the headers automatically on first submission.

---

## Step 2 — Add the Apps Script

1. In your Google Sheet, click **Extensions → Apps Script**
2. Delete all the default code in the editor
3. Copy and paste the entire contents of **Code.gs** into the editor
4. At the top of Code.gs, change `SITE_URL` to your real domain:
   ```javascript
   var SITE_URL = 'https://yourinvite.com'; // ← your domain
   ```
5. Click **Save** (Ctrl+S / Cmd+S)

---

## Step 3 — Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon ⚙ next to "Type" and select **Web app**
3. Fill in:
   - **Description**: Birthday Invitation API
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**
5. Click **Authorize access** and follow the prompts
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## Step 4 — Connect to the invitation website

Open `js/main.js` and paste your Web App URL here:

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID_HERE/exec';
```

---

## Step 5 — Generate invite links

1. In the Apps Script editor, select the function **generateInviteLinks** from the dropdown
2. Click **Run**
3. Go back to your sheet — column C of the "Guests" tab will now have everyone's personalised link

Copy each link and send it to the right person:
```
https://yourinvite.com/?to=John
https://yourinvite.com/?to=Sarah
https://yourinvite.com/?to=Budi%20Keluarga
```

---

## How the full flow works

```
Guest opens link:  yourinvite.com/?to=John
        ↓
Page reads ?to=John from URL
        ↓
Fetches Apps Script: GET ?name=John
        ↓
Apps Script looks up "John" in Guests sheet
Returns: { found: true, maxPax: 2 }
        ↓
Page shows "John" on cover
RSVP form pax input is locked to max 2
        ↓
Guest submits RSVP
        ↓
POST to Apps Script with { invitedAs, name, pax, phone, attending }
        ↓
Apps Script validates pax ≤ maxPax (server-side!)
Writes row to RSVPs sheet
        ↓
Page shows success message
```

---

## Re-deploying after changes

If you edit Code.gs later, you must create a **new deployment** (not update the existing one) for changes to take effect on `doGet`/`doPost`. Update `APPS_SCRIPT_URL` in `main.js` if the URL changes.