import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        // the map, and the engine prototype that will one day replace it
        main: 'index.html',
        world: 'world.html',
      },
    },
  },
  server: {
    // The repo lives on a Windows drive mounted into WSL, which delivers no
    // inotify events — without polling the dev server serves a stale build and
    // never reloads on a change.
    //
    // Polling over that mount is not free: every check is a call across to
    // Windows, and at three a second over everything in the tree it cost a
    // sixth of a core with nobody looking at the page. A second is still
    // quicker than anyone can alt-tab, and the places nothing is edited by hand
    // are left out of it.
    watch: {
      usePolling: true,
      interval: 1000,
      binaryInterval: 3000,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/cache/**',
        '**/contracts/out/**',
        '**/_*.png',
      ],
    },
  },
});
