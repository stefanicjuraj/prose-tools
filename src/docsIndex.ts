import * as fs from "fs";
import * as path from "path";

function walkMarkdownFiles(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkMarkdownFiles(full, out);
    } else if (/\.(mdx|md)$/i.test(ent.name)) {
      out.push(full);
    }
  }
}

export function listMarkdownPages(docsEnRoot: string): string[] {
  const out: string[] = [];
  walkMarkdownFiles(docsEnRoot, out);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Maps a file under docs en root to `/docs/en/...` (no extension, `index` dropped). */
export function fsPathToDocsHref(docsEnRoot: string, filePath: string): string {
  const root = path.resolve(docsEnRoot);
  const abs = path.resolve(filePath);
  let rel = path.relative(root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..")) {
    return "/docs/en";
  }
  rel = rel.replace(/\.(mdx|md)$/i, "");
  const segs = rel.split("/").filter(Boolean);
  if (segs.length > 0 && segs[segs.length - 1] === "index") {
    segs.pop();
  }
  const slugPath = segs.join("/");
  return slugPath ? `/docs/en/${slugPath}` : "/docs/en";
}
