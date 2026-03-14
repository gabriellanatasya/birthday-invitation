// ============================================================
//  Code.gs  —  Google Apps Script
//  Paste this entire file into your Apps Script editor.
//
//  This script powers:
//    doGet()           → guest lookup (max pax) OR fetch all wishes
//    doPost()          → RSVP submission OR new wish submission
//
//  SHEET SETUP:
//
//  Sheet 1 — "Guests"
//  ┌─────────────────┬──────────┬───────────────┐
//  │ A: Name         │ B: MaxPax│ C: InviteLink │
//  ├─────────────────┼──────────┼───────────────┤
//  │ John            │ 2        │ (auto-filled) │
//  │ Sarah           │ 4        │ (auto-filled) │
//  └─────────────────┴──────────┴───────────────┘
//
//  Sheet 2 — "RSVPs"  (auto-created on first submission)
//  ┌─────────────┬────────────┬────────────────┬─────┬───────┬──────────┐
//  │ A: Timestamp│ B: Invited │ C: Name Confirm│ D:Pax│ E:Phone│ F:Attend│
//  └─────────────┴────────────┴────────────────┴─────┴───────┴──────────┘
//
//  Sheet 3 — "Wishes"  (auto-created on first wish)
//  ┌─────────────┬──────────┬─────────────────────────────┐
//  │ A: Timestamp│ B: Name  │ C: Message                  │
//  └─────────────┴──────────┴─────────────────────────────┘
//
// ============================================================


// ── CONFIGURATION ──────────────────────────────────────────
var SITE_URL = 'https://yunis-birthday-invitation.vercel.app'; // ← your domain


// ── doGet ───────────────────────────────────────────────────
// Handles two actions via ?action= param:
//   ?action=guest&name=John   → look up guest max pax
//   ?action=wishes             → return all wishes (newest first)
//   (no action / default)      → same as action=guest for backwards compat
function doGet(e) {
  try {
    var action = (e.parameter.action || 'guest').trim();

    if (action === 'wishes') {
      return buildJson(getWishes());
    }

    // Default: guest lookup
    var name = (e.parameter.name || '').trim();
    if (!name) {
      return buildJson({ found: false, maxPax: 1, error: 'No name provided' });
    }
    return buildJson(findGuest(name));

  } catch (err) {
    return buildJson({ error: err.message });
  }
}


// ── doPost ──────────────────────────────────────────────────
// Handles two actions via JSON body { action: '...' }:
//   { action: 'rsvp',  ... }  → save RSVP to RSVPs sheet
//   { action: 'wish',  ... }  → save wish to Wishes sheet
function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var action = (data.action || 'rsvp').trim();

    if (action === 'wish') {
      return buildJson(saveWish(data));
    }

    // Default: RSVP
    return buildJson(saveRsvp(data));

  } catch (err) {
    return buildJson({ result: 'error', error: err.message });
  }
}


// ── RSVP: save to RSVPs sheet ───────────────────────────────
function saveRsvp(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('RSVPs');

  if (!sheet) {
    sheet = ss.insertSheet('RSVPs');
    sheet.appendRow(['Timestamp', 'Invited As', 'Name Confirmed', 'Pax', 'Phone', 'Attending']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  var guestRecord  = findGuest(data.invitedAs || '');
  var submittedPax = parseInt(data.pax) || 1;
  var finalPax     = Math.min(submittedPax, guestRecord.maxPax);

  sheet.appendRow([
    new Date(),
    data.invitedAs || '',
    data.name      || '',
    finalPax,
    data.phone     || '',
    data.attending || 'yes',
  ]);

  return { result: 'success', pax: finalPax };
}


// ── WISH: save to Wishes sheet ──────────────────────────────
function saveWish(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Wishes');

  if (!sheet) {
    sheet = ss.insertSheet('Wishes');
    sheet.appendRow(['Timestamp', 'Name', 'Message']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  var name    = (data.name    || '').trim();
  var message = (data.message || '').trim();

  if (!name || !message) {
    return { result: 'error', error: 'Name and message are required.' };
  }

  sheet.appendRow([new Date(), name, message]);
  return { result: 'success' };
}


// ── WISH: fetch all from Wishes sheet ───────────────────────
// Returns { wishes: [ { name, message, timestamp }, … ] } newest first
function getWishes() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Wishes');

  if (!sheet || sheet.getLastRow() < 2) {
    return { wishes: [] };
  }

  var rows   = sheet.getDataRange().getValues();
  var wishes = [];

  // Skip header row (index 0), reverse so newest is first
  for (var i = rows.length - 1; i >= 1; i--) {
    wishes.push({
      timestamp: rows[i][0] ? new Date(rows[i][0]).toLocaleDateString('id-ID') : '',
      name:      rows[i][1] || '',
      message:   rows[i][2] || '',
    });
  }

  return { wishes: wishes };
}


// ── HELPER: Find guest in Guests sheet ──────────────────────
function findGuest(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Guests');

  if (!sheet) {
    return { found: false, maxPax: 1, error: '"Guests" sheet not found' };
  }

  var rows      = sheet.getDataRange().getValues();
  var nameLower = name.toLowerCase();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === nameLower) {
      return {
        found:  true,
        name:   rows[i][0],
        maxPax: parseInt(rows[i][1]) || 1,
      };
    }
  }

  return { found: false, maxPax: 1 };
}


// ── HELPER: Build JSON response ──────────────────────────────
function buildJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── UTILITY: Generate invite links in column C ───────────────
// Run manually: Apps Script editor → select generateInviteLinks → Run
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
    sheet.getRange(i + 1, 3).setValue(SITE_URL + '/?to=' + encodeURIComponent(name));
  }

  SpreadsheetApp.getUi().alert('Invite links generated in column C!');
}
