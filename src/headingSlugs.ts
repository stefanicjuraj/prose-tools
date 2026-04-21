import GithubSlugger from "github-slugger";

export function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) {
    return source;
  }
  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return source;
  }
  return source.slice(end + 4).replace(/^\s*\n/, "");
}

export function stripFencedCodeBlocks(source: string): string {
  return source.replace(/```[\s\S]*?```/gm, "\n");
}

/**
 * Extracts heading anchor ids from markdown-like content (after frontmatter and code removal).
 * Supports explicit ids: `## Title {#custom-id}`.
 */
export function collectHeadingSlugs(source: string): { slugs: Set<string>; count: number } {
  const body = stripFencedCodeBlocks(stripFrontmatter(source));
  const slugger = new GithubSlugger();
  const slugs = new Set<string>();
  let count = 0;
  for (const line of body.split("\n")) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (!m) {
      continue;
    }
    let title = m[2].trim();
    const explicit = title.match(/\{#([^}]+)\}\s*$/);
    if (explicit) {
      slugs.add(explicit[1]);
      title = title.replace(/\s*\{#[^}]+\}\s*$/, "").trim();
    }
    if (title.length > 0) {
      slugs.add(slugger.slug(title));
    }
    count++;
  }
  return { slugs, count };
}
