/**
 * Persistence workflow for the three runtime platform settings.
 *
 * Saving is deliberately two-step: PATCH the approved values, then read them
 * back. The returned promise resolves only after the read proves the server
 * stored what was submitted, so the page cannot show success too early.
 */

import { adminService } from './adminService';
import {
  buildPlatformSettingsPayload,
  normalizePlatformSettings,
  platformSettingsEqual,
} from '../utils/adminSettingsForm';

export async function loadPlatformSettings() {
  return normalizePlatformSettings(await adminService.getPlatformSettings());
}

export async function savePlatformSettings(settings) {
  const payload = buildPlatformSettingsPayload(settings);
  await adminService.updatePlatformSettings(payload);

  const confirmed = await loadPlatformSettings();
  if (!platformSettingsEqual(confirmed, payload)) {
    throw new Error(
      'Settings were accepted but could not be verified. Reload the page to check them.',
    );
  }
  return confirmed;
}
