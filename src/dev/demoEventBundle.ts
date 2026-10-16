import type { EventBundle } from '../shared/contract';

/** Served by the fake Sheet gateway in local development until the real Apps Script exists (tickets 03–04). */
export const demoEventBundle: EventBundle = {
  eventKey: '2026demo',
  teams: [578, 1511, 3015, 3044, 5254, 6758],
  schedule: [
    {
      matchNumber: 1,
      stations: { 'Red 1': 578, 'Red 2': 1511, 'Red 3': 3015, 'Blue 1': 3044, 'Blue 2': 5254, 'Blue 3': 6758 },
    },
  ],
  roster: [],
  coverage: [],
};
