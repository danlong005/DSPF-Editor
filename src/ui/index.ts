import { readFileSync } from "fs";
import { Uri, Webview, WebviewPanel, ExtensionContext, workspace, TextDocument, Range, WorkspaceEdit, Position, Disposable } from "vscode";
import { DisplayFile, FieldInfo, Keyword } from "./dspf";

export const DSPF_VIEW_TYPE = `vscode-ibmi-renderer.dspfEditor`;

export class RendererWebview {
  private dds: DisplayFile | undefined;
  private readonly disposables: Disposable[] = [];

  private get extensionPath() {
    return this.context.extensionUri;
  }

  constructor(
    private readonly context: ExtensionContext,
    private readonly document: TextDocument,
    private readonly view: WebviewPanel
  ) {
    view.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        this.extensionPath,
        Uri.joinPath(this.extensionPath, 'webui'),
        Uri.joinPath(this.extensionPath, 'webui', `scripts`),
      ],
    };

    // Keep the render in sync with the source, including edits made directly
    // in the text editor beside it, not just ones made through this webview.
    this.disposables.push(
      workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() === this.document.uri.toString()) {
          this.load(false);
        }
      })
    );
    view.onDidDispose(() => this.disposables.forEach(d => d.dispose()));

    view.webview.onDidReceiveMessage(this.onDidGetMessage.bind(this));
    view.webview.html = this.getBaseHtml(view.webview);
  }

  async load(rerender = true) {
    const content = this.document.getText();

    this.dds = new DisplayFile();
    this.dds.parse(content.split(/\r?\n/));

    this.view.webview.postMessage({
      command: rerender ? "load" : "update",
      dds: this.dds,
    });
  }

  private async onDidGetMessage(message: any) {
    let recordFormat: string|undefined;
    let fieldInfo: FieldInfo|undefined;

    switch (message.command) {
      case 'deleteField':
        recordFormat = message.recordFormat;
        const fieldName = message.fieldName;

        if (typeof recordFormat === `string` && typeof fieldName === `string`) {
          const deleteFieldRange = this.dds?.getRangeForField(recordFormat, fieldName);

          if (deleteFieldRange) {
            const workspaceEdit = new WorkspaceEdit();
            workspaceEdit.delete(this.document.uri, new Range(deleteFieldRange.start, 0, deleteFieldRange.end, 1000));

            if (await this.applyEditAndSave(workspaceEdit)) {
              this.load(true);
            }
          }
        }
        break;

      case 'newField':
        recordFormat = message.recordFormat;
        fieldInfo = message.fieldInfo;

        if (typeof recordFormat === `string` && typeof fieldInfo === `object`) {
          const newField = this.dds?.updateField(recordFormat, undefined, fieldInfo);

          if (newField) {
            if (newField.range) {
              const workspaceEdit = new WorkspaceEdit();
              workspaceEdit.insert(
                this.document.uri,
                new Position(newField.range.start, 0),
                newField.newLines.join('\n') + `\n`, // TOOD: use the correct EOL?
                {label: `Add DDS Field`, needsConfirmation: false}
              );

              if (await this.applyEditAndSave(workspaceEdit)) {
                this.load(true);
              }
            }
          }
        }

        break;
      case `updateField`:
        recordFormat = message.recordFormat;
        const originalFieldName = message.originalFieldName;
        fieldInfo = message.fieldInfo;

        if (typeof recordFormat === `string` && typeof originalFieldName === `string` && typeof fieldInfo === `object`) {
          const fieldUpdate = this.dds?.updateField(recordFormat, originalFieldName, fieldInfo);

          if (fieldUpdate) {
            if (fieldUpdate.range) {
              const workspaceEdit = new WorkspaceEdit();
              workspaceEdit.replace(
                this.document.uri,
                new Range(fieldUpdate.range.start, 0, fieldUpdate.range.end, 1000),
                fieldUpdate.newLines.join('\n'), // TOOD: use the correct EOL?
                {label: `Update DDS Field`, needsConfirmation: false}
              );

              if (await this.applyEditAndSave(workspaceEdit)) {
                this.load(false); //Field is updated on the client
              }
            }
          }
        }
        break;

      case `updateFormat`:
        // This does not update any of the fields in the record format, only the format header
        recordFormat = message.recordFormat;
        const newKeywords: Keyword[] = message.newKeywords;

        if (typeof recordFormat === `string` && Array.isArray(newKeywords)) {
          const formatUpdate = this.dds?.updateFormatHeader(recordFormat, newKeywords);

          if (formatUpdate) {
            if (formatUpdate.range) {
              const workspaceEdit = new WorkspaceEdit();
              workspaceEdit.replace(
                this.document.uri,
                new Range(formatUpdate.range.start, 0, formatUpdate.range.end, 1000),
                formatUpdate.newLines.join('\n'), // TOOD: use the correct EOL?
                {label: `Update DDS Format`, needsConfirmation: false}
              );

              if (await this.applyEditAndSave(workspaceEdit)) {
                this.load(true);
              }
            }
          }
        }
        break;
    }
  }

  private async applyEditAndSave(workspaceEdit: WorkspaceEdit): Promise<boolean> {
    const applied = await workspace.applyEdit(workspaceEdit);

    if (applied) {
      await this.document.save();
    }

    return applied;
  }

  private getBaseHtml(webview: Webview) {
    const basePath = toUri(webview, this.extensionPath, `webui`, `index.html`);
    // async might be better
    let content = readFileSync(basePath.fsPath, "utf-8");

    // VS Code's webview resource loader can cache local resources by URL, so an
    // unchanged URI can keep serving a stale main.js across panel/window reloads
    // during development. Busting the query string forces a fresh fetch each time.
    const cacheBust = `v=${Date.now()}`;
    const withCacheBust = (uri: Uri) => uri.with({ query: cacheBust }).toString();

    const fileVariables = {
      '{main}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `main.js`)),
      '{elements}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `scripts`, `vscode-elements.js`)),
      '{styles}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `styles.css`)),
      '{codicon}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `scripts`, `codicon.css`)),
      '{konva}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `scripts`, `konva.min.js`)),
    };

    // Replace all variables in the content
    for (const [key, value] of Object.entries(fileVariables)) {
      const regex = new RegExp(key, 'g');
      content = content.replace(regex, value);
    }

    return content;
  }

  static getCommandHref(command: string, ...args: unknown[]) {
    return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
  }
}

function toUri(
  webview: Webview,
  extensionUri: Uri,
  ...pathList: string[]
) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}
