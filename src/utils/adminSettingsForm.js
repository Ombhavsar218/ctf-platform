/**
 * Pure helpers for the Admin -> Settings form.
 *
 * The backend exposes exactly three runtime settings. Keeping this list in one
 * place prevents unsupported controls from accidentally being sent and makes
 * the defaults explicit when a field is missing from an API response.
 */

export const PLATFORM_SETTING_FIELDS = Object.freeze([
  'allow_registration',
  'public_leaderboard',
  'allow_hints',
]);

export const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  allow_registration: true,
  public_leaderboard: true,
  allow_hints: true,
});

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return Boolean(value);
  return fallback;
}

export function normalizePlatformSettings(data) {
  const source = data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : {};

  return PLATFORM_SETTING_FIELDS.reduce((settings, field) => {
    settings[field] = asBoolean(source[field], DEFAULT_PLATFORM_SETTINGS[field]);
    return settings;
  }, {});
}

export function buildPlatformSettingsPayload(settings) {
  const normalized = normalizePlatformSettings(settings);
  return PLATFORM_SETTING_FIELDS.reduce((payload, field) => {
    payload[field] = normalized[field];
    return payload;
  }, {});
}

export function platformSettingsEqual(left, right) {
  const a = normalizePlatformSettings(left);
  const b = normalizePlatformSettings(right);
  return PLATFORM_SETTING_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Keep only the three supported field errors from a DRF validation response.
 * The generic ApiError message still carries any non-field detail.
 */
export function platformSettingsFieldErrors(error) {
  const data = error && typeof error === 'object' ? error.data : null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  return PLATFORM_SETTING_FIELDS.reduce((errors, field) => {
    const value = data[field];
    if (value == null) return errors;
    const text = Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').join(' ')
      : typeof value === 'string'
        ? value
        : '';
    if (text) errors[field] = text;
    return errors;
  }, {});
}
