import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022' },
  server: {
    // The repo lives on a Windows drive mounted into WSL, which delivers no
    // inotify events — without polling the dev server serves a stale build and
    // never reloads on a change.
    watch: { usePolling: true, interval: 300 },
  },
});
