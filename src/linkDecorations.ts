import * as vscode from "vscode";
import { codeFenceRanges, offsetInsideRanges } from "./codeFences";
import { findAllDocLinks } from "./markdownLinks";
import { checkMarkdownHref, getDocsEnRoot } from "./resolveDocLink";

const LANG = new Set(["markdown", "mdx"]);

function isMdLikeDocument(doc: vscode.TextDocument): boolean {
  if (LANG.has(doc.languageId)) {
    return true;
  }
  const p = (doc.uri.fsPath || doc.uri.path).toLowerCase();
  return p.endsWith(".mdx") || p.endsWith(".md") || p.endsWith(".mdc");
}

function shouldDecorateEditor(e: vscode.TextEditor): boolean {
  return isMdLikeDocument(e.document);
}

function parenDecorationRange(
  doc: vscode.TextDocument,
  closeIndex: number,
): vscode.Range {
  const start = closeIndex - 1;
  const a = doc.positionAt(start);
  const b = doc.positionAt(closeIndex);
  return new vscode.Range(a, b);
}

let missingRootHintShown = false;

function maybeHintMissingRoot(text: string): void {
  if (missingRootHintShown || !text.includes("/docs/en")) {
    return;
  }
  missingRootHintShown = true;
  void vscode.window
    .showInformationMessage(
      "Prose Tools: no docs root found. Set proseTools.docsEnRoot to your content/docs/en folder, or open a workspace that contains apps/docs/src/content/docs/en.",
      "Open Settings",
    )
    .then((choice) => {
      if (choice === "Open Settings") {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "proseTools.docsEnRoot",
        );
      }
    });
}

export function createLinkDecorationController(
  context: vscode.ExtensionContext,
): void {
  const valid = vscode.window.createTextEditorDecorationType({
    after: { contentText: "🟢", margin: "0 0 0 2px" },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  const invalid = vscode.window.createTextEditorDecorationType({
    after: { contentText: "🔴", margin: "0 0 0 2px" },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  context.subscriptions.push(valid, invalid);

  let timer: ReturnType<typeof setTimeout> | undefined;

  const refresh = (): void => {
    for (const editor of vscode.window.visibleTextEditors) {
      if (!shouldDecorateEditor(editor)) {
        editor.setDecorations(valid, []);
        editor.setDecorations(invalid, []);
        continue;
      }
      applyDecorations(editor, valid, invalid);
    }
  };

  const schedule = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      refresh();
    }, 400);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => schedule()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isMdLikeDocument(e.document)) {
        schedule();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isMdLikeDocument(doc)) {
        schedule();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("proseTools.docsEnRoot")) {
        missingRootHintShown = false;
        schedule();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      missingRootHintShown = false;
      schedule();
    }),
  );

  schedule();
}

function applyDecorations(
  editor: vscode.TextEditor,
  valid: vscode.TextEditorDecorationType,
  invalid: vscode.TextEditorDecorationType,
): void {
  const text = editor.document.getText();
  const root = getDocsEnRoot();
  if (!root) {
    maybeHintMissingRoot(text);
    editor.setDecorations(valid, []);
    editor.setDecorations(invalid, []);
    return;
  }

  const fences = codeFenceRanges(text);
  const links = findAllDocLinks(text);
  const okRanges: vscode.Range[] = [];
  const badRanges: vscode.Range[] = [];

  for (const link of links) {
    if (offsetInsideRanges(link.openIndex, fences)) {
      continue;
    }
    const r = checkMarkdownHref(link.url, {
      docsEnRoot: root,
      sourceFsPath: editor.document.uri.fsPath,
      sourceDocumentText: text,
    });
    if (r.detail === "skipped" || r.detail === "not /docs/en" || r.detail === "empty") {
      continue;
    }
    const decRange = parenDecorationRange(editor.document, link.closeIndex);
    if (r.ok) {
      okRanges.push(decRange);
    } else {
      badRanges.push(decRange);
    }
  }

  editor.setDecorations(valid, okRanges);
  editor.setDecorations(invalid, badRanges);
}
