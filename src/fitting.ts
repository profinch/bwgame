/**
 * A panel as tall as its words.
 *
 * The panels are stone of one width, and their words change: a wallet
 * connects, a plot is stood on, a check passes. A panel of one fixed height
 * has empty stone under a short word and no room for a long one; one that
 * jumps to each new height twitches. So the height is measured after every
 * change and set, and the foot slides to where the words end. Words that
 * grow the panel come in once it has grown, so nothing shows past its edge
 * on the way. A panel put away has no height to fit and is left to size
 * itself when it comes back.
 */
export interface Fitting {
  /** Measure and set now — for whoever changes the panel outside the DOM's notice, or on a clock. */
  fit(): void;
}

/** How long the foot takes to slide: the same as the stylesheet's transition. */
const SLIDES_IN = 350;

export function elastic(panel: HTMLElement, body: HTMLElement): Fitting {
  panel.classList.add('elastic');
  body.classList.add('panel-body');
  let fitted = 0;
  const fit = () => {
    if (panel.getClientRects().length === 0) {
      panel.style.height = '';
      return;
    }
    const was = panel.getBoundingClientRect().height;
    panel.style.height = 'auto';
    const wants = panel.getBoundingClientRect().height;
    if (Math.abs(wants - was) < 0.5) return;
    panel.style.height = `${was}px`;
    if (wants > was) {
      body.classList.add('changing');
      const at = ++fitted;
      setTimeout(() => {
        if (at === fitted) body.classList.remove('changing');
      }, SLIDES_IN);
    }
    void panel.offsetHeight;
    panel.style.height = `${wants}px`;
  };
  new MutationObserver(fit).observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'src', 'style'] });
  return { fit };
}
