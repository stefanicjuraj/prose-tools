import * as vscode from "vscode";
import { isMdLikeDocument } from "./documentKinds";
import { scanMarkdownHeadings, type TocHeading } from "./tocHeadings";

const viewType = "proseTools.tocView";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(
  headings: TocHeading[],
  docUri: string,
  docLabel: string,
  nonce: string,
): string {
  const items = headings
    .map((h) => {
      const pad = Math.max(0, h.level - 1) * 10;
      const label = escapeHtml(h.title);
      return `<li style="padding-left:${pad}px"><a href="#" data-line="${h.line}" data-uri="${escapeHtml(docUri)}">${label}</a></li>`;
    })
    .join("");

  const body =
    headings.length === 0
      ? `<p class="muted">No ATX headings in this file (outside frontmatter and fenced code).</p>`
      : `<ul class="toc">${items}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); margin: 8px 10px 12px; }
    .file { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 10px; word-break: break-all; }
    .toc { list-style: none; padding: 0; margin: 0; }
    .toc li { margin: 2px 0; line-height: 1.35; }
    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .muted { color: var(--vscode-descriptionForeground); margin: 0; }
  </style>
</head>
<body>
  <div class="file">${escapeHtml(docLabel)}</div>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll("a[data-line]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const line = Number(a.getAttribute("data-line"));
        const uri = a.getAttribute("data-uri") || "";
        vscode.postMessage({ type: "goto", line, uri });
      });
    });
  </script>
</body>
</html>`;
}

function emptyHtml(message: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-descriptionForeground); margin: 10px 12px; }
  </style>
</head>
<body><p>${escapeHtml(message)}</p></body>
</html>`;
}

export class TocWebviewViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage((msg: { type?: string; line?: number; uri?: string }) => {
      if (msg?.type !== "goto" || typeof msg.line !== "number" || typeof msg.uri !== "string") {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== msg.uri) {
        return;
      }
      const pos = new vscode.Position(msg.line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    this.scheduleRefresh();
  }

  scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, 120);
  }

  private refresh(): void {
    if (!this.view) {
      return;
    }
    const nonce = String(Date.now());
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isMdLikeDocument(editor.document)) {
      this.view.webview.html = emptyHtml(
        "Open a Markdown or MDX file to see its table of contents.",
        nonce,
      );
      return;
    }
    const doc = editor.document;
    const headings = scanMarkdownHeadings(doc);
    const label = doc.uri.scheme === "file" ? doc.uri.fsPath : doc.uri.toString();
    this.view.webview.html = renderHtml(headings, doc.uri.toString(), label, nonce);
  }
}

export function registerTocWebviewView(context: vscode.ExtensionContext): void {
  const provider = new TocWebviewViewProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const bump = (): void => provider.scheduleRefresh();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => bump()),
    vscode.window.onDidChangeVisibleTextEditors(() => bump()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isMdLikeDocument(e.document)) {
        bump();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isMdLikeDocument(doc)) {
        bump();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("proseTools.openOutline", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.prose-tools");
    }),
  );
}
