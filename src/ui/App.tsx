import { useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { HomeScreen } from './HomeScreen';
import { MatchReportForm } from './MatchReportForm';
import { NewMatchReportScreen } from './NewMatchReportScreen';

export type Screen = { name: 'home' } | { name: 'new-match-report' } | { name: 'match-report'; reportId: string };

export function App({ core }: { core: ScoutingCore }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  switch (screen.name) {
    case 'home':
      return <HomeScreen core={core} navigate={setScreen} />;
    case 'new-match-report':
      return <NewMatchReportScreen core={core} navigate={setScreen} />;
    case 'match-report':
      return <MatchReportForm core={core} reportId={screen.reportId} navigate={setScreen} />;
  }
}
