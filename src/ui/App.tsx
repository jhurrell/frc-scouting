import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { DeviceSetupScreen } from './DeviceSetupScreen';
import { HomeScreen } from './HomeScreen';
import { MatchReportForm } from './MatchReportForm';
import { NewMatchReportScreen } from './NewMatchReportScreen';

export type Screen =
  | { name: 'home' }
  | { name: 'device-setup' }
  | { name: 'new-match-report' }
  | { name: 'match-report'; reportId: string };

export function App({ core }: { core: ScoutingCore }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const hasAccessCode = useLiveQuery(() => core.hasAccessCode());

  if (hasAccessCode === undefined) return null;
  if (!hasAccessCode || screen.name === 'device-setup') return <DeviceSetupScreen core={core} navigate={setScreen} />;

  switch (screen.name) {
    case 'home':
      return <HomeScreen core={core} navigate={setScreen} />;
    case 'new-match-report':
      return <NewMatchReportScreen core={core} navigate={setScreen} />;
    case 'match-report':
      return <MatchReportForm core={core} reportId={screen.reportId} navigate={setScreen} />;
  }
}
