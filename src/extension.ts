import * as vscode from "vscode";
import { createLinkDecorationController } from "./linkDecorations";

export function activate(context: vscode.ExtensionContext): void {
  createLinkDecorationController(context);
}

export function deactivate(): void {}
