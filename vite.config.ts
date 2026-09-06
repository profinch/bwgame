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
    watch: { usePolling: true, interval: 300 },
  },
});
