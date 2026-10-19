import { STATIONS, type EventBundle, type ScheduledMatch } from '../shared/contract';

const teams = [174, 191, 340, 578, 1507, 1511, 1585, 2053, 3015, 3044, 3173, 3181, 4093, 5254, 5590, 6758, 7651, 8015];

/** Twelve made-up qualification matches, cycling through the teams. */
const schedule: ScheduledMatch[] = Array.from({ length: 12 }, (_, m) => ({
  matchNumber: m + 1,
  stations: Object.fromEntries(STATIONS.map((station, s) => [station, teams[(m * 7 + s * 3) % teams.length]])),
}));

/** Served by the fake Sheet gateway in local development when VITE_SCRIPT_URL isn't set. */
export const demoEventBundle: EventBundle = {
  eventKey: '2026demo',
  eventName: 'Demo Regional',
  teams,
  schedule,
  // A made-up Scout, never a student. PIN 0000.
  roster: [
    {
      scoutId: 'demo',
      name: 'Demo Scout',
      salt: 'demo-salt',
      pinHash: '3f6b8d13440d8ab1f6ef52e03ba73fc47b4168cb702f95fe7844e588c3098032',
    },
  ],
  coverage: [],
};
