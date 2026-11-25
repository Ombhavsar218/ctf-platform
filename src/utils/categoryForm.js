/**
 * Pure draft helpers for the admin category form.
 *
 * Kept free of React/DOM so the same rules can be exercised by the Node
 * harness. The backend remains authoritative; these checks only avoid an
 * obviously invalid request and keep the modal's fields accessible.
 */

export const CATEGORY_FIELDS = ['name', 'description', 'icon', 'color', 'order'];

export const EMPTY_CATEGORY_DRAFT = Object.freeze({
  name: '',
  description: '',
  icon: '',
  color: '',
  order: 0,
});

export function categoryToDraft(category) {
  return {
    name: category?.name || '',
    description: category?.description || '',
    icon: category?.icon || '',
    color: category?.color || '',
    order: Number.isFinite(Number(category?.order)) ? Number(category.order) : 0,
  };
}

/**
 * Convert the form draft into the small writable payload. The slug is never
 * sent: it is derived by the server and stays stable across renames.
 */
export function buildCategoryPayload(draft) {
  return {
    name: (draft?.name || '').trim(),
    description: (draft?.description || '').trim(),
    icon: (draft?.icon || '').trim(),
    color: (draft?.color || '').trim(),
    order: Number.parseInt(draft?.order, 10),
  };
}

/** Field-level messages that can be rendered beside their controls. */
export function validateCategoryDraft(draft) {
  const errors = {};
  const payload = buildCategoryPayload(draft);

  if (!payload.name) {
    errors.name = 'Enter a category name.';
  } else if (payload.name.length > 100) {
    errors.name = 'Use 100 characters or fewer.';
  }
  if (payload.icon.length > 60) {
    errors.icon = 'Use 60 characters or fewer.';
  }
  if (payload.color.length > 20) {
    errors.color = 'Use 20 characters or fewer.';
  }
  if (!Number.isInteger(payload.order) || payload.order < 0) {
    errors.order = 'Enter a whole number of 0 or more.';
  } else if (payload.order > 2147483647) {
    errors.order = 'Enter a smaller whole number.';
  }

  return errors;
}

/**
 * Pull DRF field errors out of an ApiError body. Unknown fields and `detail`
 * stay in the general message produced by api.js.
 */
export function categoryFieldErrors(data) {
  const errors = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return errors;

  for (const field of CATEGORY_FIELDS) {
    const value = data[field];
    if (value == null) continue;
    const text = Array.isArray(value)
      ? value.filter((part) => typeof part === 'string').join(' ')
      : (typeof value === 'string' ? value : '');
    if (text) errors[field] = text;
  }
  return errors;
}
