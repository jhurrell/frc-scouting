import demoV1 from './demo-v1.json';
import demoV2 from './demo-v2.json';

// Every Season Config version of the current season. Versions are appended, never edited in place.
// The scouting core validates them when it starts.
export const seasonConfigs: unknown[] = [demoV1, demoV2];
