import * as fs from "fs";
import * as vscode from "vscode";
import { isMdLikeDocument } from "./documentKinds";
import { fsPathToDocsHref, listMarkdownPages } from "./docsIndex";
import { extractHeadingEntries } from "./headingSlugs";
import { findLinkUrlRangeAtCursor, linkUrlPartialRangeAtCursor } from "./linkUrlRange";
import { getDocsEnRoot, resolveDocsEnHrefToFsPath } from "./resolveDocLink";

interface FilePick extends vscode.QuickPickItem {
  absPath: string;
  href: string;
}

interface HeadingPick extends vscode.QuickPickItem {
  slug: string;
}

export async function runDocLinkPicker(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMdLikeDocument(editor.document)) {
    void vscode.window.showWarningMessage(
      "Prose Tools: open a Markdown or MDX file first.",
    );
    return;
  }
  const root = getDocsEnRoot();
  if (!root) {
    void vscode.window.showErrorMessage(
      "Prose Tools: no docs root (set proseTools.docsEnRoot or open the Daytona repo).",
    );
    return;
  }

  const pos = editor.selection.active;
  const range = findLinkUrlRangeAtCursor(editor.document, pos);
  if (!range) {
    void vscode.window.showErrorMessage(
      "Prose Tools: put the caret inside the link URL, between ( and ), for example [sandboxes](|).",
    );
    return;
  }

  const pages = listMarkdownPages(root);
  const fileItems: FilePick[] = pages.map((abs) => {
    const href = fsPathToDocsHref(root, abs);
    const rel = vscode.workspace.asRelativePath(abs, false);
    return {
      label: href.replace(/^\/docs\/en\/?/, "") || "(index)",
      description: href,
      detail: rel,
      absPath: abs,
      href,
    };
  });

  const chosenFile = await vscode.window.showQuickPick<FilePick>(fileItems, {
    title: "Prose Tools: link target page",
    placeHolder: "Type to filter by path or title",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!chosenFile) {
    return;
  }

  let source: string;
  try {
    source = fs.readFileSync(chosenFile.absPath, "utf8");
  } catch {
    void vscode.window.showErrorMessage("Prose Tools: could not read that page.");
    return;
  }

  const headings = extractHeadingEntries(source);
  const headingItems: HeadingPick[] = [
    {
      label: "$(circle-slash) No heading",
      description: "Use page URL only",
      slug: "",
      alwaysShow: true,
    },
    ...headings.map((h) => ({
      label: h.title,
      description: `#${h.slug}`,
      slug: h.slug,
    })),
  ];

  const chosenHeading = await vscode.window.showQuickPick<HeadingPick>(headingItems, {
    title: `Prose Tools: heading on ${chosenFile.href}`,
    placeHolder: "Pick a section anchor or page only",
    matchOnDescription: true,
  });
  if (chosenHeading === undefined) {
    return;
  }

  const url =
    chosenHeading.slug.length > 0
      ? `${chosenFile.href}#${chosenHeading.slug}`
      : chosenFile.href;

  const ok = await editor.edit((eb) => eb.replace(range, url));
  if (!ok) {
    void vscode.window.showErrorMessage("Prose Tools: edit was not applied.");
  }
}

function buildFileCompletions(
  root: string,
  pages: string[],
  partial: string,
): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  const lower = partial.toLowerCase();
  for (const abs of pages) {
    const href = fsPathToDocsHref(root, abs);
    if (partial && !href.toLowerCase().includes(lower) && !abs.toLowerCase().includes(lower)) {
      continue;
    }
    const ci = new vscode.CompletionItem(href, vscode.CompletionItemKind.File);
    ci.insertText = href;
    ci.filterText = `${href} ${abs}`;
    ci.documentation = new vscode.MarkdownString(`\`${abs}\``);
    items.push(ci);
  }
  return items;
}

function buildHeadingCompletions(
  root: string,
  baseHref: string,
  fragPrefix: string,
): vscode.CompletionItem[] {
  const fsPath = resolveDocsEnHrefToFsPath(root, baseHref);
  if (!fsPath) {
    return [];
  }
  let source: string;
  try {
    source = fs.readFileSync(fsPath, "utf8");
  } catch {
    return [];
  }
  const entries = extractHeadingEntries(source);
  const lower = fragPrefix.toLowerCase();
  const items: vscode.CompletionItem[] = [];
  for (const h of entries) {
    if (
      fragPrefix &&
      !h.slug.toLowerCase().startsWith(lower) &&
      !h.title.toLowerCase().includes(lower)
    ) {
      continue;
    }
    const insert = `${baseHref}#${h.slug}`;
    const ci = new vscode.CompletionItem(
      `${h.title}`,
      vscode.CompletionItemKind.Reference,
    );
    ci.insertText = insert;
    ci.filterText = `${h.slug} ${h.title} ${insert}`;
    ci.detail = `#${h.slug}`;
    items.push(ci);
  }
  return items;
}

export function registerDocLinkPicker(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("proseTools.pickDocLink", () => {
      void runDocLinkPicker();
    }),
  );

  const selector: vscode.DocumentSelector = [
    { language: "markdown" },
    { language: "mdx" },
    { scheme: "file", pattern: "**/*.mdx" },
    { scheme: "file", pattern: "**/*.md" },
    { scheme: "file", pattern: "**/*.mdc" },
  ];

  const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(document, position) {
      if (!isMdLikeDocument(document)) {
        return undefined;
      }
      const root = getDocsEnRoot();
      if (!root) {
        return undefined;
      }
      const parsed = linkUrlPartialRangeAtCursor(document, position);
      if (!parsed) {
        return undefined;
      }
      const { partial, range } = parsed;

      const pages = listMarkdownPages(root);
      const hashIdx = partial.lastIndexOf("#");
      let items: vscode.CompletionItem[];
      if (hashIdx === -1) {
        items = buildFileCompletions(root, pages, partial);
      } else {
        const baseHref = partial.slice(0, hashIdx).trim();
        const fragPrefix = partial.slice(hashIdx + 1);
        if (!baseHref.startsWith("/docs/en")) {
          return undefined;
        }
        items = buildHeadingCompletions(root, baseHref, fragPrefix);
      }
      for (const ci of items) {
        ci.range = range;
      }
      return items;
    },
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, provider, "(", "#", "/"),
  );
}
