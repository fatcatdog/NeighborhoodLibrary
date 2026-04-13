/**
 * map.js — Nearby view: Leaflet map + user detail panel with currently-reading
 *           books and an inline invite form.
 */

const NearbyMap = (() => {
  let leafletMap    = null;
  let userMarker    = null;
  let nearbyMarkers = [];
  let userCoords    = null;
  let selectedUser  = null; // { username, ... } currently shown in detail panel

  // ── Icons ─────────────────────────────────────────────────────────────────
  const selfIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1">📍</div>',
    iconSize: [28, 28], iconAnchor: [14, 28],
  });

  const readerIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:24px;line-height:1">📚</div>',
    iconSize: [24, 24], iconAnchor: [12, 24],
  });

  // ── Map init ──────────────────────────────────────────────────────────────
  function initMap() {
    if (leafletMap) return;
    leafletMap = L.map('map-container').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(leafletMap);
  }

  // ── Radius slider ─────────────────────────────────────────────────────────
  function initRadiusSlider() {
    const slider = document.getElementById('radius-input');
    const label  = document.getElementById('radius-label');
    slider.addEventListener('input', () => { label.textContent = slider.value; });
    let timer;
    slider.addEventListener('change', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (userCoords) loadNearby(userCoords.lat, userCoords.lng); }, 300);
    });
  }

  // ── Geolocation ───────────────────────────────────────────────────────────
  function requestLocation() {
    if (!navigator.geolocation) {
      App.toast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        userCoords = { lat, lng };
        leafletMap.setView([lat, lng], 12);
        if (userMarker) {
          userMarker.setLatLng([lat, lng]);
        } else {
          userMarker = L.marker([lat, lng], { icon: selfIcon })
            .addTo(leafletMap)
            .bindPopup('<strong>You are here</strong>');
        }
        await loadNearby(lat, lng);
      },
      () => App.toast('Location access denied or unavailable.', 'error'),
      { timeout: 10000 }
    );
  }

  // ── Load nearby ───────────────────────────────────────────────────────────
  async function loadNearby(lat, lng) {
    const radius = document.getElementById('radius-input').value;
    try {
      const users = await api.nearby.list(lat, lng, radius);
      renderSidebar(users);
      renderMarkers(users);
    } catch (err) {
      App.toast('Failed to load nearby users: ' + err.message, 'error');
    }
  }

  // ── Sidebar: nearby list ──────────────────────────────────────────────────
  function renderSidebar(users) {
    const list = document.getElementById('nearby-list');
    list.innerHTML = '';

    if (users.length === 0) {
      list.innerHTML = '<p class="empty-state">No public readers found nearby. Try increasing the radius.</p>';
      return;
    }

    users.forEach((user) => {
      const card = document.createElement('div');
      card.className = 'nearby-card';
      card.innerHTML = `
        <div class="nc-name">${escapeHtml(user.username)}</div>
        <div class="nc-dist">${user.distance_km} km away</div>
        <div class="nc-books">${user.book_count} book${user.book_count !== 1 ? 's' : ''} in library</div>
      `;
      card.addEventListener('click', () => showUserDetail(user.username));
      list.appendChild(card);
    });
  }

  // ── Map markers ───────────────────────────────────────────────────────────
  function renderMarkers(users) {
    nearbyMarkers.forEach((m) => m.remove());
    nearbyMarkers = [];

    users.forEach((user) => {
      const marker = L.marker(
        [parseFloat(user.latitude), parseFloat(user.longitude)],
        { icon: readerIcon }
      ).addTo(leafletMap).bindPopup(`
        <strong>${escapeHtml(user.username)}</strong><br/>
        ${user.book_count} book${user.book_count !== 1 ? 's' : ''}<br/>
        <a href="#" onclick="NearbyMap.showUserDetail('${escapeHtml(user.username)}');return false;">
          View details →
        </a>
      `);
      nearbyMarkers.push(marker);
    });
  }

  // ── User detail panel ─────────────────────────────────────────────────────
  async function showUserDetail(username) {
    selectedUser = { username };

    // Swap panels
    document.getElementById('nearby-list-panel').classList.add('hidden');
    const panel = document.getElementById('user-detail-panel');
    panel.classList.remove('hidden');

    // Reset invite form and button state while loading
    hideInviteForm();
    const inviteBtn = document.getElementById('detail-invite-btn');
    inviteBtn.textContent = '✉️ Connect';
    inviteBtn.disabled    = false;
    inviteBtn.className   = 'btn-secondary';

    // Populate header placeholders while loading
    document.getElementById('detail-username').textContent = username;
    document.getElementById('detail-bio').textContent = '';
    document.getElementById('detail-reading-list').innerHTML =
      '<p class="empty-state">Loading…</p>';

    try {
      const { user, books, isConnected, pendingInviteSent } = await api.users.getProfile(username);

      document.getElementById('detail-username').textContent = user.username;
      document.getElementById('detail-bio').textContent = user.bio || '';

      // Show correct invite button state
      const inviteBtn = document.getElementById('detail-invite-btn');
      if (isConnected) {
        inviteBtn.textContent  = '✓ Connected';
        inviteBtn.disabled     = true;
        inviteBtn.className    = 'btn-secondary connected-btn';
      } else if (pendingInviteSent) {
        inviteBtn.textContent  = '⏳ Request Sent';
        inviteBtn.disabled     = true;
        inviteBtn.className    = 'btn-secondary';
      } else {
        inviteBtn.textContent  = '✉️ Connect';
        inviteBtn.disabled     = false;
        inviteBtn.className    = 'btn-secondary';
      }

      const readingBooks = books.filter((b) => b.is_currently_reading);
      const readingList  = document.getElementById('detail-reading-list');

      if (readingBooks.length === 0) {
        readingList.innerHTML = '<p class="empty-state">Nothing marked as currently reading.</p>';
      } else {
        readingList.innerHTML = readingBooks.map((b) => `
          <div class="detail-book">
            <span class="detail-book-title">${escapeHtml(b.title)}</span>
            ${b.author ? `<span class="detail-book-author">by ${escapeHtml(b.author)}</span>` : ''}
          </div>
        `).join('');
      }
    } catch (err) {
      document.getElementById('detail-reading-list').innerHTML =
        `<p class="empty-state">${err.message}</p>`;
    }
  }

  function backToList() {
    selectedUser = null;
    document.getElementById('user-detail-panel').classList.add('hidden');
    document.getElementById('nearby-list-panel').classList.remove('hidden');
  }

  // ── Invite form (inline in detail panel) ──────────────────────────────────
  function showInviteForm() {
    const form = document.getElementById('detail-invite-form');
    document.getElementById('detail-invite-target').textContent = selectedUser.username;
    document.getElementById('detail-invite-message').value = '';
    document.getElementById('detail-invite-result').classList.add('hidden');
    form.classList.remove('hidden');
  }

  function hideInviteForm() {
    document.getElementById('detail-invite-form').classList.add('hidden');
    document.getElementById('detail-invite-result').classList.add('hidden');
  }

  async function sendDetailInvite() {
    if (!selectedUser) return;
    const message = document.getElementById('detail-invite-message').value.trim();
    const btn     = document.getElementById('detail-send-invite-btn');
    const result  = document.getElementById('detail-invite-result');

    btn.disabled    = true;
    btn.textContent = 'Sending…';

    try {
      const data = await api.invites.send({
        to_username: selectedUser.username,
        message: message || undefined,
      });
      result.classList.remove('hidden');
      result.innerHTML = `
        ✅ Connection request sent! Share this link:<br/>
        <span class="invite-link-copy"
              onclick="navigator.clipboard.writeText('${data.invite_link}');App.toast('Link copied!','success')">
          ${data.invite_link}
        </span>
        <br/><small>(click to copy)</small>
      `;
      document.getElementById('detail-invite-message').value = '';
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Send Invite';
    }
  }

  // ── Wire up static buttons ────────────────────────────────────────────────
  function initDetailPanel() {
    document.getElementById('back-to-nearby-btn').addEventListener('click', backToList);

    document.getElementById('detail-invite-btn').addEventListener('click', showInviteForm);
    document.getElementById('detail-cancel-invite-btn').addEventListener('click', hideInviteForm);
    document.getElementById('detail-send-invite-btn').addEventListener('click', sendDetailInvite);

    document.getElementById('detail-view-library-btn').addEventListener('click', () => {
      if (selectedUser) App.showView('user-library', selectedUser.username);
    });
  }

  // ── Public init ───────────────────────────────────────────────────────────
  function init() {
    initMap();
    initRadiusSlider();
    initDetailPanel();
    requestLocation();
    setTimeout(() => leafletMap && leafletMap.invalidateSize(), 300);
  }

  return { init, showUserDetail, viewLibrary: (u) => App.showView('user-library', u) };
})();
