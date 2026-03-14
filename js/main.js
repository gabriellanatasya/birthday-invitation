/* ============================================================
   main.js
   All interactive behaviour for the birthday invitation.

   SECTIONS:
     0. Configuration
     1. Guest lookup  (reads ?to=Name, fetches max pax from Sheets)
     2. Falling petals animation
     3. Open invitation transition
     4. Live countdown timer
     5. Scroll-reveal observer
     6. RSVP toggle & validated form submit
     7. Wishes wall
     8. Copy-to-clipboard (bank account)
   ============================================================ */


/* ════════════════════════════════════════
   0. CONFIGURATION
   ← The only section you need to edit.
════════════════════════════════════════ */

/**
 * Paste your Google Apps Script Web App URL here.
 * Get it from: Apps Script → Deploy → Manage deployments → copy URL
 * It looks like: https://script.google.com/macros/s/AKfycb.../exec
 */
const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE'; // ← CHANGE THIS

/**
 * Event date/time in ISO 8601 format with timezone offset.
 * +07:00 = WIB (Western Indonesia Time)
 */
const EVENT_DATE_ISO = '2026-04-18T18:00:00+07:00'; // ← CHANGE if needed

/**
 * DEV MODE — set true while testing on localhost (127.0.0.1 / Live Server).
 * Skips the Apps Script network call and uses mock data instead.
 * ← Set to FALSE before deploying to production!
 */
const DEV_MODE    = true;  // ← CHANGE to false before going live
const DEV_MAX_PAX = 4;     // ← mock max pax used during local testing


/* ════════════════════════════════════════
   GLOBAL STATE
   Shared between functions.
════════════════════════════════════════ */

let guestName  = 'Guest'; // name from URL ?to=...
let guestMaxPax = 1;       // max pax returned from Google Sheets


/* ════════════════════════════════════════
   1. GUEST LOOKUP
   Reads ?to=Name from the URL, then calls
   the Apps Script to get their max pax.
   Updates the cover name and RSVP form.
════════════════════════════════════════ */

async function initGuest() {
  // --- 1a. Read name from URL ---
  const params = new URLSearchParams(window.location.search);
  const rawName = params.get('to');

  if (rawName) {
    guestName = decodeURIComponent(rawName).trim();
  }

  // Apply name to cover immediately (don't wait for network)
  setGuestNameInDOM(guestName);

  // --- 1b. DEV MODE: skip network, use mock data ---
  if (DEV_MODE) {
    console.log(`[DEV] Skipping Apps Script lookup. Mock maxPax = ${DEV_MAX_PAX}`);
    guestMaxPax = DEV_MAX_PAX;
    applyMaxPaxToForm(guestMaxPax);
    return;
  }

  // --- 1c. Fetch max pax from Google Sheets via Apps Script ---
  try {
    showRsvpLoader(true);

    const url      = `${APPS_SCRIPT_URL}?name=${encodeURIComponent(guestName)}`;
    const response = await fetch(url);
    const data     = await response.json();

    if (data.found) {
      guestMaxPax = data.maxPax;

      // Use the sheet's casing of the name if available
      if (data.name) {
        guestName = data.name;
        setGuestNameInDOM(guestName);
      }
    } else {
      // Guest not in sheet — still works, defaults to 1 pax
      console.warn('Guest not found in sheet, defaulting to 1 pax');
      guestMaxPax = 1;
    }

  } catch (err) {
    // Network error — degrade gracefully
    console.error('Could not reach Apps Script:', err);
    guestMaxPax = 1;
  } finally {
    showRsvpLoader(false);
    applyMaxPaxToForm(guestMaxPax);
  }
}

/** Writes the guest name into all relevant DOM elements. */
function setGuestNameInDOM(name) {
  const coverGuest = document.querySelector('.cover-guest');
  if (coverGuest) coverGuest.textContent = name;

  // Pre-fill the RSVP name field so they don't have to type it
  const rsvpName = document.getElementById('rsvp-name');
  if (rsvpName && !rsvpName.value) rsvpName.value = name;
}

/**
 * Builds a <select> dropdown with options 1…maxPax and
 * shows a "valid for X guest(s)" notice below it.
 *
 * Options are labelled as:
 *   1 guest (just me)
 *   2 guests
 *   3 guests
 *   …
 */
function applyMaxPaxToForm(maxPax) {
  const select = document.getElementById('rsvp-guests');
  if (!select) return;

  // Clear any existing options
  select.innerHTML = '';

  // Build one <option> per allowed pax value
  for (let i = 1; i <= maxPax; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i === 1 ? '1 guest (just me)' : `${i} guests`;
    select.appendChild(opt);
  }

  // Show / update the pax notice below the dropdown
  let notice = document.getElementById('pax-notice');
  if (!notice) {
    notice = document.createElement('p');
    notice.id = 'pax-notice';
    notice.style.cssText = [
      'font-size: 0.78rem',
      'color: var(--gold-light)',
      'margin-top: -10px',
      'margin-bottom: 18px',
      'letter-spacing: 0.05em',
      'opacity: 0.85',
    ].join(';');
    select.parentNode.insertAdjacentElement('afterend', notice);
  }

  notice.innerHTML = maxPax === 1
    ? '✦ This invitation is valid for <strong>1 guest</strong>.'
    : `✦ This invitation is valid for up to <strong>${maxPax} guests</strong>.`;
}

/** Shows/hides a subtle loading spinner in the RSVP section. */
function showRsvpLoader(visible) {
  let loader = document.getElementById('rsvp-loader');

  if (!loader) {
    loader = document.createElement('p');
    loader.id = 'rsvp-loader';
    loader.textContent = 'Loading your invitation details…';
    loader.style.cssText = [
      'font-size: 0.75rem',
      'color: rgba(245,198,208,0.5)',
      'margin-bottom: 16px',
      'letter-spacing: 0.1em',
      'font-style: italic',
    ].join(';');

    // Insert before the toggle buttons
    const toggleRow = document.querySelector('.toggle-row');
    if (toggleRow) toggleRow.before(loader);
  }

  loader.style.display = visible ? 'block' : 'none';
}


/* ════════════════════════════════════════
   2. FALLING PETALS
   Creates 28 petal <div>s with randomised
   size, colour, speed, and start position.
════════════════════════════════════════ */

const PETAL_COLORS = [
  'rgba(232, 130, 154, 0.75)', // pink
  'rgba(245, 198, 208, 0.70)', // soft pink
  'rgba(212, 168,  67, 0.65)', // gold
  'rgba(240, 217, 142, 0.60)', // gold light
  'rgba(196,  85, 110, 0.60)', // deep pink
  'rgba(253, 240, 243, 0.70)', // pale blush
];

function createPetals() {
  const container = document.getElementById('pc');
  if (!container) return;

  for (let i = 0; i < 28; i++) {
    const petal = document.createElement('div');
    petal.classList.add('petal');

    const color    = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
    const width    = 5  + Math.random() * 8;
    const height   = 8  + Math.random() * 12;
    const duration = 7  + Math.random() * 12;
    const delay    = Math.random() * 12;

    petal.style.cssText = [
      `left: ${Math.random() * 100}vw`,
      `top: -20px`,
      `width: ${width}px`,
      `height: ${height}px`,
      `background: ${color}`,
      `animation-duration: ${duration}s`,
      `animation-delay: ${delay}s`,
    ].join('; ');

    container.appendChild(petal);
  }
}


/* ════════════════════════════════════════
   3. OPEN INVITATION
   Fades out the cover, shows #invitation.
════════════════════════════════════════ */

function openInvitation() {
  const cover = document.getElementById('cover');
  const inv   = document.getElementById('invitation');

  cover.style.transition = 'opacity 0.9s, transform 0.9s';
  cover.style.opacity    = '0';
  cover.style.transform  = 'scale(1.04)';

  setTimeout(() => {
    cover.style.display = 'none';
    inv.style.display   = 'block';
    window.scrollTo({ top: 0 });

    startCountdown();
    initReveal();
  }, 900);
}


/* ════════════════════════════════════════
   4. COUNTDOWN TIMER
   Ticks every second. Reads EVENT_DATE_ISO.
════════════════════════════════════════ */

function startCountdown() {
  const target = new Date(EVENT_DATE_ISO).getTime();

  const elDays  = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMins  = document.getElementById('cd-mins');
  const elSecs  = document.getElementById('cd-secs');

  function tick() {
    const diff = target - Date.now();

    if (diff <= 0) {
      [elDays, elHours, elMins, elSecs].forEach(el => el.textContent = '00');
      return;
    }

    elDays.textContent  = String(Math.floor(diff / 86_400_000)).padStart(2, '0');
    elHours.textContent = String(Math.floor((diff % 86_400_000) / 3_600_000)).padStart(2, '0');
    elMins.textContent  = String(Math.floor((diff % 3_600_000)  /    60_000)).padStart(2, '0');
    elSecs.textContent  = String(Math.floor((diff % 60_000)     /     1_000)).padStart(2, '0');
  }

  tick();
  setInterval(tick, 1000);
}


/* ════════════════════════════════════════
   5. SCROLL REVEAL
   Adds "visible" class via IntersectionObserver.
════════════════════════════════════════ */

function initReveal() {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    }),
    { threshold: 0.12 }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}


/* ════════════════════════════════════════
   6. RSVP — TOGGLE & VALIDATED SUBMIT
   Server-side pax validation via Apps Script.
════════════════════════════════════════ */

let rsvpChoice = 'yes';

function setRSVP(value) {
  rsvpChoice = value;
  document.getElementById('btn-yes').classList.toggle('active', value === 'yes');
  document.getElementById('btn-no').classList.toggle('active',  value === 'no');
}

async function submitRSVP() {
  const nameInput   = document.getElementById('rsvp-name');
  const guestsInput = document.getElementById('rsvp-guests');
  const phoneInput  = document.getElementById('rsvp-phone');
  const submitBtn   = document.querySelector('#rsvp-section .btn-submit');

  const name   = nameInput.value.trim();
  const pax    = parseInt(guestsInput.value) || 1;
  const phone  = phoneInput.value.trim();

  // --- Client-side validation ---
  if (!name) {
    alert('Please enter your full name.');
    return;
  }

  if (pax < 1) {
    alert('Number of guests must be at least 1.');
    return;
  }

  if (pax > guestMaxPax) {
    alert(`Sorry, your invitation allows a maximum of ${guestMaxPax} guest(s).`);
    guestsInput.value = guestMaxPax;
    return;
  }

  // --- Disable button while submitting ---
  submitBtn.disabled       = true;
  submitBtn.querySelector('span').textContent = 'Sending…';

  // --- DEV MODE: mock submit ---
  if (DEV_MODE) {
    console.log('[DEV] Mock RSVP submit:', { guestName, name, pax, phone, attending: rsvpChoice });
    await new Promise(r => setTimeout(r, 800)); // fake network delay
    document.getElementById('rsvp-success').classList.add('show');
    nameInput.value = '';
    guestsInput.value = '';
    phoneInput.value = '';
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Confirm Attendance';
    return;
  }

  try {
    // POST to Apps Script — server also validates pax ≤ maxPax
    const response = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitedAs: guestName,   // the ?to= name (who the invite was sent to)
        name,                   // what they typed
        pax,
        phone,
        attending: rsvpChoice,
      }),
    });

    const result = await response.json();

    if (result.result === 'success') {
      // Show success, clear form
      document.getElementById('rsvp-success').classList.add('show');
      nameInput.value   = '';
      guestsInput.value = '';
      phoneInput.value  = '';
    } else {
      throw new Error(result.error || 'Unknown error');
    }

  } catch (err) {
    console.error('RSVP submission failed:', err);
    alert('Something went wrong. Please try again or contact us directly.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Confirm Attendance';
  }
}


/* ════════════════════════════════════════
   7. WISHES WALL
════════════════════════════════════════ */

const wishes = [
  {
    name: 'Budi & Keluarga',
    text: 'Selamat ulang tahun yang ke-75! Semoga Ibu selalu sehat, bahagia, dan panjang umur.',
  },
  {
    name: 'Tante Rina',
    text: '75 tahun penuh cinta dan kebaikan. Semoga Tuhan selalu memberkati. Happy birthday!',
  },
];

function renderWishes() {
  document.getElementById('wishes-wall').innerHTML = wishes
    .map(w => `
      <div class="wish-card">
        <p class="wish-text">${escapeHtml(w.text)}</p>
        <p class="wish-author">— ${escapeHtml(w.name)}</p>
      </div>`)
    .join('');
}

function submitWish() {
  const name = document.getElementById('wish-name').value.trim();
  const msg  = document.getElementById('wish-msg').value.trim();

  if (!name || !msg) {
    alert('Please fill in both your name and message.');
    return;
  }

  wishes.unshift({ name, text: msg });
  renderWishes();

  document.getElementById('wish-name').value = '';
  document.getElementById('wish-msg').value  = '';
}

function escapeHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}


/* ════════════════════════════════════════
   8. COPY TO CLIPBOARD
════════════════════════════════════════ */

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied! ✓';
    setTimeout(() => btn.textContent = 'Copy Account Number', 2000);
  }).catch(() => {
    alert('Please copy manually: ' + text);
  });
}


/* ════════════════════════════════════════
   INITIALISE ON PAGE LOAD
════════════════════════════════════════ */

createPetals();
renderWishes();
initGuest(); // reads URL, fetches guest data from Sheets
