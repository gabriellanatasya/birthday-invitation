// ============================================================
//  Code.gs  —  Google Apps Script
//  Paste this entire file into your Apps Script editor.
//
//  This script powers two things:
//    doGet()   → looks up a guest by name, returns their max pax
//    doPost()  → receives an RSVP submission, writes it to the sheet
//
//  SHEET SETUP (see README.md for full instructions):
//
//  Sheet 1 — "Guests"   (your master guest list)
//  ┌─────────────────┬─────────┬────────────────┐
//  │ A: Name         │ B: MaxPax│ C: InviteLink  │
//  ├─────────────────┼─────────┼────────────────┤
//  │ John            │ 2       │ (auto-filled)  │
//  │ Sarah           │ 4       │ (auto-filled)  │
//  │ Budi Keluarga   │ 6       │ (auto-filled)  │
//  └─────────────────┴─────────┴────────────────┘
//
//  Sheet 2 — "RSVPs"   (responses written here automatically)
//  ┌────────────┬──────────────┬────────┬───────┬──────────┬──────────────┐
//  │ A: Timestamp│ B: GuestName │ C: Pax │ D: Phone│ E: Status│ F: InvitedAs│
//  └────────────┴──────────────┴────────┴───────┴──────────┴──────────────┘
//
// ============================================================


// ── CONFIGURATION ─────────────────────────────────────────
// The URL of your invitation website (used to build invite links)
var SITE_URL = 'https://yourinvite.com'; // ← CHANGE to your real domain


// ── doGet: Guest lookup ────────────────────────────────────
// Called by the invitation page on load to fetch max pax for the guest.
// URL param: ?name=John
function doGet(e) {
  // Always add CORS headers so the browser allows the fetch
  var output = buildCorsOutput();

  try {
    var name = (e.parameter.name || '').trim();

    if (!name) {
      return buildJson({ found: false, maxPax: 1, error: 'No name provided' });
    }

    var result = findGuest(name);
    return buildJson(result);

  } catch (err) {
    return buildJson({ found: false, maxPax: 1, error: err.message });
  }
}


// ── doPost: RSVP submission ────────────────────────────────
// Called when a guest submits the RSVP form.
// Body (JSON): { invitedAs, name, pax, phone, attending }
function doPost(e) {
  try {
    var data     = JSON.parse(e.postData.contents);
    var ss       = SpreadsheetApp.getActiveSpreadsheet();
    var sheet    = ss.getSheetByName('RSVPs');

    // Create the RSVPs sheet if it doesn't exist yet
    if (!sheet) {
      sheet = ss.insertSheet('RSVPs');
      sheet.appendRow(['Timestamp', 'Invited As', 'Name Confirmed', 'Pax', 'Phone', 'Attending']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    }

    // Validate pax against the guest's allowed max
    var guestRecord = findGuest(data.invitedAs || '');
    var submittedPax = parseInt(data.pax) || 1;

    // Silently cap at max — never trust client-side limits
    var finalPax = Math.min(submittedPax, guestRecord.maxPax);

    sheet.appendRow([
      new Date(),                          // A: Timestamp
      data.invitedAs   || '',              // B: The name from the URL (?to=...)
      data.name        || '',              // C: Name they typed in the form
      finalPax,                            // D: Pax (server-validated)
      data.phone       || '',              // E: Phone / WhatsApp
      data.attending   || 'yes',          // F: yes / no
    ]);

    return buildJson({ result: 'success', pax: finalPax });

  } catch (err) {
    return buildJson({ result: 'error', error: err.message });
  }
}


// ── HELPER: Find a guest in the "Guests" sheet ─────────────
// Returns { found, name, maxPax }
function findGuest(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Guests');

  if (!sheet) {
    return { found: false, maxPax: 1, error: '"Guests" sheet not found' };
  }

  var rows      = sheet.getDataRange().getValues();
  var nameLower = name.toLowerCase();

  // Row 0 is the header — start from row 1
  for (var i = 1; i < rows.length; i++) {
    var rowName = String(rows[i][0]).trim().toLowerCase();

    if (rowName === nameLower) {
      return {
        found:  true,
        name:   rows[i][0],          // original casing from sheet
        maxPax: parseInt(rows[i][1]) || 1,
      };
    }
  }

  // Guest not found — default to 1 pax
  return { found: false, maxPax: 1 };
}


// ── HELPER: Build a JSON response with CORS headers ─────────
function buildJson(obj) {
  var json = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return json;
}


// ── UTILITY: Auto-generate invite links in the Guests sheet ─
// Run this function manually from the Apps Script editor
// (Run → generateInviteLinks) to fill column C with links.
function generateInviteLinks() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Guests');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('"Guests" sheet not found.');
    return;
  }

  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0]).trim();
    if (!name) continue;

    // Encode the name for a URL, e.g. "Budi Keluarga" → "Budi%20Keluarga"
    var link = SITE_URL + '/?to=' + encodeURIComponent(name);
    sheet.getRange(i + 1, 3).setValue(link); // Column C
  }

  SpreadsheetApp.getUi().alert('Invite links generated in column C!');
}
