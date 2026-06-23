import { API_BASE_URL, TOKEN_KEY } from '../config.js';

function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'Request failed'), {
      status: res.status,
      data,
    });
  }
  return data;
}

export function getPuzzleToday() {
  return request('GET', '/puzzle/today');
}

export function getBirds() {
  return request('GET', '/birds');
}

export function searchBirds(q) {
  return request('GET', `/birds/search?q=${encodeURIComponent(q)}`);
}

export function submitGuess({ puzzleDate, birdCommonName }) {
  return request('POST', '/puzzle/guess', { puzzleDate, birdCommonName });
}

export function getHint(level) {
  return request('GET', `/puzzle/hint?level=${level}`);
}

export function getExtraClue(n) {
  return request('GET', `/puzzle/extra-clue?n=${n}`);
}

export function getPuzzleResult(date) {
  return request('GET', `/puzzle/result?date=${encodeURIComponent(date)}`);
}

export function getGlobalStats(date) {
  return request('GET', `/stats/global?date=${encodeURIComponent(date)}`);
}

const GUEST_ID_KEY = 'aviary_guest_id';

/** Stable per-device id so anonymous game sessions can be deduped server-side. */
export function getOrCreateGuestId() {
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `g_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

/** Persist a completed game to aviary.gamesessions (token auto-attached if logged in). */
export function saveGameSession(payload) {
  return request('POST', '/stats/session', payload);
}

/** Fetch the current user's completed session for today's puzzle (requires auth). */
export function getTodaySession() {
  return request('GET', '/stats/session/today');
}

export function login(email, password) {
  return request('POST', '/auth/login', { email, password });
}

export function register(email, password, firstName, lastName) {
  return request('POST', '/auth/register', { email, password, firstName, lastName });
}

export function getUserStats() {
  return request('GET', '/users/me/stats');
}

export function syncStats(stats) {
  return request('POST', '/users/me/sync', stats);
}

export function resendVerification(email) {
  return request('POST', '/auth/resend-verification', { email });
}

export function forgotPassword(email) {
  return request('POST', '/auth/forgot-password', { email });
}

export function resetPassword(token, newPassword) {
  return request('POST', '/auth/reset-password', { token, newPassword });
}

export function cancelRegistration(email) {
  return request('DELETE', '/auth/cancel-registration', { email });
}

export const getAviaryMe       = ()                        => request('GET',  '/aviary/me');
export const getStarterBirds   = ()                        => request('GET',  '/aviary/birds/starters');
export const postStarterBird   = (birdId)                  => request('POST', '/aviary/starter', { birdId });
export const getShop           = ()                        => request('GET',  '/aviary/shop');
export const purchaseAccessory = (slug)                    => request('POST', '/aviary/shop/purchase', { accessorySlug: slug });
export const equipAccessory    = (birdId, accessoryId)     => request('POST', `/aviary/birds/${birdId}/equip`, { accessoryId });
export const setActiveBird     = (birdId)                  => request('POST', '/aviary/active-bird', { birdId });
export const getBirdInfo       = (birdId)                  => request('GET',  `/aviary/birds/${birdId}/info`);
export const getBerryBalance   = ()                        => request('GET',  '/aviary/feathers');
export const getWikiInfo       = (q)                       => request('GET',  `/wiki?q=${encodeURIComponent(q)}`);
export const saveSession       = (data)                    => request('POST', '/stats/session', data);
