/**
 * @param {string} text
 * @returns {{ cmd0: string; parts: string[] }}
 */
export function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  const cmd0 = parts[0].includes('@')
    ? parts[0].split('@')[0]
    : parts[0];
  return { cmd0, parts };
}
