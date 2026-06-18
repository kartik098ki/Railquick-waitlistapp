/* ========================================
   RAILQUICK APP.JS — Client-side logic
   ======================================== */

// ---- DOM refs ----
const form            = document.getElementById('waitlistForm');
const statusEl        = document.getElementById('formStatus');
const submitBtn       = document.getElementById('submitButton');
const btnLabel        = document.getElementById('btn-label');
const successModal    = document.getElementById('successModal');
const appModal        = document.getElementById('appModal');

// ---- Countdown timer ----
(function initCountdown() {
  // Launch target: 60 days from current date
  const launchDate = new Date();
  launchDate.setDate(launchDate.getDate() + 60);
  launchDate.setHours(0, 0, 0, 0);

  const cdDays  = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins  = document.getElementById('cd-mins');
  const cdSecs  = document.getElementById('cd-secs');

  function pad(n) { return String(n).padStart(2, '0'); }

  function flipNum(el, newVal) {
    if (el.textContent === newVal) return;
    el.style.transform = 'translateY(-6px)';
    el.style.opacity   = '0';
    setTimeout(() => {
      el.textContent     = newVal;
      el.style.transform = 'translateY(6px)';
      setTimeout(() => {
        el.style.transition = 'all 180ms ease';
        el.style.transform  = 'translateY(0)';
        el.style.opacity    = '1';
      }, 16);
    }, 120);
  }

  function tick() {
    const now  = Date.now();
    const diff = Math.max(0, launchDate.getTime() - now);

    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);
    const secs  = Math.floor((diff % 60000)    / 1000);

    flipNum(cdDays,  pad(days));
    flipNum(cdHours, pad(hours));
    flipNum(cdMins,  pad(mins));
    flipNum(cdSecs,  pad(secs));
  }

  tick();
  setInterval(tick, 1000);
})();

// ---- Floating particles ----
(function spawnParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  const colors = ['rgba(5,191,100,0.6)', 'rgba(255,136,71,0.5)', 'rgba(5,191,100,0.3)', 'rgba(255,255,255,0.2)'];

  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'particle';

    const size = Math.random() * 4 + 1.5;
    const x    = Math.random() * 100;
    const dur  = Math.random() * 18 + 10;
    const del  = Math.random() * -20;
    const col  = colors[Math.floor(Math.random() * colors.length)];

    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}%;
      bottom: -10px;
      background: ${col};
      box-shadow: 0 0 ${size * 3}px ${col};
      animation: float-up ${dur}s ${del}s linear infinite;
      opacity: 0;
    `;
    container.appendChild(p);
  }

  // Inject keyframes dynamically
  const style = document.createElement('style');
  style.textContent = `
    @keyframes float-up {
      0%   { transform: translateY(0) translateX(0); opacity: 0; }
      10%  { opacity: 1; }
      90%  { opacity: 0.6; }
      100% { transform: translateY(-100vh) translateX(${(Math.random()-0.5)*120}px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
})();

// ---- Saved email check ----
const savedEmail = localStorage.getItem('railquick_waitlist_email');
if (savedEmail) {
  statusEl.textContent = '✓ You are already on the RailQuick waitlist. We will notify you at launch.';
  statusEl.className = 'status';
}

// ---- Modal helpers ----
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

// Delegated event handling for modal triggers
document.addEventListener('click', (e) => {
  // Open app modal
  if (e.target.closest('[data-open-app-modal]')) {
    openModal(appModal);
    return;
  }

  // Close success modal
  if (e.target.closest('[data-close-modal]')) {
    closeModal(successModal);
    return;
  }

  // Close app modal
  if (e.target.closest('[data-close-app-modal]')) {
    closeModal(appModal);
    return;
  }
});

// Keyboard close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(successModal);
    closeModal(appModal);
  }
});

// ---- Form submission ----
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = form.email.value.trim().toLowerCase();
  const city  = form.city.value.trim();

  statusEl.className = 'status';
  statusEl.textContent = '';

  if (!email || !city) {
    statusEl.textContent = '⚠️ Please fill in both your email and city.';
    statusEl.className = 'status error';
    return;
  }

  // Already joined (local check)
  if (localStorage.getItem('railquick_waitlist_email') === email) {
    statusEl.textContent = '✓ You are already on the waitlist — your welcome email has been sent!';
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  btnLabel.textContent = 'Joining waitlist…';

  try {
    const res  = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, city }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Something went wrong. Please try again.');
    }

    // Success!
    localStorage.setItem('railquick_waitlist_email', email);
    form.reset();
    openModal(successModal);

  } catch (err) {
    statusEl.textContent = `⚠️ ${err.message}`;
    statusEl.className = 'status error';
  } finally {
    submitBtn.disabled = false;
    btnLabel.textContent = 'Join the Waitlist';
  }
});
