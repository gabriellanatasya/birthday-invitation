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
 * Supabase project credentials.
 * Get both values from: Supabase dashboard → Settings → API
 *
 * SUPABASE_URL      → "Project URL"   e.g. https://xyzxyz.supabase.co
 * SUPABASE_ANON_KEY → "anon public"   e.g. eyJhbGciOi...
 *
 * The anon key is SAFE to commit — it is read-only by default and
 * protected by Row Level Security (RLS) policies on each table.
 */
const SUPABASE_URL      = 'YOUR_SUPABASE_URL_HERE';       // ← CHANGE THIS
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';  // ← CHANGE THIS

/**
 * Event date/time in ISO 8601 format with timezone offset.
 * +07:00 = WIB (Western Indonesia Time)
 */
const EVENT_DATE_ISO = '2026-04-18T17:30:00+07:00'; // ← CHANGE if needed

/**
 * DEV MODE — set true while testing on localhost (127.0.0.1 / Live Server).
 * Skips all Supabase network calls and uses mock data instead.
 * ← Set to FALSE before deploying to production!
 */
const DEV_MODE    = false; // ← CHANGE to false before going live
const DEV_MAX_PAX = 4;    // ← mock max pax used during local testing

/**
 * Shared headers sent with every Supabase REST request.
 * Built once here and reused across all fetch calls.
 */
const SUPA_HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation', // makes INSERT return the created row
};


/* ════════════════════════════════════════
   GLOBAL STATE
   Shared between functions.
════════════════════════════════════════ */

let guestName  = 'Guest'; // name from URL ?to=...
let guestMaxPax = 1;       // max pax returned from Supabase


/* ════════════════════════════════════════
   1. GUEST LOOKUP
   Reads ?to=Name from the URL, queries the
   Supabase "guests" table, and returns max_pax.
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

  // --- 1c. Validate guest against Supabase ---
  lockButton(btn, true);
  setCoverStatus('checking', '✦ Checking your invitation…');

  try {
    /*
     * Query the "guests" table for an exact name match (case-insensitive).
     * ilike = case-insensitive LIKE in Supabase PostgREST syntax.
     * select=name,max_pax limits the columns returned.
     */
    const url = `${SUPABASE_URL}/rest/v1/guests`
      + `?name=ilike.${encodeURIComponent(guestName)}`
      + `&select=name,max_pax`
      + `&limit=1`;

    const response = await fetch(url, { headers: SUPA_HEADERS });
    const rows     = await response.json(); // returns an array

    if (rows.length > 0) {
      // ✅ Valid guest — use exact casing from the DB
      const row   = rows[0];
      guestMaxPax = row.max_pax || 1;
      guestName   = row.name;
      setGuestNameInDOM(guestName);
      setCoverStatus('', '');
      lockButton(btn, false);

    } else {
      // ❌ Name not found
      setCoverStatus(
        'invalid',
        '✦ We could not find your invitation. Please check your link or contact us.'
      );
      lockButton(btn, true);
    }

  } catch (err) {
    // Network error — fail open so guests aren't blocked by connectivity issues
    console.error('Supabase guest lookup failed:', err);
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

/**
 * Writes the guest name into all relevant DOM elements.
 * The RSVP name field is readonly — we set its value directly
 * regardless of any existing content since it can't be user-edited.
 */
function setGuestNameInDOM(name) {
  // Cover page guest name
  const coverGuest = document.querySelector('.cover-guest');
  if (coverGuest) coverGuest.textContent = name;

  // RSVP locked name field — always overwrite with the verified name
  const rsvpName = document.getElementById('rsvp-name');
  if (rsvpName) {
    rsvpName.value = name;
    rsvpName.title = `Invitation sent to: ${name}`; // tooltip on hover
  }
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
      'color: var(--gold-dark)',
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
  'rgba(181,  41,  78, 0.30)', // deep rose
  'rgba(232, 130, 154, 0.45)', // mid rose
  'rgba(245, 198, 208, 0.60)', // blush pink
  'rgba(201, 164,  74, 0.40)', // gold
  'rgba(232, 130, 154, 0.35)', // soft rose
  'rgba(253, 234, 237, 0.70)', // pale blush
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
    applyMaxPaxToForm(guestMaxPax);      // build the pax dropdown now that RSVP section is visible
    loadWishes();                        // fetch wishes from Supabase and build carousel
    createInvitationDecorations();       // inject watercolour splashes, florals, butterflies
    initDecoReveal();                    // fade decorations in as sections scroll into view
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
   Pax is validated client-side (max_pax from
   Supabase guests table). Row inserted directly
   into the Supabase "rsvps" table.
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

  // Name comes from the locked field — always the ?to= value
  const name   = guestName;   // use global, not the field (tamper-proof)
  const pax    = parseInt(guestsInput.value) || 1;
  const phone  = phoneInput.value.trim();

  // --- Client-side validation ---
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
    // nameInput is locked — leave it
    guestsInput.value = '';
    phoneInput.value  = '';
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Confirm Attendance';
    return;
  }

  try {
    /*
     * INSERT a row into the "rsvps" table.
     * Supabase REST: POST /rest/v1/rsvps with JSON body.
     * pax is capped to guestMaxPax both here (client) and
     * via a CHECK constraint in the DB (server).
     */
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rsvps`, {
      method:  'POST',
      headers: SUPA_HEADERS,
      body: JSON.stringify({
        invited_as: guestName,        // the ?to= name
        pax:        Math.min(pax, guestMaxPax), // cap client-side too
        phone:      phone || null,
        attending:  rsvpChoice,
      }),
    });

    if (response.ok) {
      document.getElementById('rsvp-success').classList.add('show');
      // nameInput is locked — leave it visible
      guestsInput.value = '';
      phoneInput.value  = '';
    } else {
      const err = await response.json();
      throw new Error(err.message || `HTTP ${response.status}`);
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
   7. WISHES — SUPABASE + PEEK CAROUSEL

   Wishes are stored in the Supabase "wishes"
   table and loaded fresh when the invitation
   opens. The carousel shows 1 card at a time
   with adjacent cards peeking in from the sides.

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
    /*
     * SELECT all wishes, newest first.
     * order=created_at.desc → most recent at top
     * select=name,message,created_at → only columns we need
     */
    const url = `${SUPABASE_URL}/rest/v1/wishes`
      + `?select=name,message,created_at`
      + `&order=created_at.desc`;

    const res  = await fetch(url, { headers: SUPA_HEADERS });
    const rows = await res.json();

    // Map DB columns to the shape the carousel expects
    wishList = rows.map(r => ({
      name:      r.name,
      message:   r.message,
      timestamp: r.created_at
        ? new Date(r.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })
        : '',
    }));

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
    /*
     * INSERT a row into the "wishes" table.
     */
    const res = await fetch(`${SUPABASE_URL}/rest/v1/wishes`, {
      method:  'POST',
      headers: SUPA_HEADERS,
      body:    JSON.stringify({ name, message }),
    });

    if (res.ok) {
      // Optimistically add to front and re-render immediately
      wishList.unshift({ name, message, timestamp: '' });
      wishIndex = 0;
      renderCarousel();
      nameInput.value = '';
      msgInput.value  = '';
    } else {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
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
   SHARED DECORATION ASSETS
   Defined once here, reused by both
   createCoverDecorations() and
   createInvitationDecorations().
════════════════════════════════════════ */

const SVG_FLORAL = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220" fill="none">
  <circle cx="80" cy="80" r="38" stroke="#b5294e" stroke-width="1" opacity="0.55"/>
  <circle cx="80" cy="80" r="26" stroke="#b5294e" stroke-width="0.8" opacity="0.45"/>
  <circle cx="80" cy="80" r="14" stroke="#b5294e" stroke-width="0.8" opacity="0.4"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.5" transform="rotate(0 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.5" transform="rotate(45 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.5" transform="rotate(90 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.5" transform="rotate(135 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.45" transform="rotate(180 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.45" transform="rotate(225 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.45" transform="rotate(270 80 80)"/>
  <ellipse cx="80" cy="44" rx="12" ry="22" stroke="#b5294e" stroke-width="1" opacity="0.45" transform="rotate(315 80 80)"/>
  <path d="M 118 80 Q 155 50 180 20" stroke="#b5294e" stroke-width="1" opacity="0.4" fill="none"/>
  <path d="M 118 80 Q 170 60 195 30" stroke="#b5294e" stroke-width="0.8" opacity="0.3" fill="none"/>
  <path d="M 80 118 Q 50 155 20 185" stroke="#b5294e" stroke-width="1" opacity="0.4" fill="none"/>
  <path d="M 110 110 Q 145 140 165 175" stroke="#b5294e" stroke-width="0.8" opacity="0.35" fill="none"/>
  <ellipse cx="170" cy="50" rx="8" ry="14" stroke="#b5294e" stroke-width="0.8" opacity="0.4" transform="rotate(-30 170 50)"/>
  <path d="M 165 60 Q 155 75 148 90" stroke="#b5294e" stroke-width="0.8" opacity="0.3" fill="none"/>
  <circle cx="150" cy="30"  r="1.5" fill="#c9a44a" opacity="0.7"/>
  <circle cx="195" cy="65"  r="1"   fill="#c9a44a" opacity="0.6"/>
  <circle cx="30"  cy="180" r="1.5" fill="#c9a44a" opacity="0.7"/>
  <circle cx="10"  cy="210" r="1"   fill="#c9a44a" opacity="0.5"/>
  <circle cx="175" cy="12"  r="1"   fill="#c9a44a" opacity="0.6"/>
</svg>`;

const SVG_BUTTERFLY = `<svg xmlns="http://www.w3.org/2000/svg" width="55" height="45" viewBox="0 0 55 45" fill="none">
  <path d="M27 22 Q10 5 2 12 Q-2 22 8 28 Q16 34 27 22Z" stroke="#e8829a" stroke-width="1" fill="rgba(232,130,154,0.12)"/>
  <path d="M27 22 Q12 30 8 40 Q14 48 22 40 Q28 32 27 22Z" stroke="#e8829a" stroke-width="1" fill="rgba(232,130,154,0.1)"/>
  <path d="M28 22 Q44 5 52 12 Q56 22 46 28 Q38 34 28 22Z" stroke="#e8829a" stroke-width="1" fill="rgba(232,130,154,0.12)"/>
  <path d="M28 22 Q42 30 46 40 Q40 48 32 40 Q27 32 28 22Z" stroke="#e8829a" stroke-width="1" fill="rgba(232,130,154,0.1)"/>
  <line x1="27" y1="15" x2="28" y2="38" stroke="#b5294e" stroke-width="1" opacity="0.6"/>
  <path d="M27 15 Q22 8 18 4" stroke="#b5294e" stroke-width="0.8" fill="none" opacity="0.5"/>
  <path d="M28 15 Q33 8 37 4" stroke="#b5294e" stroke-width="0.8" fill="none" opacity="0.5"/>
  <circle cx="18" cy="4" r="1.5" fill="#b5294e" opacity="0.5"/>
  <circle cx="37" cy="4" r="1.5" fill="#b5294e" opacity="0.5"/>
</svg>`;

/**
 * Watercolour blob — soft radial gradient ellipse.
 * c1/c2 = inner/outer colour, opacity = peak opacity at centre.
 */
function makeWatercolour(id, w, h, cx, cy, rx, ry, c1, c2, opacity = 0.18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <radialGradient id="${id}" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stop-color="${c1}" stop-opacity="${opacity + 0.06}"/>
        <stop offset="60%"  stop-color="${c2}" stop-opacity="${opacity}"/>
        <stop offset="100%" stop-color="${c2}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>
  </svg>`;
}

/**
 * Inject decoration <div>s into a section.
 * items = [{ svg, cls, style }]
 */
function injectDecos(sectionId, items) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  if (getComputedStyle(section).position === 'static') section.style.position = 'relative';
  section.style.overflow = 'hidden';
  items.forEach(({ svg, cls, style }) => {
    const el = document.createElement('div');
    el.className  = 'inv-deco ' + cls;
    el.style.cssText = style;
    el.innerHTML  = svg;
    section.appendChild(el);
  });
}


/* ════════════════════════════════════════
   COVER DECORATIONS
   Uses the shared SVG_FLORAL, SVG_BUTTERFLY
   and makeWatercolour() defined above.
════════════════════════════════════════ */

function createCoverDecorations() {
  const cover = document.getElementById('cover');
  if (!cover) return;

  // Floral corners (top-left + bottom-right)
  const tl = document.createElement('div');
  tl.className = 'floral-corner tl';
  tl.innerHTML = SVG_FLORAL;
  cover.appendChild(tl);

  const br = document.createElement('div');
  br.className = 'floral-corner br';
  br.innerHTML = SVG_FLORAL;
  cover.appendChild(br);

  // Ribbon swirls
  ['r1', 'r2'].forEach(cls => {
    const r = document.createElement('div');
    r.className = `ribbon ${cls}`;
    cover.appendChild(r);
  });

  // Butterflies
  const b1 = document.createElement('div');
  b1.className = 'butterfly mid-right';
  b1.innerHTML = SVG_BUTTERFLY;
  cover.appendChild(b1);

  const b2 = document.createElement('div');
  b2.className = 'butterfly lower-left';
  b2.style.transform = 'scale(0.7) rotate(15deg)';
  b2.innerHTML = SVG_BUTTERFLY;
  cover.appendChild(b2);
}

/* ════════════════════════════════════════
   INVITATION DECORATIONS
   Reuses SVG_FLORAL, SVG_BUTTERFLY and
   makeWatercolour() — the exact same assets
   as the cover page for visual consistency.
════════════════════════════════════════ */

function createInvitationDecorations() {

  // ── 1. HERO ─────────────────────────────────────────────────
  injectDecos('inv-hero', [
    { svg: makeWatercolour('h1',300,240,150,120,130,100,'#e8829a','#f5c6d0', 0.22),
      cls: 'deco-splash', style: 'top:-40px;right:-50px;pointer-events:none;z-index:0' },
    { svg: makeWatercolour('h2',260,200,130,100,110,80,'#c9a44a','#fef6ec', 0.16),
      cls: 'deco-splash', style: 'bottom:-30px;left:-50px;pointer-events:none;z-index:0' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'top:-20px;left:-20px;pointer-events:none;z-index:0;--deco-opacity:0.7' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-20px;right:-20px;transform:rotate(180deg);pointer-events:none;z-index:0;--deco-opacity:0.6' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter', style: 'top:28%;right:4%;pointer-events:none;z-index:1;--deco-opacity:0.8' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter-alt', style: 'top:10%;left:5%;transform:scale(0.75) scaleX(-1);pointer-events:none;z-index:1;--deco-opacity:0.65' },
  ]);

  // ── 2. COUNTDOWN ────────────────────────────────────────────
  injectDecos('countdown-section', [
    { svg: makeWatercolour('c1',220,170,110,85,100,70,'#e8829a','#f5c6d0', 0.15),
      cls: 'deco-splash', style: 'top:-20px;right:-30px;pointer-events:none' },
    { svg: makeWatercolour('c2',190,150,95,75,85,60,'#c9a44a','#fef6ec', 0.12),
      cls: 'deco-splash', style: 'bottom:-20px;left:-30px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-10px;right:0;transform:scale(0.55) rotate(20deg);pointer-events:none;--deco-opacity:0.5' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter-alt', style: 'top:8px;left:8px;transform:scale(0.65);pointer-events:none;--deco-opacity:0.55' },
  ]);

  // ── 3. EVENT DETAILS ────────────────────────────────────────
  injectDecos('details-section', [
    { svg: makeWatercolour('d1',260,210,130,105,120,95,'#e8829a','#faeaed', 0.18),
      cls: 'deco-splash', style: 'top:-30px;left:-40px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'top:-20px;right:-20px;transform:scale(0.6) rotate(30deg);pointer-events:none;--deco-opacity:0.5' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-15px;left:5px;transform:scale(0.5) rotate(-15deg);pointer-events:none;--deco-opacity:0.4' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter', style: 'bottom:20px;right:10px;transform:scale(0.8);pointer-events:none;--deco-opacity:0.6' },
  ]);

  // ── 4. MAP ───────────────────────────────────────────────────
  injectDecos('map-section', [
    { svg: makeWatercolour('m1',280,170,140,85,130,70,'#e8829a','#fdf0f3', 0.18),
      cls: 'deco-splash', style: 'top:0;right:-20px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'top:5px;right:20px;transform:scale(0.45) rotate(-10deg);pointer-events:none;--deco-opacity:0.4' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter-alt', style: 'top:30px;left:15px;transform:scale(0.7) scaleX(-1);pointer-events:none;--deco-opacity:0.55' },
  ]);

  // ── 5. RSVP ──────────────────────────────────────────────────
  injectDecos('rsvp-section', [
    { svg: makeWatercolour('r1',300,250,150,125,140,115,'#e8829a','#faeaed', 0.2),
      cls: 'deco-splash', style: 'top:-40px;right:-50px;pointer-events:none' },
    { svg: makeWatercolour('r2',240,200,120,100,110,90,'#c9a44a','#fef6ec', 0.14),
      cls: 'deco-splash', style: 'bottom:-30px;left:-40px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'top:-30px;left:-30px;transform:scale(0.7);pointer-events:none;--deco-opacity:0.5' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter', style: 'top:35%;right:3%;pointer-events:none;--deco-opacity:0.7' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-20px;right:-15px;transform:scale(0.55) rotate(160deg);pointer-events:none;--deco-opacity:0.45' },
  ]);

  // ── 6. WISHES ────────────────────────────────────────────────
  injectDecos('wishes-section', [
    { svg: makeWatercolour('w1',240,190,120,95,110,85,'#f5c6d0','#fdf0f3', 0.18),
      cls: 'deco-splash', style: 'top:-20px;right:-35px;pointer-events:none' },
    { svg: makeWatercolour('w2',200,160,100,80,90,70,'#c9a44a','#fef6ec', 0.12),
      cls: 'deco-splash', style: 'bottom:-20px;left:-30px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-10px;right:0;transform:scale(0.5) rotate(10deg);pointer-events:none;--deco-opacity:0.4' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter-alt', style: 'top:12%;right:4%;transform:scale(0.7);pointer-events:none;--deco-opacity:0.6' },
  ]);

  // ── 7. GIFT ──────────────────────────────────────────────────
  injectDecos('gift-section', [
    { svg: makeWatercolour('g1',260,210,130,105,120,95,'#e8829a','#faeaed', 0.17),
      cls: 'deco-splash', style: 'top:-30px;right:-40px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-20px;left:-15px;transform:scale(0.55) rotate(-20deg);pointer-events:none;--deco-opacity:0.45' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter', style: 'top:10px;right:15px;transform:scale(0.65) scaleX(-1);pointer-events:none;--deco-opacity:0.55' },
  ]);

  // ── 8. THANK YOU ─────────────────────────────────────────────
  injectDecos('ty-section', [
    { svg: makeWatercolour('t1',380,310,190,155,175,140,'#e8829a','#f5c6d0', 0.22),
      cls: 'deco-splash', style: 'top:-50px;right:-60px;pointer-events:none' },
    { svg: makeWatercolour('t2',320,260,160,130,150,120,'#c9a44a','#fef6ec', 0.18),
      cls: 'deco-splash', style: 'bottom:-50px;left:-60px;pointer-events:none' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'top:-20px;left:-20px;pointer-events:none;--deco-opacity:0.65' },
    { svg: SVG_FLORAL,
      cls: 'deco-floral', style: 'bottom:-20px;right:-20px;transform:rotate(180deg) scaleX(-1);pointer-events:none;--deco-opacity:0.6' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter', style: 'top:8%;right:6%;pointer-events:none;--deco-opacity:0.8' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter-alt', style: 'top:22%;left:5%;transform:scaleX(-1);pointer-events:none;--deco-opacity:0.7' },
    { svg: SVG_BUTTERFLY,
      cls: 'deco-butterfly deco-flutter', style: 'bottom:12%;right:9%;transform:scale(0.75);pointer-events:none;--deco-opacity:0.6' },
  ]);
}

/* ════════════════════════════════════════
   DECORATION REVEAL
   Fades .inv-deco elements in as their
   parent section scrolls into view.
════════════════════════════════════════ */

function initDecoReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        // Stagger each decoration slightly so they don't all pop at once
        e.target.querySelectorAll('.inv-deco').forEach((el, i) => {
          setTimeout(() => el.classList.add('deco-visible'), i * 80);
        });
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll(
    '#inv-hero, #countdown-section, #details-section, #map-section, ' +
    '#rsvp-section, #wishes-section, #gift-section, #ty-section'
  ).forEach(s => obs.observe(s));
}


/* ════════════════════════════════════════
   INITIALISE ON PAGE LOAD
════════════════════════════════════════ */

createPetals();
createCoverDecorations();
initGuest(); // reads URL, fetches guest data from Supabase