import * as vscode from "vscode";
import { registerDocLinkPicker } from "./docLinkPicker";
import { createLinkDecorationController } from "./linkDecorations";
import { registerTocWebviewView } from "./tocWebviewView";

export function activate(context: vscode.ExtensionContext): void {
  createLinkDecorationController(context);
  registerDocLinkPicker(context);
  registerTocWebviewView(context);
}

export function deactivate(): void {}
