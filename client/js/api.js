/**
 * api.js — thin fetch wrapper for the Neighborhood Library REST API.
 *
 * Every method returns the parsed JSON body on success, or throws an Error
 * whose .message is the server's { error: "..." } string.
 */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('bmb_token');
}

/**
 * Core request helper.
 * @param {string} method   HTTP verb
 * @param {string} endpoint Path under /api (e.g. '/books')
 * @param {object|FormData|null} body
 */
async function request(method, endpoint, body = null) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const isFormData = body instanceof FormData;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

// ── Public API object ───────────────────────────────────────────────────────
const api = {
  auth: {
    signup: (body)  => request('POST', '/auth/signup', body),
    signin: (body)  => request('POST', '/auth/signin', body),
  },

  users: {
    me:         ()       => request('GET',   '/users/me'),
    updateMe:   (body)   => request('PATCH', '/users/me', body),
    getProfile: (username) => request('GET', `/users/${encodeURIComponent(username)}`),
  },

  books: {
    list:   ()         => request('GET',    '/books'),
    add:    (body)     => request('POST',   '/books', body),
    update: (id, body) => request('PATCH',  `/books/${id}`, body),
    remove: (id)       => request('DELETE', `/books/${id}`),
  },

  scan: {
    // body should be a FormData with field "image"
    upload: (formData) => request('POST', '/scan', formData),
  },

  nearby: {
    list: (lat, lng, radius = 25) =>
      request('GET', `/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  },

  invites: {
    send:       (body)  => request('POST', '/invites', body),
    list:       ()      => request('GET',  '/invites'),
    shared:     ()      => request('GET',  '/invites/shared'),
    received:   ()      => request('GET',  '/invites/received'),
    acceptById:  (id)       => request('POST',   `/invites/${id}/accept`),
    decline:     (id)       => request('POST',   `/invites/${id}/decline`),
    accept:      (token)    => request('GET',    `/invites/accept/${token}`),
    disconnect:  (username) => request('DELETE', `/invites/connection/${encodeURIComponent(username)}`),
  },
};
