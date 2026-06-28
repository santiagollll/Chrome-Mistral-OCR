export function msg(key, substitutions) {
  try {
    return chrome?.i18n?.getMessage?.(key, substitutions) || key;
  } catch {
    return key;
  }
}
