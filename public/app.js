/* ============================================================
   RAILQUICK — app.js
   Modal events · Form submit · Countdown removed
   ============================================================ */

/* ============================================================
   MODAL HELPERS
   ============================================================ */
const successModal = document.getElementById('successModal');
const appModal     = document.getElementById('appModal');

function openModal(m) {
  if (!m) return;
  m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(m) {
  if (!m) return;
  m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Delegated click handling for all modal triggers
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-app-modal]'))  { openModal(appModal);      return; }
  if (e.target.closest('[data-close-modal]'))      { closeModal(successModal); return; }
  if (e.target.closest('[data-close-app-modal]')) { closeModal(appModal);     return; }
});

// Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(successModal);
    closeModal(appModal);
  }
});

/* ============================================================
   FORM SUBMIT
   ============================================================ */
const form      = document.getElementById('waitlistForm');
const statusEl  = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitButton');
const btnLabel  = document.getElementById('btn-label');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (form.email.value || '').trim().toLowerCase();
    const city  = (form.city.value  || '').trim();

    // Reset status
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className   = 'form-status';
    }

    // Validate
    if (!email || !city) {
      statusEl.textContent = 'Please fill in both your email address and city.';
      statusEl.className   = 'form-status error';
      return;
    }

    // Loading state
    submitBtn.disabled   = true;
    btnLabel.textContent = 'Adding you to the list…';

    try {
      const res  = await fetch('/api/waitlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, city }),
      });

      let data = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON API response received:", text);
        throw new Error(`Server error (${res.status}): Please check Netlify function logs.`);
      }

      if (!res.ok) {
        throw new Error(data.message || `Server error (${res.status}): Something went wrong.`);
      }

      // Success
      localStorage.setItem('railquick_waitlist_email', email);
      form.reset();
      openModal(successModal);

    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className   = 'form-status error';

    } finally {
      submitBtn.disabled   = false;
      btnLabel.textContent = 'Notify Me at Launch';
    }
  });
}
