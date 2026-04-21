import * as vscode from "vscode";

/**
 * If the cursor sits inside `[label]( URL )` on the same line, returns the range of the URL
 * (half-open toward the closing `)` so `Range.end` is the column of `)`).
 */
export function findLinkUrlRangeAtCursor(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range | null {
  const line = doc.lineAt(pos.line);
  const text = line.text;
  const c = pos.character;
  const re = /\[[^\]]*\]\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const full = m[0];
    const openParen = m.index + full.indexOf("(");
    const closeParen = m.index + full.lastIndexOf(")");
    const urlStart = openParen + 1;
    if (c >= urlStart && c <= closeParen) {
      return new vscode.Range(pos.line, urlStart, pos.line, closeParen);
    }
  }
  return null;
}

/** Text between `(` and the cursor on the same line inside `[...](...`, plus that span as a range. */
export function linkUrlPartialRangeAtCursor(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): { range: vscode.Range; partial: string } | null {
  const line = doc.lineAt(pos.line);
  const text = line.text;
  const c = pos.character;
  const before = text.slice(0, c);
  const m = before.match(/\[[^\]]*\]\(([^)]*)$/);
  if (!m) {
    return null;
  }
  const partial = m[1] ?? "";
  const urlStart = c - partial.length;
  return {
    range: new vscode.Range(pos.line, urlStart, pos.line, c),
    partial,
  };
}
