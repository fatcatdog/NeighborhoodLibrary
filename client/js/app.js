/**
 * app.js — main controller: session check, view routing, toast notifications.
 *
 * Loaded last so it can reference Library, NearbyMap, and Auth.
 */

const App = (() => {
  let currentUser = null;

  // ── Toast ──────────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className   = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
  }

  // ── View routing ──────────────────────────────────────────────────────────
  // Supported view ids: 'auth', 'library', 'map', 'profile', 'user-library'
  function showView(name, ...args) {
    // Hide all views
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    // Update nav active state
    document.querySelectorAll('.nav-btn[data-target]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.target === name);
    });

    const view = document.getElementById(`${name}-view`);
    if (view) view.classList.remove('hidden');

    // Per-view side effects
    if (name === 'library') {
      Library.load();
    } else if (name === 'map') {
      NearbyMap.init();
    } else if (name === 'profile') {
      loadProfile();
    } else if (name === 'user-library') {
      const username = args[0];
      if (username) Library.showUserLibrary(username);
    }
  }

  // ── Profile view ──────────────────────────────────────────────────────────
  async function loadProfile() {
    try {
      const user = await api.users.me();
      currentUser = user;

      const form = document.getElementById('profile-form');
      form.email.value              = user.email;
      form.username.value           = user.username;
      form.bio.value                = user.bio || '';
      form.is_public.checked        = !!user.is_public;
      form.phone.value              = user.phone || '';
      form.phone_public.checked     = !!user.phone_public;
      form.telegram_username.value  = user.telegram_username || '';
      form.telegram_public.checked  = !!user.telegram_public;

      const locStatus = document.getElementById('location-status');
      if (user.latitude && user.longitude) {
        locStatus.textContent = `📍 Location saved (${parseFloat(user.latitude).toFixed(4)}, ${parseFloat(user.longitude).toFixed(4)})`;
        locStatus.className = 'location-status success';
      } else {
        locStatus.textContent = 'No location saved yet.';
        locStatus.className = 'location-status';
      }

      await loadInvites();
    } catch (err) {
      toast('Failed to load profile: ' + err.message, 'error');
    }
  }

  function initProfile() {
    // Save profile
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form    = e.target;
      const errEl   = document.getElementById('profile-error');
      errEl.classList.add('hidden');

      // Can't be a public profile without a saved location — the map won't show you.
      if (form.is_public.checked && !currentUser?.latitude) {
        errEl.textContent = 'Please save your location before making your profile public.';
        errEl.classList.remove('hidden');
        return;
      }

      try {
        const username = form.username.value.trim();
      if (!username) {
        errEl.textContent = 'Username cannot be empty.';
        errEl.classList.remove('hidden');
        return;
      }

      currentUser = await api.users.updateMe({
          username,
          bio:               form.bio.value.trim() || null,
          is_public:         form.is_public.checked,
          phone:             form.phone.value.trim() || null,
          phone_public:      form.phone_public.checked,
          telegram_username: form.telegram_username.value.trim().replace(/^@/, '') || null,
          telegram_public:   form.telegram_public.checked,
        });
        toast('Profile saved!', 'success');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    // Update location
    document.getElementById('share-location-btn').addEventListener('click', () => {
      if (!navigator.geolocation) {
        toast('Geolocation not supported by your browser.', 'error');
        return;
      }

      const locStatus = document.getElementById('location-status');
      locStatus.textContent = 'Fetching location…';
      locStatus.className = 'location-status';

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await api.users.updateMe({
              latitude:  pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            locStatus.textContent = `📍 Location updated! (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
            locStatus.className = 'location-status success';
            toast('Location updated!', 'success');
          } catch (err) {
            locStatus.textContent = 'Failed to save location.';
            locStatus.className = 'location-status error';
          }
        },
        () => {
          locStatus.textContent = 'Location access denied.';
          locStatus.className = 'location-status error';
        }
      );
    });
  }

  async function loadInvites() {
    const list = document.getElementById('invites-list');

    try {
      const invites = await api.invites.list();
      list.innerHTML = '';

      if (invites.length === 0) {
        list.innerHTML = '<p class="empty-state">No connection requests sent yet.</p>';
        return;
      }

      invites.forEach((inv) => {
        const item = document.createElement('div');
        item.className = 'invite-item';
        const inviteLink = `${window.location.origin}/invite/${inv.token}`;
        const msgText    = `Hey! I'd like to connect with you on Neighborhood Library so we can share contact details and talk about books together. Join me here: ${inviteLink}`;

        item.innerHTML = `
          <div class="invite-email">${escapeHtml(inv.to_email)}</div>
          <div class="invite-status">${inv.accepted ? '✅ Accepted' : '⏳ Pending'}</div>
          ${!inv.accepted ? `
            <div class="invite-copy-row">
              <button class="btn-ghost invite-copy-btn" data-link="${inviteLink}">📋 Copy link</button>
              <button class="btn-ghost invite-copy-btn" data-link="${msgText}">💬 Copy with message</button>
            </div>
          ` : ''}
        `;

        if (!inv.accepted) {
          item.querySelectorAll('.invite-copy-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              navigator.clipboard.writeText(btn.dataset.link);
              App.toast('Copied!', 'success');
            });
          });
        }

        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = '<p class="empty-state">Could not load invites.</p>';
    }
  }

  // ── Invite token handling ─────────────────────────────────────────────────
  // If URL is /invite/:token, store a flag and let the user accept via the inbox.
  function handleInviteToken() {
    const match = window.location.pathname.match(/^\/invite\/([a-f0-9-]{36})$/i);
    if (!match) return;
    sessionStorage.setItem('bmb_pending_invite', '1');
    history.replaceState(null, '', '/');
  }

  // ── Session bootstrap ─────────────────────────────────────────────────────
  async function bootstrap() {
    handleInviteToken();

    const storedUser = Auth.getStoredUser();
    const token      = localStorage.getItem('bmb_token');

    if (storedUser && token) {
      // Verify the token is still valid by fetching /me
      try {
        currentUser = await api.users.me();
        enterApp(currentUser);

        // If we arrived via an invite link, go straight to that user's library
        const afterUsername = sessionStorage.getItem('bmb_after_auth_username');
        if (afterUsername) {
          sessionStorage.removeItem('bmb_after_auth_username');
          showView('user-library', afterUsername);
        }
      } catch {
        // Token is stale — back to auth
        Auth.clearSession();
        showAuthView();
      }
    } else {
      showAuthView();
    }
  }

  function showAuthView() {
    document.getElementById('nav').classList.add('hidden');
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById('auth-view').classList.remove('hidden');
    // Show invite explanation banner if user arrived via an invite link
    const notice = document.getElementById('invite-notice');
    if (sessionStorage.getItem('bmb_pending_invite')) {
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  function enterApp(user) {
    currentUser = user;
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('nav').classList.remove('hidden');
    showView('library');
    // If they arrived via invite link, nudge them toward the inbox
    if (sessionStorage.getItem('bmb_pending_invite')) {
      sessionStorage.removeItem('bmb_pending_invite');
      setTimeout(() => toast('You have a pending connection request — check your inbox below!', 'success'), 600);
    }
  }

  // ── Nav buttons ───────────────────────────────────────────────────────────
  function initNav() {
    document.querySelectorAll('.nav-btn[data-target]').forEach((btn) => {
      btn.addEventListener('click', () => showView(btn.dataset.target));
    });
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  function init() {
    Auth.initTabs();
    Auth.initSignIn((user) => enterApp(user));
    Auth.initSignUp((user) => enterApp(user));
    Auth.initSignOut(() => {
      currentUser = null;
      showAuthView();
    });

    Library.init();
    initProfile();
    initNav();
    document.getElementById('back-btn').addEventListener('click', () => showView('map'));

    bootstrap();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showView, toast };
})();
