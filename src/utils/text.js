import { BUTTON_LABEL_MAX } from '../config.js';

export function truncateLabel(s, max = BUTTON_LABEL_MAX) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
