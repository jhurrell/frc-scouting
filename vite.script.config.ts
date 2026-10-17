import { defineConfig } from 'vite';

// Builds the Apps Script as one plain file, dist-script/Code.js, to paste into the Season Sheet's script editor.
// Apps Script has no modules: the bundle defines a global ScoutingScript object, and the footer adds the
// top-level functions Apps Script looks for.
export default defineConfig({
  build: {
    outDir: 'dist-script',
    emptyOutDir: true,
    minify: false,
    target: 'es2019',
    lib: {
      entry: 'src/script/main.ts',
      formats: ['iife'],
      name: 'ScoutingScript',
      fileName: () => 'Code.js',
    },
    rolldownOptions: {
      output: {
        footer: [
          '',
          '// Top-level functions that Apps Script calls.',
          'function doPost(e) {',
          '  return ScoutingScript.doPost(e);',
          '}',
          'function onOpen() {',
          '  ScoutingScript.onOpen();',
          '}',
          'function menuCreateEvent() {',
          '  ScoutingScript.menuCreateEvent();',
          '}',
          'function menuRefreshSchedule() {',
          '  ScoutingScript.menuRefreshSchedule();',
          '}',
        ].join('\n'),
      },
    },
  },
});
