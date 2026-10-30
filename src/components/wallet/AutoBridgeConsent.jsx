/**
 * Auto-Bridge Consent and Configuration
 */

const consentKey = (userId) => `cente_autobridge_consent_${userId}`;

export function isBridgeEnabled(user) {
  if (!user?.id) return true;
  try {
    const val = window.localStorage.getItem(consentKey(user.id));
    if (val === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function setBridgeEnabled(user, enabled) {
  if (!user?.id) return;
  try {
    window.localStorage.setItem(consentKey(user.id), enabled ? '1' : '0');
  } catch {}
}
