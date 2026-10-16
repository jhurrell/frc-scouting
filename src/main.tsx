import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoutingDb } from './core/db';
import { FakeSheetGateway } from './core/fakeSheetGateway';
import { createScoutingCore } from './core/scoutingCore';
import { demoEventBundle } from './dev/demoEventBundle';
import { seasonConfigs } from './seasons';
import { App } from './ui/App';
import './ui/styles.css';

// The fake gateway stands in for the Apps Script until ticket 03.
const core = createScoutingCore({
  db: new ScoutingDb(),
  gateway: new FakeSheetGateway(demoEventBundle),
  seasonConfigs,
});

core.refreshEventBundle().catch((error) => console.warn('Could not refresh the Event Bundle', error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App core={core} />
  </StrictMode>,
);
