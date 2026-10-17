// Roster entries for tests, hashed the way the script hashes them.
import type { RosterEntry } from '../shared/contract';
import { hashPin } from './scoutingCore';

export function rosterEntry(scoutId: string, name: string, pin: string): RosterEntry {
  const salt = `salt-${scoutId}`;
  return { scoutId, name, salt, pinHash: hashPin(salt, pin) };
}

/** The Scout most tests log in as. */
export const TEST_SCOUT = { scoutId: 's1', name: 'Test Scout', pin: '1234' };
export const testRoster: RosterEntry[] = [rosterEntry(TEST_SCOUT.scoutId, TEST_SCOUT.name, TEST_SCOUT.pin)];
