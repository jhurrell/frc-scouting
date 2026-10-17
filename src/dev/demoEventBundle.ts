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
  teams,
  schedule,
  roster: [],
  coverage: [],
};
