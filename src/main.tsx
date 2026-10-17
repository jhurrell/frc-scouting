import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoutingDb } from './core/db';
import { createScoutingCore } from './core/scoutingCore';
import { demoEventBundle } from './dev/demoEventBundle';
import { FakeSheetGateway } from './gateway/fakeSheetGateway';
import { HttpSheetGateway } from './gateway/httpSheetGateway';
import { seasonConfigs } from './seasons';
import type { SheetGateway } from './shared/contract';
import { App } from './ui/App';
import './ui/styles.css';

function chooseGateway(): SheetGateway {
  const scriptUrl = import.meta.env.VITE_SCRIPT_URL;
  if (scriptUrl) return new HttpSheetGateway(scriptUrl);
  // Without a script URL, local development uses the in-memory fake. It accepts any access code.
  if (import.meta.env.DEV) return new FakeSheetGateway(demoEventBundle);
  throw new Error('VITE_SCRIPT_URL is not set. See docs/apps-script-setup.md.');
}

const core = createScoutingCore({ db: new ScoutingDb(), gateway: chooseGateway(), seasonConfigs });

core
  .hasAccessCode()
  .then((hasCode) => (hasCode ? core.refreshEventBundle() : undefined))
  .catch((error) => console.warn('Could not refresh the Event Bundle', error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App core={core} />
  </StrictMode>,
);
