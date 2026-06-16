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

export function getPuzzleResult(date) {
  return request('GET', `/puzzle/result?date=${encodeURIComponent(date)}`);
}

export function getGlobalStats(date) {
  return request('GET', `/stats/global?date=${encodeURIComponent(date)}`);
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
