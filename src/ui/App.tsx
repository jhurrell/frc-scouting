import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { EventBundle, RosterEntry } from '../shared/contract';
import type { ScoutingCore } from '../core/scoutingCore';
import { DeviceSetupScreen } from './DeviceSetupScreen';
import { HomeScreen } from './HomeScreen';
import { LoginScreen } from './LoginScreen';
import { NewMatchReportScreen } from './NewMatchReportScreen';
import { NewPitReportScreen } from './NewPitReportScreen';
import { ReportForm } from './ReportForm';
import { UploadStatusLine } from './UploadStatusLine';

export type Screen =
  | { name: 'home' }
  | { name: 'device-setup' }
  | { name: 'new-match-report' }
  | { name: 'new-pit-report' }
  | { name: 'report'; reportId: string };

interface DeviceState {
  hasAccessCode: boolean;
  bundle: EventBundle | undefined;
  scout: RosterEntry | undefined;
}

export function App({ core }: { core: ScoutingCore }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const state = useLiveQuery(
    async (): Promise<DeviceState> => ({
      hasAccessCode: await core.hasAccessCode(),
      bundle: await core.getEventBundle(),
      scout: await core.currentScout(),
    }),
  );

  if (state === undefined) return null;
  return (
    <>
      <UploadStatusLine core={core} />
      <CurrentScreen core={core} state={state} screen={screen} navigate={setScreen} />
    </>
  );
}

interface CurrentScreenProps {
  core: ScoutingCore;
  state: DeviceState;
  screen: Screen;
  navigate: (screen: Screen) => void;
}

function CurrentScreen({ core, state, screen, navigate }: CurrentScreenProps) {
  if (!state.hasAccessCode || screen.name === 'device-setup') return <DeviceSetupScreen core={core} navigate={navigate} />;
  // Without an Event Bundle there is no roster to log in against; the home screen explains how to get one.
  if (!state.bundle) return <HomeScreen core={core} navigate={navigate} />;
  if (!state.scout) return <LoginScreen core={core} bundle={state.bundle} navigate={navigate} />;

  switch (screen.name) {
    case 'home':
      return <HomeScreen core={core} navigate={navigate} />;
    case 'new-match-report':
      return <NewMatchReportScreen core={core} navigate={navigate} />;
    case 'new-pit-report':
      return <NewPitReportScreen core={core} bundle={state.bundle} navigate={navigate} />;
    case 'report':
      return <ReportForm core={core} reportId={screen.reportId} navigate={navigate} />;
  }
}
