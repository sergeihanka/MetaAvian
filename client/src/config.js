export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const GUESS_LIMIT = 20;
export const TOKEN_KEY = 'aviary_token';
export const GAME_STATE_KEY_PREFIX = 'aviary_game_';
export const BIRD_LIST_KEY = 'aviary_bird_list';
export const BIRD_LIST_DATE_KEY = 'aviary_bird_list_date';
export const TEMPERATURE_COLORS = {
  correct: '#2E7D32',
  hot: '#BF360C',
  warm: '#E65100',
  cool: '#0288D1',
  cold: '#9E9E9E',
};
export const TEMPERATURE_EMOJIS = {
  correct: '🟩',
  hot: '🟧',
  warm: '🟨',
  cool: '🟦',
  cold: '⬜',
};
