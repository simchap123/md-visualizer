export type Heading = { depth: number; text: string; id: string };

import GithubSlugger from "github-slugger";

/** Pull headings out of raw markdown, skipping fenced code blocks. */
export function parseHeadings(md: string): Heading[] {
  const slugger = new GithubSlugger();
  const items: Heading[] = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2]
      .replace(/[*_`~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();
    if (!text) continue;
    items.push({ depth, text, id: slugger.slug(text) });
  }
  return items;
}
