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
    // Carries the signed httpOnly aviary_sid cookie that identifies a guest's
    // game session. Without this the server would mint a new guest on every
    // request and no anonymous game could ever be resumed.
    credentials: 'include',
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

export function getBirds() {
  return request('GET', '/birds');
}

export function searchBirds(q) {
  return request('GET', `/birds/search?q=${encodeURIComponent(q)}`);
}

/**
 * The whole game: puzzle metadata plus this player's server-held session.
 * The only hydration path — nothing about a game is stored in the browser.
 */
export function getGameState() {
  return request('GET', '/puzzle/state');
}

/** Each of these mutates the session server-side and returns the new state. */
export function submitGuess({ birdCommonName }) {
  return request('POST', '/puzzle/guess', { birdCommonName });
}

export function buyHint(level) {
  return request('POST', '/puzzle/hint', { level });
}

export function buyExtraClue() {
  return request('POST', '/puzzle/extra-clue');
}

export function getPuzzleResult(date) {
  return request('GET', `/puzzle/result?date=${encodeURIComponent(date)}`);
}

export function getGlobalStats(date) {
  return request('GET', `/stats/global?date=${encodeURIComponent(date)}`);
}

/** Lifetime stats for the caller — works for guests (cookie) and users (JWT). */
export function getMyStats() {
  return request('GET', '/stats/me');
}

export function login(email, password) {
  return request('POST', '/auth/login', { email, password });
}

export function register(email, password, firstName, lastName) {
  return request('POST', '/auth/register', { email, password, firstName, lastName });
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
