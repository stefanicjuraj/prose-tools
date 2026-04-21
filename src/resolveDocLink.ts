import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { collectHeadingSlugs } from "./headingSlugs";

const DOCS_EN_PREFIX = "/docs/en";

export interface LinkCheckResult {
  ok: boolean;
  detail: string;
}

function tryResolveDocFile(docsEnRoot: string, rel: string): string | null {
  const normalized = rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    const indexMdx = path.join(docsEnRoot, "index.mdx");
    if (fs.existsSync(indexMdx)) {
      return indexMdx;
    }
    const indexMd = path.join(docsEnRoot, "index.md");
    return fs.existsSync(indexMd) ? indexMd : null;
  }
  const base = path.join(docsEnRoot, ...normalized.split("/"));
  const candidates = [
    `${base}.mdx`,
    `${base}.md`,
    path.join(base, "index.mdx"),
    path.join(base, "index.md"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseHref(href: string): { pathPart: string; fragment: string } {
  const noHash = href.split("#");
  const pathPart = safeDecode((noHash[0] ?? "").trim());
  const fragment = safeDecode((noHash.slice(1).join("#") ?? "").trim());
  return { pathPart, fragment };
}

function isExternalOrSpecial(href: string): boolean {
  const h = href.trim();
  if (
    h.startsWith("http:") ||
    h.startsWith("https:") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("//")
  ) {
    return true;
  }
  return false;
}

function underDocsEnPath(pathPart: string): boolean {
  return pathPart === DOCS_EN_PREFIX || pathPart.startsWith(`${DOCS_EN_PREFIX}/`);
}

/**
 * Strips query string from path portion.
 */
function stripQuery(p: string): string {
  const q = p.indexOf("?");
  return q === -1 ? p : p.slice(0, q);
}

export function checkMarkdownHref(
  href: string,
  options: {
    docsEnRoot: string;
    sourceFsPath: string;
    /** Current buffer text for same-page #fragments (unsaved or untitled). */
    sourceDocumentText?: string;
  },
): LinkCheckResult {
  const raw = href.trim();
  if (raw.length === 0 || isExternalOrSpecial(raw)) {
    return { ok: true, detail: "skipped" };
  }

  const { pathPart: pathWithMaybeQuery, fragment } = parseHref(stripQuery(raw));
  const pathPart = pathWithMaybeQuery.trim();

  if (pathPart.length === 0) {
    if (!fragment) {
      return { ok: true, detail: "empty" };
    }
    if (options.sourceDocumentText !== undefined) {
      return checkFragmentFromSource(options.sourceDocumentText, fragment);
    }
    const target = options.sourceFsPath;
    if (!fs.existsSync(target)) {
      return { ok: false, detail: "same-page link: file not on disk" };
    }
    return checkFragment(target, fragment);
  }

  if (!underDocsEnPath(pathPart)) {
    return { ok: true, detail: "not /docs/en" };
  }

  const rel = pathPart.slice(DOCS_EN_PREFIX.length).replace(/^\/+/, "");
  const resolved = tryResolveDocFile(options.docsEnRoot, rel);
  if (!resolved) {
    return { ok: false, detail: `no file for path ${pathPart}` };
  }
  if (!fragment) {
    return { ok: true, detail: `file ${path.basename(resolved)}` };
  }
  return checkFragment(resolved, fragment);
}

function checkFragmentFromSource(text: string, fragment: string): LinkCheckResult {
  const { slugs, count } = collectHeadingSlugs(text);
  if (count === 0) {
    return {
      ok: true,
      detail: "target has no markdown headings; fragment not verified",
    };
  }
  if (slugs.has(fragment)) {
    return { ok: true, detail: "fragment matches heading" };
  }
  return {
    ok: false,
    detail: `fragment #${fragment} not found among headings`,
  };
}

function checkFragment(targetFsPath: string, fragment: string): LinkCheckResult {
  let text: string;
  try {
    text = fs.readFileSync(targetFsPath, "utf8");
  } catch {
    return { ok: false, detail: "cannot read target" };
  }
  return checkFragmentFromSource(text, fragment);
}

const WORKSPACE_DOC_ROOT_SUFFIXES = [
  path.join("apps", "docs", "src", "content", "docs", "en"),
  path.join("docs", "src", "content", "docs", "en"),
  path.join("src", "content", "docs", "en"),
];

/**
 * When `proseTools.docsEnRoot` is unset or invalid, look for a known Daytona layout
 * under any workspace folder.
 */
export function discoverDocsEnRootFromWorkspace(): string | null {
  for (const wf of vscode.workspace.workspaceFolders ?? []) {
    const base = wf.uri.fsPath;
    for (const suffix of WORKSPACE_DOC_ROOT_SUFFIXES) {
      const full = path.join(base, suffix);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          return path.resolve(full);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/** Resolved docs root: explicit setting if valid, else workspace auto-discovery. */
export function getDocsEnRoot(): string | null {
  const v = vscode.workspace.getConfiguration("proseTools").get<string>("docsEnRoot");
  if (typeof v === "string" && v.trim().length > 0) {
    const abs = path.resolve(v.trim().replace(/^~(?=$|[/\\])/, os.homedir()));
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return abs;
    }
  }
  return discoverDocsEnRootFromWorkspace();
}

