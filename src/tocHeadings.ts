import * as vscode from "vscode";
import GithubSlugger from "github-slugger";

export interface TocHeading {
  /** 0-based line index in the document. */
  line: number;
  level: number;
  title: string;
  slug: string;
}

function parseAtxHeading(lineText: string): { level: number; rawTitle: string } | undefined {
  const m = lineText.match(/^(\s{0,3})(#{1,6})\s+(.+)$/);
  if (!m) {
    return undefined;
  }
  return { level: m[2].length, rawTitle: m[3].trim() };
}

function pushHeadingFromRawTitle(
  rawTitle: string,
  slugger: GithubSlugger,
  line: number,
  level: number,
  out: TocHeading[],
): void {
  let title = rawTitle.trim();
  const explicit = title.match(/\{#([^}]+)\}\s*$/);
  if (explicit) {
    const id = explicit[1];
    title = title.replace(/\s*\{#[^}]+\}\s*$/, "").trim();
    if (title.length > 0) {
      slugger.slug(title);
    }
    out.push({ line, level, slug: id, title: title.length > 0 ? title : id });
    return;
  }
  if (title.length === 0) {
    return;
  }
  out.push({ line, level, slug: slugger.slug(title), title });
}

/**
 * Walks the live document, skips YAML frontmatter and fenced code blocks, and
 * collects ATX headings with stable slugs (GitHub-style, plus `{#explicit}`),
 * aligned with {@link extractHeadingEntries} semantics.
 */
export function scanMarkdownHeadings(doc: vscode.TextDocument): TocHeading[] {
  const out: TocHeading[] = [];
  const slugger = new GithubSlugger();
  let inFrontmatter = false;
  let inFence = false;

  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text;
    const trimmedStart = text.trimStart();

    if (line === 0 && text === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line > 0 && text.trim() === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    if (inFence) {
      if (trimmedStart.startsWith("```")) {
        inFence = false;
      }
      continue;
    }
    if (trimmedStart.startsWith("```")) {
      inFence = true;
      continue;
    }

    const hx = parseAtxHeading(text);
    if (!hx) {
      continue;
    }
    pushHeadingFromRawTitle(hx.rawTitle, slugger, line, hx.level, out);
  }

  return out;
}
