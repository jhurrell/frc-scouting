import type { SeasonConfig } from '../shared/contract';
import demoV1 from './demo-v1.json';

// Every Season Config version of the current season. Versions are appended, never edited in place.
// TODO(ticket 02): validate on load instead of casting.
export const seasonConfigs: SeasonConfig[] = [demoV1 as SeasonConfig];
