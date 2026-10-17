import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { DeviceSetupScreen } from './DeviceSetupScreen';
import { HomeScreen } from './HomeScreen';
import { LoginScreen } from './LoginScreen';
import { MatchReportForm } from './MatchReportForm';
import { NewMatchReportScreen } from './NewMatchReportScreen';

export type Screen =
  | { name: 'home' }
  | { name: 'device-setup' }
  | { name: 'new-match-report' }
  | { name: 'match-report'; reportId: string };

export function App({ core }: { core: ScoutingCore }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const state = useLiveQuery(async () => ({
    hasAccessCode: await core.hasAccessCode(),
    bundle: await core.getEventBundle(),
    scout: await core.currentScout(),
  }));

  if (state === undefined) return null;
  if (!state.hasAccessCode || screen.name === 'device-setup') return <DeviceSetupScreen core={core} navigate={setScreen} />;
  // Without an Event Bundle there is no roster to log in against; the home screen explains how to get one.
  if (!state.bundle) return <HomeScreen core={core} navigate={setScreen} />;
  if (!state.scout) return <LoginScreen core={core} bundle={state.bundle} navigate={setScreen} />;

  switch (screen.name) {
    case 'home':
      return <HomeScreen core={core} navigate={setScreen} />;
    case 'new-match-report':
      return <NewMatchReportScreen core={core} navigate={setScreen} />;
    case 'match-report':
      return <MatchReportForm core={core} reportId={screen.reportId} navigate={setScreen} />;
  }
}
