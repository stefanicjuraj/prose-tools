import * as vscode from "vscode";
import { registerDocLinkPicker } from "./docLinkPicker";
import { createLinkDecorationController } from "./linkDecorations";

export function activate(context: vscode.ExtensionContext): void {
  createLinkDecorationController(context);
  registerDocLinkPicker(context);
}

export function deactivate(): void {}
