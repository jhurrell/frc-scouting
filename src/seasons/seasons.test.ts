import { expect, it } from 'vitest';
import { validateSeasonConfigs } from '../core/seasonConfig';
import { seasonConfigs } from '.';

it('ships Season Config versions that pass validation together', () => {
  expect(() => validateSeasonConfigs(seasonConfigs)).not.toThrow();
});
