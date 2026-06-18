/* =============================================
   RAILQUICK — app.js
   Countdown · Modals · Form submit
   ============================================= */

// ---- DOM refs ----
const form         = document.getElementById('waitlistForm');
const statusEl     = document.getElementById('formStatus');
const submitBtn    = document.getElementById('submitButton');
const btnLabel     = document.getElementById('btn-label');
const successModal = document.getElementById('successModal');
const appModal     = document.getElementById('appModal');

/* =============================================
   COUNTDOWN TIMER
   Target: 60 days from today
   ============================================= */
(function initCountdown() {
  const target = new Date();
  target.setDate(target.getDate() + 60);
  target.setHours(0, 0, 0, 0);

  const elDays  = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMins  = document.getElementById('cd-mins');
  const elSecs  = document.getElementById('cd-secs');

  if (!elDays) return;

  function pad(n) { return String(n).padStart(2, '0'); }

  function animFlip(el, val) {
    const newVal = pad(val);
    if (el.textContent === newVal) return;
    el.style.transition = 'none';
    el.style.transform  = 'translateY(-5px)';
    el.style.opacity    = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.textContent       = newVal;
        el.style.transition  = 'transform 200ms ease, opacity 200ms ease';
        el.style.transform   = 'translateY(0)';
        el.style.opacity     = '1';
      });
    });
  }

  function tick() {
    const diff = Math.max(0, target.getTime() - Date.now());
    animFlip(elDays,  Math.floor(diff / 86400000));
    animFlip(elHours, Math.floor((diff % 86400000) / 3600000));
    animFlip(elMins,  Math.floor((diff % 3600000) / 60000));
    animFlip(elSecs,  Math.floor((diff % 60000) / 1000));
  }

  tick();
  setInterval(tick, 1000);
})();

/* =============================================
   MODAL HELPERS
   ============================================= */
function openModal(modal) {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Delegated click handler for all modal triggers
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-app-modal]'))  { openModal(appModal);     return; }
  if (e.target.closest('[data-close-modal]'))      { closeModal(successModal); return; }
  if (e.target.closest('[data-close-app-modal]')) {
    closeModal(appModal);
    // If clicking "Join Waitlist" inside app modal, scroll to form
    if (e.target.closest('a[href="#waitlistForm"]')) {
      const formEl = document.getElementById('waitlistForm');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(successModal); closeModal(appModal); }
});

/* =============================================
   SAVED EMAIL CHECK
   ============================================= */
const savedEmail = localStorage.getItem('railquick_waitlist_email');
if (savedEmail && statusEl) {
  statusEl.textContent = '✅ You\'re already on the RailQuick waitlist. We\'ll notify you at launch!';
}

/* =============================================
   FORM SUBMIT
   ============================================= */
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = form.email.value.trim().toLowerCase();
    const city  = form.city.value.trim();

    // Reset status
    statusEl.textContent = '';
    statusEl.className   = 'status';

    // Basic validation
    if (!email || !city) {
      statusEl.textContent = '⚠️ Please enter both your email and city.';
      statusEl.className   = 'status error';
      return;
    }

    // Already joined (local)
    if (localStorage.getItem('railquick_waitlist_email') === email) {
      statusEl.textContent = '✅ You\'re already on the waitlist!';
      return;
    }

    // Loading
    submitBtn.disabled   = true;
    btnLabel.textContent = 'Adding you to the list…';

    try {
      const res  = await fetch('/api/waitlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, city }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');

      // Persist and show success modal
      localStorage.setItem('railquick_waitlist_email', email);
      form.reset();
      openModal(successModal);

    } catch (err) {
      statusEl.textContent = `⚠️ ${err.message}`;
      statusEl.className   = 'status error';
    } finally {
      submitBtn.disabled   = false;
      btnLabel.textContent = 'Notify Me When We Launch';
    }
  });
}
