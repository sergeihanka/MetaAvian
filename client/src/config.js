export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const GUESS_LIMIT = 25;
/** Hour (Central Time) at which each new puzzle releases. Must match the server. */
export const RESET_HOUR_CENTRAL = 8;
export const TOKEN_KEY = 'aviary_token';
export const GAME_STATE_KEY_PREFIX = 'aviary_game_';
export const BIRD_LIST_KEY = 'aviary_bird_list';
export const BIRD_LIST_DATE_KEY = 'aviary_bird_list_date';
export const TEMPERATURE_COLORS = {
  correct: '#169A43',
  hot: '#EF2A2A',
  warm: '#E65100',
  cool: '#1495D7',
  cold: '#9E9E9E',
};
export const TEMPERATURE_EMOJIS = {
  correct: '🟩',
  hot: '🟧',
  warm: '🟨',
  cool: '🟦',
  cold: '⬜',
};
