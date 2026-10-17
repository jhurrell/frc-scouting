/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Apps Script web app URL (ends in /exec). Not secret; the access code is what protects the Sheets. */
  readonly VITE_SCRIPT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
