/**
 * auth.js — handles the sign-in / sign-up view and session state.
 */

const Auth = (() => {
  // ── Helpers ───────────────────────────────────────────────────────────────
  function saveSession(token, user) {
    localStorage.setItem('bmb_token', token);
    localStorage.setItem('bmb_user',  JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem('bmb_token');
    localStorage.removeItem('bmb_user');
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('bmb_user'));
    } catch {
      return null;
    }
  }

  function showError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideError(elementId) {
    document.getElementById(elementId).classList.add('hidden');
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  function initTabs() {
    const tabBtns   = document.querySelectorAll('.tab-btn');
    const signinForm = document.getElementById('signin-form');
    const signupForm = document.getElementById('signup-form');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.tab === 'signin') {
          signinForm.classList.remove('hidden');
          signupForm.classList.add('hidden');
        } else {
          signinForm.classList.add('hidden');
          signupForm.classList.remove('hidden');
        }
      });
    });
  }

  // ── Sign In ───────────────────────────────────────────────────────────────
  function initSignIn(onSuccess) {
    document.getElementById('signin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError('signin-error');

      const { email, password } = Object.fromEntries(new FormData(e.target));

      try {
        const { token, user } = await api.auth.signin({ email, password });
        saveSession(token, user);
        onSuccess(user);
      } catch (err) {
        showError('signin-error', err.message);
      }
    });
  }

  // ── Sign Up ───────────────────────────────────────────────────────────────
  function initSignUp(onSuccess) {
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError('signup-error');

      const { username, email, password } = Object.fromEntries(new FormData(e.target));

      try {
        const { token, user } = await api.auth.signup({ username, email, password });
        saveSession(token, user);
        onSuccess(user);
      } catch (err) {
        showError('signup-error', err.message);
      }
    });
  }

  // ── Sign Out ──────────────────────────────────────────────────────────────
  function initSignOut(onSignOut) {
    document.getElementById('signout-btn').addEventListener('click', () => {
      clearSession();
      onSignOut();
    });
  }

  // ── Public interface ──────────────────────────────────────────────────────
  return { initTabs, initSignIn, initSignUp, initSignOut, getStoredUser, clearSession };
})();
