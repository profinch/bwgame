import { describe, expect, it } from 'vitest';
import { hrefOf, renderDoc } from '../tools/docs';

describe('the documents as pages', () => {
  it('sends a link to a sister page here, and any other document to the repository', () => {
    expect(hrefOf('whitepaper.md')).toBe('whitepaper.html');
    expect(hrefOf('roadmap.md#after-the-hackathon')).toBe('roadmap.html#after-the-hackathon');
    expect(hrefOf('decisions.md')).toBe('https://github.com/profinch/bwgame/blob/main/docs/decisions.md');
    expect(hrefOf('https://example.org/x.md')).toBe('https://example.org/x.md');
  });
  it('renders the markdown into a page of the site with its links sent right', () => {
    const page = renderDoc('# Roadmap\n\nSee the [whitepaper](whitepaper.md) and [decisions](decisions.md).\n\n- one\n- two\n', 'roadmap');
    expect(page).toContain('<h1>Roadmap</h1>');
    expect(page).toContain('href="whitepaper.html"');
    expect(page).toContain('href="https://github.com/profinch/bwgame/blob/main/docs/decisions.md"');
    expect(page).toContain('<title>Ground State — roadmap</title>');
    expect(page).toContain('class="here">roadmap');
  });
});
