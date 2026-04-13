/**
 * library.js — My Library view: scan, add, filter, and manage books.
 */

const Library = (() => {
  let allBooks     = [];
  let activeFilter = 'all';
  let selectedFile = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function isUnknownAuthor(book) {
    return !book.author || book.author.trim().toLowerCase() === 'unknown author';
  }

  function googleSearchUrl(book) {
    const q = encodeURIComponent(`${book.title} ${book.author || ''} book`.trim());
    return `https://www.google.com/search?q=${q}`;
  }

  // ── Missing authors section ───────────────────────────────────────────────
  function renderMissingAuthors() {
    const section  = document.getElementById('missing-authors-section');
    const list     = document.getElementById('missing-authors-list');
    const countEl  = document.getElementById('missing-authors-count');
    const missing  = allBooks.filter(isUnknownAuthor);

    if (missing.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    countEl.textContent = `${missing.length} book${missing.length !== 1 ? 's' : ''}`;
    list.innerHTML = '';

    missing.forEach((book) => {
      const card = document.createElement('div');
      card.className = 'missing-card';
      card.dataset.id = book.id;
      card.innerHTML = `
        <div class="missing-card-title">${escapeHtml(book.title)}</div>
        <div class="missing-card-row">
          <input class="missing-author-input edit-input"
                 placeholder="Add author name…"
                 value=""
                 data-id="${book.id}" />
          <a class="book-search-link missing-search-link"
             href="${googleSearchUrl(book)}"
             target="_blank" rel="noopener noreferrer">🔍 Search</a>
          <button class="btn-primary missing-save-btn" data-id="${book.id}">Save</button>
        </div>
      `;

      const input   = card.querySelector('.missing-author-input');
      const saveBtn = card.querySelector('.missing-save-btn');

      // Save on button click or Enter key
      async function save() {
        const author = input.value.trim();
        if (!author) { input.focus(); return; }
        saveBtn.disabled = true;
        try {
          const updated = await api.books.update(book.id, { author });
          updateLocal(updated);
          renderMissingAuthors();
          renderBooks();
          App.toast('Author saved!', 'success');
        } catch (err) {
          App.toast(err.message, 'error');
          saveBtn.disabled = false;
        }
      }

      saveBtn.addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

      list.appendChild(card);
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderBooks() {
    const grid = document.getElementById('book-grid');
    grid.innerHTML = '';

    const filtered = allBooks
      .filter((book) => {
        if (activeFilter === 'reading')     return book.is_currently_reading;
        if (activeFilter === 'available')   return book.is_available && !book.is_currently_reading;
        if (activeFilter === 'unavailable') return !book.is_available;
        return true;
      })
      .sort((a, b) => b.is_currently_reading - a.is_currently_reading);

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="empty-state">No books match this filter.</p>';
      return;
    }

    filtered.forEach((book) => grid.appendChild(buildBookCard(book)));
  }

  function buildBookCard(book) {
    const unknownAuthor = isUnknownAuthor(book);

    const card = document.createElement('div');
    card.className = [
      'book-card',
      !book.is_available        ? 'unavailable'       : '',
      book.is_currently_reading ? 'currently-reading' : '',
      unknownAuthor             ? 'unknown-author'     : '',
    ].join(' ').trim();
    card.dataset.id = book.id;

    const badges = [];
    if (book.is_currently_reading) badges.push('<span class="badge badge-reading">Reading</span>');
    if (book.is_available)          badges.push('<span class="badge badge-available">Available</span>');
    else                             badges.push('<span class="badge badge-unavailable">Unavailable</span>');

    card.innerHTML = `
      <!-- Display mode -->
      <div class="book-display">
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-author${unknownAuthor ? ' author-missing' : ''}">
          ${unknownAuthor ? '⚠️ Unknown author — click ✏️ to edit' : escapeHtml(book.author)}
        </div>
        <div class="book-badges">${badges.join('')}</div>
        <a class="book-search-link" href="${googleSearchUrl(book)}" target="_blank" rel="noopener noreferrer">
          🔍 Search on Google
        </a>
      </div>

      <!-- Edit mode (hidden by default) -->
      <div class="book-edit hidden">
        <input class="edit-input" data-field="title"  value="${escapeHtml(book.title)}"       placeholder="Title *" />
        <input class="edit-input" data-field="author" value="${escapeHtml(book.author || '')}" placeholder="Author" />
        <div class="edit-actions">
          <button class="btn-primary edit-save-btn" data-action="save-edit" data-id="${book.id}">Save</button>
          <button class="btn-ghost"  data-action="cancel-edit">Cancel</button>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="book-actions">
        <button class="btn-icon" data-action="edit" data-id="${book.id}" title="Edit title / author">✏️ Edit</button>
        <button class="btn-icon" data-action="reading" data-id="${book.id}" data-val="${!book.is_currently_reading}">
          ${book.is_currently_reading ? '📖 Reading' : '📗 Start reading'}
        </button>
        ${!book.is_currently_reading ? `
        <button class="btn-icon" data-action="available" data-id="${book.id}" data-val="${!book.is_available}">
          ${book.is_available ? '🔒 Unavailable' : '✅ Available'}
        </button>` : ''}
        <button class="btn-icon" data-action="delete" data-id="${book.id}" title="Remove">🗑</button>
      </div>
    `;

    card.querySelectorAll('[data-action]').forEach((btn) =>
      btn.addEventListener('click', handleBookAction)
    );

    return card;
  }

  // ── Book actions ──────────────────────────────────────────────────────────
  async function handleBookAction(e) {
    const { action, id, val } = e.currentTarget.dataset;
    const card = e.currentTarget.closest('.book-card');

    try {
      if (action === 'edit') {
        // Toggle into edit mode
        card.querySelector('.book-display').classList.add('hidden');
        card.querySelector('.book-edit').classList.remove('hidden');
        card.querySelector('.book-actions').classList.add('hidden');
        card.querySelector('[data-field="title"]').focus();

      } else if (action === 'cancel-edit') {
        card.querySelector('.book-display').classList.remove('hidden');
        card.querySelector('.book-edit').classList.add('hidden');
        card.querySelector('.book-actions').classList.remove('hidden');

      } else if (action === 'save-edit') {
        const title  = card.querySelector('[data-field="title"]').value.trim();
        const author = card.querySelector('[data-field="author"]').value.trim();
        if (!title) return App.toast('Title cannot be empty.', 'error');

        const updated = await api.books.update(id, { title, author: author || null });
        updateLocal(updated);
        renderBooks();
        App.toast('Book updated!', 'success');

      } else if (action === 'delete') {
        if (!confirm('Remove this book from your library?')) return;
        await api.books.remove(id);
        allBooks = allBooks.filter((b) => b.id !== parseInt(id, 10));
        renderBooks();
        App.toast('Book removed.', 'success');

      } else if (action === 'reading') {
        const updated = await api.books.update(id, { is_currently_reading: val === 'true' });
        updateLocal(updated);
        renderBooks();

      } else if (action === 'available') {
        const updated = await api.books.update(id, { is_available: val === 'true' });
        updateLocal(updated);
        renderBooks();
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  function updateLocal(updated) {
    const idx = allBooks.findIndex((b) => b.id === updated.id);
    if (idx !== -1) allBooks[idx] = updated;
  }

  // ── Filter bar ────────────────────────────────────────────────────────────
  function initFilters() {
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderBooks();
      });
    });
  }

  // ── Scan (image upload + AI) ──────────────────────────────────────────────
  function initScan() {
    const dropZone   = document.getElementById('drop-zone');
    const fileInput  = document.getElementById('file-input');
    const previewImg = document.getElementById('preview-img');
    const scanBtn    = document.getElementById('scan-btn');
    const scanStatus = document.getElementById('scan-status');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) selectFile(file);
    });

    dropZone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'LABEL') fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) selectFile(fileInput.files[0]);
    });

    function selectFile(file) {
      selectedFile = file;
      previewImg.src = URL.createObjectURL(file);
      previewImg.classList.remove('hidden');
      scanBtn.classList.remove('hidden');
      scanStatus.classList.add('hidden');
    }

    scanBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      scanBtn.disabled    = true;
      scanBtn.textContent = '⏳ Scanning…';
      scanStatus.className = 'scan-status';
      scanStatus.classList.remove('hidden');
      scanStatus.textContent = 'Sending image to AI — this may take a few seconds…';

      try {
        const formData = new FormData();
        formData.append('image', selectedFile);
        const result = await api.scan.upload(formData);

        scanStatus.classList.add('success');
        scanStatus.textContent =
          `✅ Found ${result.detected} book${result.detected !== 1 ? 's' : ''}, added ${result.saved} to your library.`;

        allBooks = [...result.books, ...allBooks];
        renderMissingAuthors();
        renderBooks();

        selectedFile = null;
        previewImg.classList.add('hidden');
        previewImg.src = '';
        fileInput.value = '';
        scanBtn.classList.add('hidden');
      } catch (err) {
        scanStatus.textContent = `❌ ${err.message}`;
      } finally {
        scanBtn.disabled    = false;
        scanBtn.textContent = '🔍 Scan with AI';
      }
    });
  }

  // ── Add book manually ─────────────────────────────────────────────────────
  function initAddBook() {
    const form      = document.getElementById('add-book-form');
    const showBtn   = document.getElementById('add-book-btn');
    const cancelBtn = document.getElementById('cancel-book-btn');
    const saveBtn   = document.getElementById('save-book-btn');

    showBtn.addEventListener('click', () => form.classList.remove('hidden'));
    cancelBtn.addEventListener('click', () => form.classList.add('hidden'));

    saveBtn.addEventListener('click', async () => {
      const title  = document.getElementById('new-title').value.trim();
      const author = document.getElementById('new-author').value.trim();
      if (!title) return App.toast('Title is required.', 'error');

      try {
        const book = await api.books.add({ title, author: author || undefined });
        allBooks = [book, ...allBooks];
        renderBooks();
        form.classList.add('hidden');
        document.getElementById('new-title').value  = '';
        document.getElementById('new-author').value = '';
        App.toast('Book added!', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  // ── Invite modal ──────────────────────────────────────────────────────────
  function initInvites() {
    const modal      = document.getElementById('invite-modal');
    const openBtn    = document.getElementById('invite-btn');
    const cancelBtn  = document.getElementById('cancel-invite-btn');
    const sendBtn    = document.getElementById('send-invite-btn');
    const usernameInput = document.getElementById('invite-username');
    const result        = document.getElementById('invite-result');

    openBtn.addEventListener('click', () => {
      result.classList.add('hidden');
      usernameInput.value = '';
      document.getElementById('invite-message').value = '';
      modal.classList.remove('hidden');
    });
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('copy-site-info-btn').addEventListener('click', () => {
      const siteUrl = window.location.origin;
      const text = `Hey! I've been using this app called Neighborhood Library — you can browse what nearby readers have on their shelves, see what people are currently reading, and connect with them to talk about books. It's free to join: ${siteUrl}`;
      navigator.clipboard.writeText(text);
      App.toast('Copied!', 'success');
    });

    sendBtn.addEventListener('click', async () => {
      const username = usernameInput.value.trim();
      const message  = document.getElementById('invite-message').value.trim();
      if (!username) return App.toast('Enter a username.', 'error');

      sendBtn.disabled = true;
      try {
        const data = await api.invites.send({ to_username: username, message: message || undefined });
        const link = data.invite_link;

        result.classList.remove('hidden');
        result.innerHTML = `
          <div class="invite-result-label">If that username exists, we'll send them a connection request. Copy your invite link to share directly:</div>
          <div class="invite-copy-row">
            <button class="btn-ghost invite-copy-btn" data-text="${escapeHtml(link)}">📋 Copy link</button>
          </div>
        `;
        result.querySelectorAll('.invite-copy-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.text);
            App.toast('Copied!', 'success');
          });
        });
      } catch {
        // Don't reveal whether the username exists — show the same neutral message
        result.classList.remove('hidden');
        result.innerHTML = `<div class="invite-result-label">If that username exists, we'll send them a connection request.</div>`;
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  // ── Shared libraries section ──────────────────────────────────────────────
  async function loadSharedLibraries() {
    try {
      const shared  = await api.invites.shared();
      const section = document.getElementById('shared-libraries-section');
      const list    = document.getElementById('shared-libraries-list');

      if (shared.length === 0) {
        section.classList.add('hidden');
        return;
      }

      section.classList.remove('hidden');
      list.innerHTML = '';

      shared.forEach((user) => {
        const card = document.createElement('div');
        card.className = 'shared-card';
        const contactHtml = buildContactHtml(user);
        card.innerHTML = `
          <div class="shared-card-name">${escapeHtml(user.username)}</div>
          ${user.bio ? `<div class="shared-card-bio">${escapeHtml(user.bio)}</div>` : ''}
          <div class="shared-card-meta">
            ${user.book_count} book${user.book_count !== 1 ? 's' : ''}
            ${user.reading_count > 0
              ? ` · <span class="shared-reading">📖 ${user.reading_count} reading</span>`
              : ''}
          </div>
          ${contactHtml}
          <div class="shared-card-actions">
            <button class="btn-secondary shared-view-btn">View Library →</button>
            <button class="btn-ghost shared-disconnect-btn">✕ Disconnect</button>
          </div>
        `;
        card.querySelector('.shared-view-btn').addEventListener('click', () => {
          App.showView('user-library', user.username);
        });
        card.querySelector('.shared-disconnect-btn').addEventListener('click', async () => {
          if (!confirm(`Remove your connection with ${user.username}? You'll no longer see each other's contact details.`)) return;
          try {
            await api.invites.disconnect(user.username);
            App.toast(`Disconnected from ${user.username}.`, '');
            loadSharedLibraries();
          } catch (err) {
            App.toast(err.message, 'error');
          }
        });
        list.appendChild(card);
      });
    } catch (err) {
      console.warn('Could not load shared libraries:', err.message);
    }
  }

  // ── Pending invites inbox ─────────────────────────────────────────────────
  async function loadInbox() {
    try {
      const invites = await api.invites.received();
      const inbox   = document.getElementById('invites-inbox');
      const badge   = document.getElementById('inbox-count');
      const list    = document.getElementById('inbox-list');

      if (invites.length === 0) {
        inbox.classList.add('hidden');
        return;
      }

      inbox.classList.remove('hidden');
      badge.textContent = invites.length;

      list.innerHTML = '';
      invites.forEach((inv) => {
        const item = document.createElement('div');
        item.className = 'inbox-item';
        item.dataset.id = inv.id;
        item.innerHTML = `
          <div class="inbox-from">
            <strong>${escapeHtml(inv.from_username)}</strong> wants to connect — share contact details and talk about books together
          </div>
          ${inv.message ? `<div class="inbox-message">"${escapeHtml(inv.message)}"</div>` : ''}
          <div class="inbox-actions">
            <button class="btn-primary inbox-accept" data-id="${inv.id}"
                    data-username="${escapeHtml(inv.from_username)}">✅ Accept</button>
            <button class="btn-ghost  inbox-decline" data-id="${inv.id}">✕ Decline</button>
          </div>
        `;

        item.querySelector('.inbox-accept').addEventListener('click', async (e) => {
          const { id, username } = e.currentTarget.dataset;
          try {
            await api.invites.acceptById(id);
            item.remove();
            updateInboxCount();
            loadSharedLibraries(); // show the new library immediately
            App.toast(`Connected with ${username}! You can now see each other's contact details.`, 'success');
            setTimeout(() => App.showView('user-library', username), 1200);
          } catch (err) {
            App.toast(err.message, 'error');
          }
        });

        item.querySelector('.inbox-decline').addEventListener('click', async (e) => {
          const { id } = e.currentTarget.dataset;
          try {
            await api.invites.decline(id);
            item.remove();
            updateInboxCount();
            App.toast('Invite declined.', '');
          } catch (err) {
            App.toast(err.message, 'error');
          }
        });

        list.appendChild(item);
      });
    } catch (err) {
      // Silently ignore — inbox is non-critical
      console.warn('Could not load invites inbox:', err.message);
    }
  }

  function updateInboxCount() {
    const remaining = document.querySelectorAll('.inbox-item').length;
    const badge = document.getElementById('inbox-count');
    badge.textContent = remaining;
    if (remaining === 0) {
      document.getElementById('invites-inbox').classList.add('hidden');
    }
  }

  function initInbox() {
    const toggleBtn = document.getElementById('inbox-toggle-btn');
    const list      = document.getElementById('inbox-list');
    toggleBtn.addEventListener('click', () => {
      const open = !list.classList.contains('hidden');
      list.classList.toggle('hidden', open);
      toggleBtn.textContent = open ? 'Show' : 'Hide';
    });
  }

  // ── Load & init ───────────────────────────────────────────────────────────
  async function load() {
    try {
      allBooks = await api.books.list();
      renderMissingAuthors();
      renderBooks();
      loadSharedLibraries(); // non-blocking
      loadInbox();           // non-blocking
    } catch (err) {
      App.toast('Failed to load library: ' + err.message, 'error');
    }
  }

  function init() {
    initFilters();
    initScan();
    initAddBook();
    initInvites();
    initInbox();
  }

  // ── Another user's library (read-only) ────────────────────────────────────
  async function showUserLibrary(username) {
    const title = document.getElementById('user-library-title');
    const grid  = document.getElementById('user-book-grid');
    title.textContent = 'Loading…';
    grid.innerHTML = '';

    try {
      const { user, books: rawBooks } = await api.users.getProfile(username);
      const books = [...rawBooks].sort((a, b) => b.is_currently_reading - a.is_currently_reading);
      title.textContent = `${user.username}'s Library`;

      const contactHtml = buildContactHtml(user);
      if (contactHtml) {
        const contactEl = document.createElement('div');
        contactEl.className = 'user-library-contact';
        contactEl.innerHTML = contactHtml;
        grid.before(contactEl);
      }

      if (books.length === 0) {
        grid.innerHTML = '<p class="empty-state">No books in this library.</p>';
        return;
      }

      books.forEach((book) => {
        const card = document.createElement('div');
        card.className = 'book-card';
        const badges = [];
        if (book.is_currently_reading) badges.push('<span class="badge badge-reading">Reading</span>');
        if (book.is_available)         badges.push('<span class="badge badge-available">Available</span>');
        else                            badges.push('<span class="badge badge-unavailable">Unavailable</span>');

        card.innerHTML = `
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-author">${escapeHtml(book.author || 'Unknown author')}</div>
          <div class="book-badges">${badges.join('')}</div>
          <a class="book-search-link" href="${googleSearchUrl(book)}" target="_blank" rel="noopener noreferrer">
            🔍 Search on Google
          </a>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      title.textContent = 'Error';
      grid.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  // ── Contact info helper ───────────────────────────────────────────────────
  function buildContactHtml(user) {
    const parts = [];
    if (user.phone) {
      const href = `https://wa.me/${user.phone.replace(/\D/g, '')}`;
      parts.push(`
        <a class="contact-link contact-whatsapp" href="${href}" target="_blank" rel="noopener noreferrer">
          💬 WhatsApp
        </a>
      `);
    }
    if (user.telegram_username) {
      const handle = user.telegram_username.replace(/^@/, '');
      parts.push(`
        <a class="contact-link contact-telegram" href="https://t.me/${encodeURIComponent(handle)}"
           target="_blank" rel="noopener noreferrer">
          ✈️ Telegram @${escapeHtml(handle)}
        </a>
      `);
    }
    if (parts.length === 0) return '';
    return `<div class="contact-links">${parts.join('')}</div>`;
  }

  return { init, load, showUserLibrary };
})();

// Global escapeHtml used by map.js too
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
