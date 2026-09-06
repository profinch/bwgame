/**
 * A fixed-step loop.
 *
 * The world advances in whole steps of the same length however slow the frame
 * was, so what you see never depends on the machine you are seeing it on. What
 * is left over is handed to the renderer as `blend`, to draw between two steps
 * rather than stuttering between them.
 */
export interface LoopHandlers {
  step(seconds: number): void;
  draw(blend: number): void;
}

/** Longer than this and we stop trying to catch up — a tab was in the background. */
const MAX_CATCH_UP = 0.25;

export function loop(handlers: LoopHandlers, stepSeconds = 1 / 60): () => void {
  let previous = performance.now() / 1000;
  let owed = 0;
  let frame = 0;
  let running = true;

  const tick = () => {
    if (!running) return;
    const now = performance.now() / 1000;
    owed = Math.min(owed + (now - previous), MAX_CATCH_UP);
    previous = now;

    while (owed >= stepSeconds) {
      handlers.step(stepSeconds);
      owed -= stepSeconds;
    }
    handlers.draw(owed / stepSeconds);
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(frame);
  };
}
