// Entry point of the Apps Script bundle. vite.script.config.ts wraps these exports in the
// global ScoutingScript object and adds top-level functions that Apps Script can call.
export { doPost, menuCreateEvent, menuRefreshSchedule, onOpen } from './appsScriptAdapter';
