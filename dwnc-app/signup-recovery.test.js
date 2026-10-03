import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNUP_RECOVERY_KEY, saveSignupRecovery, loadSignupRecovery, clearSignupRecovery } from './signup-recovery.js';
const setup = { ownerId: 'account-a', region: '송파구', ageRange: '30대', chosenSports: ['running'] };
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('recovery stores only setup whitelist, never credentials, and restores only the authenticated owner', () => {
  const store = storage();
  assert.equal(saveSignupRecovery(store, { ...setup, password: 'secret', email: 'private', token: 'secret' }, 1000), true);
  assert.deepEqual(Object.keys(JSON.parse(store.getItem(SIGNUP_RECOVERY_KEY))).sort(), ['version','expiresAt','ownerId','region','ageRange','chosenSports'].sort());
  assert.deepEqual(loadSignupRecovery(store, setup.ownerId, 1001), setup);
  assert.equal(loadSignupRecovery(store, 'account-b', 1001), null);
  assert.equal(store.getItem(SIGNUP_RECOVERY_KEY), null);
});
test('expired, malformed, future and unsupported recoveries are removed without throwing', () => {
  const store = storage();
  for (const raw of ['{', 'x'.repeat(4097), JSON.stringify({...setup,version:1,expiresAt:999}), JSON.stringify({...setup,version:1,expiresAt:1e12}), JSON.stringify({...setup,version:1,expiresAt:2000,password:'secret'}), JSON.stringify({...setup,version:1,expiresAt:2000,chosenSports:['unknown']})]) {
    store.setItem(SIGNUP_RECOVERY_KEY, raw);
    assert.equal(loadSignupRecovery(store, setup.ownerId, 1000), null);
    assert.equal(store.getItem(SIGNUP_RECOVERY_KEY), null);
  }
});
test('unavailable storage leaves in-memory recovery usable and cleanup is safe', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(saveSignupRecovery(denied, setup), false);
  assert.equal(loadSignupRecovery(denied, setup.ownerId), null);
  assert.doesNotThrow(() => clearSignupRecovery(denied));
  assert.equal(saveSignupRecovery(null, setup), false);
});
