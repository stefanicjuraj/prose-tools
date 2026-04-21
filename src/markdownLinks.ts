export interface MarkdownLinkMatch {
  /** Index of `[` */
  openIndex: number;
  /** Index after closing `)` */
  closeIndex: number;
  url: string;
}

/**
 * Walks the document for `[...](...)` links. Skips image links `![`.
 * Does not parse nested parens inside URL except by depth count.
 */
export function findMarkdownLinks(text: string): MarkdownLinkMatch[] {
  const results: MarkdownLinkMatch[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("[", i);
    if (open === -1) {
      break;
    }
    if (open > 0 && text[open - 1] === "!") {
      i = open + 1;
      continue;
    }
    let j = open + 1;
    let depth = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        if (depth === 0) {
          break;
        }
        depth--;
      }
      j++;
    }
    if (j >= text.length || text[j] !== "]") {
      i = open + 1;
      continue;
    }
    if (text[j + 1] !== "(") {
      i = open + 1;
      continue;
    }
    let k = j + 2;
    const urlStart = k;
    let parenDepth = 0;
    while (k < text.length) {
      const ch = text[k];
      if (ch === "(") {
        parenDepth++;
      } else if (ch === ")") {
        if (parenDepth === 0) {
          break;
        }
        parenDepth--;
      }
      k++;
    }
    if (k >= text.length || text[k] !== ")") {
      i = open + 1;
      continue;
    }
    const url = text.slice(urlStart, k).trim();
    const closeIndex = k + 1;
    results.push({ openIndex: open, closeIndex, url });
    i = closeIndex;
  }
  return results;
}

/** `<a href="...">` (single-line open tag). */
export function findAnchorHrefLinks(text: string): MarkdownLinkMatch[] {
  const results: MarkdownLinkMatch[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(["'])([^"']*)\1[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = (m[2] ?? "").trim();
    results.push({
      openIndex: m.index,
      closeIndex: m.index + m[0].length,
      url,
    });
  }
  return results;
}

export function findAllDocLinks(text: string): MarkdownLinkMatch[] {
  return [...findMarkdownLinks(text), ...findAnchorHrefLinks(text)].sort(
    (a, b) => a.openIndex - b.openIndex,
  );
}
