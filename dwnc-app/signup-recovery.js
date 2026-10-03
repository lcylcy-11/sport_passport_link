// Tab-local, short-lived onboarding recovery. Never serialize credentials.
export const SIGNUP_RECOVERY_KEY = 'dwnc.signup-recovery.v1';
const lifetime = 24 * 60 * 60 * 1000;
const sports = ['tennis', 'futsal', 'running'];
function valid(setup) {
  return setup && typeof setup.ownerId === 'string' && setup.ownerId.length > 0 && setup.ownerId.length <= 128
    && typeof setup.region === 'string' && setup.region.trim().length > 0 && setup.region.length <= 30
    && ['20대', '30대', '40대', '50대 이상', '미입력'].includes(setup.ageRange)
    && Array.isArray(setup.chosenSports) && setup.chosenSports.length > 0 && setup.chosenSports.length <= 3
    && new Set(setup.chosenSports).size === setup.chosenSports.length && setup.chosenSports.every(sport => sports.includes(sport));
}
export function clearSignupRecovery(storage) {
  try { storage?.removeItem(SIGNUP_RECOVERY_KEY); } catch { /* Storage can be disabled. */ }
}
export function saveSignupRecovery(storage, setup, now = Date.now()) {
  if (!valid(setup)) { clearSignupRecovery(storage); return false; }
  const { ownerId, region, ageRange, chosenSports } = setup;
  try {
    if (!storage) return false;
    storage.setItem(SIGNUP_RECOVERY_KEY, JSON.stringify({ version: 1, expiresAt: now + lifetime, ownerId, region, ageRange, chosenSports }));
    return true;
  } catch { return false; }
}
export function loadSignupRecovery(storage, ownerId, now = Date.now()) {
  try {
    const raw = storage?.getItem(SIGNUP_RECOVERY_KEY);
    if (!raw) return null;
    if (raw.length > 4096) throw new Error('Invalid recovery');
    const setup = JSON.parse(raw);
    if (!valid(setup) || setup.version !== 1 || setup.ownerId !== ownerId || !Number.isFinite(setup.expiresAt)
      || setup.expiresAt <= now || setup.expiresAt > now + lifetime
      || Object.keys(setup).some(key => !['version', 'expiresAt', 'ownerId', 'region', 'ageRange', 'chosenSports'].includes(key))) throw new Error('Invalid recovery');
    const { region, ageRange, chosenSports } = setup;
    return { ownerId, region, ageRange, chosenSports };
  } catch { clearSignupRecovery(storage); return null; }
}
