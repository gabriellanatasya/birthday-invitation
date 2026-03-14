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
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzht7VjQM87pFOW9rrV33uPvq9mP8yhJp-yhOj2xHXSV_bUvMzn7EzO58Y8Q8QgzJ4d_A/exec'; // ← CHANGE THIS

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
const DEV_MODE    = false;  // ← CHANGE to false before going live
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
  const btn    = document.getElementById('btn-open');
  const status = document.getElementById('cover-status');

  // --- 1a. Read name from URL ---
  const params  = new URLSearchParams(window.location.search);
  const rawName = params.get('to');

  // No ?to= param at all — show a gentle hint, leave button disabled
  if (!rawName) {
    setCoverStatus('no-param', '✦ Please use your personal invitation link.');
    lockButton(btn, true);
    return;
  }

  guestName = decodeURIComponent(rawName).trim();
  setGuestNameInDOM(guestName);

  // --- 1b. DEV MODE: skip network, use mock data ---
  if (DEV_MODE) {
    console.log(`[DEV] Mock guest valid. maxPax = ${DEV_MAX_PAX}`);
    guestMaxPax = DEV_MAX_PAX;
    setCoverStatus('', ''); // clear status
    lockButton(btn, false);
    return;
  }

  // --- 1c. Validate guest against Google Sheets ---
  lockButton(btn, true);
  setCoverStatus('checking', '✦ Checking your invitation…');

  try {
    const url      = `${APPS_SCRIPT_URL}?name=${encodeURIComponent(guestName)}`;
    const response = await fetch(url, { redirect: 'follow', credentials: 'omit' });
    const data     = await response.json();

    if (data.found) {
      // ✅ Valid guest — unlock the button
      guestMaxPax = data.maxPax;
      if (data.name) {
        guestName = data.name;
        setGuestNameInDOM(guestName);
      }
      setCoverStatus('', ''); // clear the checking message
      lockButton(btn, false);

    } else {
      // ❌ Name not in sheet — block the button, show warning
      setCoverStatus(
        'invalid',
        '✦ We could not find your invitation. Please check your link or contact us.'
      );
      lockButton(btn, true);
    }

  } catch (err) {
    // Network error — fail open so guests aren't blocked by a connectivity issue
    console.error('Could not reach Apps Script:', err);
    setCoverStatus('', '');
    lockButton(btn, false);
    guestMaxPax = 1;
  }
}

/**
 * Sets the text and style class of the cover status message.
 * @param {'checking'|'invalid'|'no-param'|''} cls
 * @param {string} message
 */
function setCoverStatus(cls, message) {
  const status = document.getElementById('cover-status');
  if (!status) return;
  status.textContent = message;
  status.className   = cls;
}

/**
 * Enables or disables the Open Invitation button.
 * Also swaps the label text to show loading feedback.
 * @param {HTMLElement} btn
 * @param {boolean} locked
 */
function lockButton(btn, locked) {
  if (!btn) return;
  btn.disabled = locked;
  if (locked) {
    btn.classList.add('loading');
  } else {
    btn.classList.remove('loading');
    document.getElementById('btn-open-label').textContent = 'Open Invitation';
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
    applyMaxPaxToForm(guestMaxPax); // build the pax dropdown now that RSVP section is visible
    loadWishes();                   // fetch wishes from Sheets and build carousel
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
    // Note: Apps Script ignores Content-Type on POST and reads postData.contents directly.
    // We must NOT set Content-Type header — it triggers a CORS preflight that Apps Script
    // does not support. Sending as plain text body still works because we JSON.parse() it in doPost.
    const response = await fetch(APPS_SCRIPT_URL, {
      method:      'POST',
      redirect:    'follow',
      credentials: 'omit',
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
   7. WISHES — GOOGLE SHEETS + PEEK CAROUSEL

   Layout: the active card sits centre-stage
   at ~78% width. Adjacent cards peek in from
   left and right so guests can see more exist.

   Interaction:
     • Swipe / drag  → move one card
     • Arrow buttons → move one card
     • Dot / pill    → jump to any card
════════════════════════════════════════ */

let wishList  = [];   // loaded from Sheets
let wishIndex = 0;    // currently centred card

// ── Card width as % of viewport (set once, read by CSS var) ─
const CARD_W_PCT = 78; // percent of carousel container width
const CARD_GAP   = 16; // px — must match CSS gap value

// ── Load wishes from Apps Script ─────────────────────────────
async function loadWishes() {
  const wall = document.getElementById('wishes-wall');

  if (DEV_MODE) {
    wishList = [
      { name: 'Budi & Keluarga', message: 'Selamat ulang tahun yang ke-75! Semoga Ibu selalu sehat, bahagia, dan panjang umur. Terima kasih atas semua kasih sayang yang diberikan.', timestamp: '' },
      { name: 'Tante Rina',      message: '75 tahun penuh cinta dan kebaikan. Semoga Tuhan selalu memberkati dan memberikan kesehatan terbaik. Happy birthday!',  timestamp: '' },
      { name: 'Pak Hendra',      message: 'Sehat selalu ya Bu, semoga panjang umur dan selalu bahagia bersama keluarga tercinta.',        timestamp: '' },
      { name: 'Keluarga Besar',  message: 'Doa terbaik kami selalu menyertai Ibu. Semoga hari ulang tahun ini menjadi awal dari tahun yang penuh berkah.', timestamp: '' },
      { name: 'Sarah & Tom',     message: 'Wishing you a wonderful 75th! May every day bring you joy and happiness.',                    timestamp: '' },
    ];
    renderCarousel();
    return;
  }

  try {
    const url  = `${APPS_SCRIPT_URL}?action=wishes`;
    const res  = await fetch(url, { redirect: 'follow', credentials: 'omit' });
    const data = await res.json();
    wishList   = data.wishes || [];
    renderCarousel();
  } catch (err) {
    console.error('Could not load wishes:', err);
    wall.innerHTML = '<p class="wishes-empty">Could not load wishes. Please refresh.</p>';
  }
}

// ── Build full carousel DOM ───────────────────────────────────
function renderCarousel() {
  const wall = document.getElementById('wishes-wall');

  if (!wishList.length) {
    wall.innerHTML = '<p class="wishes-empty">Be the first to leave a wish! ✦</p>';
    return;
  }

  wishIndex = Math.min(wishIndex, wishList.length - 1);

  // Max 7 dots to avoid clutter; use pill-dots style
  const dotCount = Math.min(wishList.length, 7);
  const dots = Array.from({ length: dotCount }, (_, i) =>
    `<button class="wish-dot ${i === wishIndex ? 'active' : ''}"
       onclick="goToWish(${i})" aria-label="Wish ${i + 1}"></button>`
  ).join('') + (wishList.length > 7 ? '<span class="wish-dot" style="opacity:0.2;cursor:default;pointer-events:none"></span>' : '');

  wall.innerHTML = `
    <div class="wishes-viewport" id="wishes-viewport">
      <div class="wishes-track" id="wishes-track">
        ${wishList.map((w, i) => `
          <div class="wish-card ${i === wishIndex ? 'active' : ''}" data-index="${i}">
            <p class="wish-text">${escapeHtml(w.message)}</p>
            <div class="wish-footer">
              <span class="wish-author">— ${escapeHtml(w.name)}</span>
              ${w.timestamp ? `<span class="wish-date">${escapeHtml(w.timestamp)}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="wish-arrows">
      <button class="wish-arrow prev" id="wish-prev" onclick="moveWish(-1)" aria-label="Previous">&#8592;</button>
      <button class="wish-arrow next" id="wish-next" onclick="moveWish(1)"  aria-label="Next">&#8594;</button>
    </div>

    <div class="wish-dots" id="wish-dots">${dots}</div>
    <p class="wish-counter" id="wish-counter">${wishIndex + 1} / ${wishList.length}</p>
  `;

  setCssCardWidth();
  applyCarouselPosition(false); // no animation on first render
  initSwipe();

  // Recalculate on window resize (orientation change on mobile)
  window.addEventListener('resize', () => { setCssCardWidth(); applyCarouselPosition(false); }, { passive: true });
}

// ── Set --card-w CSS variable from live container width ───────
function setCssCardWidth() {
  const viewport = document.getElementById('wishes-viewport');
  if (!viewport) return;
  // Container width = section max-width minus horizontal padding
  const containerW = viewport.offsetWidth;
  const cardPx     = containerW * (CARD_W_PCT / 100);
  // Write as px value into each card via the track element
  document.querySelectorAll('.wish-card').forEach(c => {
    c.style.flex = `0 0 ${cardPx}px`;
    c.style.width = `${cardPx}px`;
  });
  // Store for translateX calculation
  viewport._cardW = cardPx;
}

// ── Navigate to index ─────────────────────────────────────────
function goToWish(index) {
  wishIndex = Math.max(0, Math.min(index, wishList.length - 1));
  applyCarouselPosition(true);
}

function moveWish(delta) {
  goToWish(wishIndex + delta);
}

// ── Sync track translateX, active class, dots, arrows ─────────
function applyCarouselPosition(animate) {
  const track    = document.getElementById('wishes-track');
  const viewport = document.getElementById('wishes-viewport');
  if (!track || !viewport) return;

  const cardW      = viewport._cardW || (viewport.offsetWidth * CARD_W_PCT / 100);
  const step       = cardW + CARD_GAP;

  /*
    We want the active card to appear centred inside the viewport.
    Offset = how much to shift the track LEFT so card[wishIndex] is centred.

    centreOffset centres the first card:
      (viewportWidth - cardWidth) / 2

    Then each step shifts left by (cardW + gap).
  */
  const viewW        = viewport.offsetWidth;
  const centreOffset = (viewW - cardW) / 2;
  const translateX   = -(wishIndex * step) + centreOffset;

  // Toggle CSS transition on/off for instant vs animated moves
  track.style.transition = animate
    ? 'transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)'
    : 'none';
  track.style.transform = `translateX(${translateX}px)`;

  // Active class → scale + opacity via CSS
  document.querySelectorAll('.wish-card').forEach((c, i) => {
    c.classList.toggle('active', i === wishIndex);
  });

  // Dots
  document.querySelectorAll('.wish-dot').forEach((d, i) => {
    d.classList.toggle('active', i === wishIndex);
  });

  // Counter
  const counter = document.getElementById('wish-counter');
  if (counter) counter.textContent = `${wishIndex + 1} / ${wishList.length}`;

  // Arrows
  const prev = document.getElementById('wish-prev');
  const next = document.getElementById('wish-next');
  if (prev) prev.disabled = wishIndex === 0;
  if (next) next.disabled = wishIndex === wishList.length - 1;
}

// ── Touch + mouse swipe ───────────────────────────────────────
function initSwipe() {
  const viewport = document.getElementById('wishes-viewport');
  if (!viewport) return;

  let startX   = 0;
  let startT   = 0;
  let dragging = false;
  let moved    = false;

  // ── Touch (mobile) ──
  viewport.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startT = Date.now();
  }, { passive: true });

  viewport.addEventListener('touchmove', e => {
    // Live-drag feedback: shift track with finger in real time
    const dx    = e.touches[0].clientX - startX;
    const track = document.getElementById('wishes-track');
    const vp    = document.getElementById('wishes-viewport');
    if (!track || !vp) return;

    const cardW      = vp._cardW || vp.offsetWidth * CARD_W_PCT / 100;
    const step       = cardW + CARD_GAP;
    const centreOff  = (vp.offsetWidth - cardW) / 2;
    const base       = -(wishIndex * step) + centreOff;

    track.style.transition = 'none';
    track.style.transform  = `translateX(${base + dx * 0.6}px)`; // 0.6 = resistance
  }, { passive: true });

  viewport.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dt = Date.now() - startT;
    // Fast flick OR slow drag > 60px
    if (Math.abs(dx) > 60 || (Math.abs(dx) > 30 && dt < 250)) {
      moveWish(dx < 0 ? 1 : -1);
    } else {
      applyCarouselPosition(true); // snap back
    }
  }, { passive: true });

  // ── Mouse drag (desktop) ──
  viewport.addEventListener('mousedown', e => {
    startX   = e.clientX;
    startT   = Date.now();
    dragging = true;
    moved    = false;
  });

  viewport.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) moved = true;

    const track = document.getElementById('wishes-track');
    const vp    = document.getElementById('wishes-viewport');
    if (!track || !vp) return;

    const cardW     = vp._cardW || vp.offsetWidth * CARD_W_PCT / 100;
    const step      = cardW + CARD_GAP;
    const centreOff = (vp.offsetWidth - cardW) / 2;
    const base      = -(wishIndex * step) + centreOff;

    track.style.transition = 'none';
    track.style.transform  = `translateX(${base + dx * 0.6}px)`;
  });

  viewport.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    const dt = Date.now() - startT;
    if (moved && (Math.abs(dx) > 60 || (Math.abs(dx) > 30 && dt < 250))) {
      moveWish(dx < 0 ? 1 : -1);
    } else {
      applyCarouselPosition(true);
    }
    moved = false;
  });

  viewport.addEventListener('mouseleave', () => {
    if (dragging) { dragging = false; applyCarouselPosition(true); }
  });

  // Prevent click-through on links/buttons inside cards while dragging
  viewport.addEventListener('click', e => {
    if (moved) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

// ── Submit a new wish ─────────────────────────────────────────
async function submitWish() {
  const nameInput = document.getElementById('wish-name');
  const msgInput  = document.getElementById('wish-msg');
  const submitBtn = document.querySelector('#wishes-section .btn-submit');

  const name    = nameInput.value.trim();
  const message = msgInput.value.trim();

  if (!name || !message) {
    alert('Please fill in both your name and message.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.querySelector('span').textContent = 'Sending…';

  if (DEV_MODE) {
    await new Promise(r => setTimeout(r, 600));
    wishList.unshift({ name, message, timestamp: '' });
    wishIndex = 0;
    renderCarousel();
    nameInput.value = '';
    msgInput.value  = '';
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Send Wishes';
    return;
  }

  try {
    const res    = await fetch(APPS_SCRIPT_URL, {
      method:      'POST',
      redirect:    'follow',
      credentials: 'omit',
      body: JSON.stringify({ action: 'wish', name, message }),
    });
    const result = await res.json();

    if (result.result === 'success') {
      wishList.unshift({ name, message, timestamp: '' });
      wishIndex = 0;
      renderCarousel();
      nameInput.value = '';
      msgInput.value  = '';
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (err) {
    console.error('Wish failed:', err);
    alert('Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Send Wishes';
  }
}

function escapeHtml(str) {
  return String(str)
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
initGuest(); // reads URL, fetches guest data from Sheets
