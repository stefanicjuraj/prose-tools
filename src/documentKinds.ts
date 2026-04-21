import * as vscode from "vscode";

const LANG = new Set(["markdown", "mdx"]);

export function isMdLikeDocument(doc: vscode.TextDocument): boolean {
  if (LANG.has(doc.languageId)) {
    return true;
  }
  const p = (doc.uri.fsPath || doc.uri.path).toLowerCase();
  return p.endsWith(".mdx") || p.endsWith(".md") || p.endsWith(".mdc");
}
