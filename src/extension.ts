import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";
import { ESLint, Linter } from "eslint";


let diagnosticCollection: vscode.DiagnosticCollection;
let autoRefreshEnabled: boolean = true;

// ---- Issue Model ----
export class SonarIssue {
  constructor(
    public readonly message: string,
    public readonly rule: string,
    public readonly severity: string,
    public readonly filePath: string,
    public readonly line: number
  ) { }
}

type TreeItemElement = string | SonarIssue;

// ---- Tree Provider ----
export class SonarIssuesProvider implements vscode.TreeDataProvider<TreeItemElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItemElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private issuesByFile: Map<string, SonarIssue[]> = new Map();

  private treeView: vscode.TreeView<TreeItemElement> | undefined;
  constructor() { }

  public setTreeView(treeView: vscode.TreeView<TreeItemElement>) {
    this.treeView = treeView;
  }

  setIssues(issues: SonarIssue[]): void {
    this.issuesByFile.clear();
    issues.forEach((issue) => {
      if (!this.issuesByFile.has(issue.filePath)) {
        this.issuesByFile.set(issue.filePath, []);
      }
      this.issuesByFile.get(issue.filePath)!.push(issue);
    });
    if (issues.length === 0 && this.treeView) {
      this.treeView.message = " All good! No issues found.";
    } else if (this.treeView) {
      this.treeView.message = undefined;
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemElement): vscode.TreeItem {
    if (typeof element === "string") {
      const uri = vscode.Uri.file(element);
      const collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      const treeItem = new vscode.TreeItem(vscode.Uri.file(element), vscode.TreeItemCollapsibleState.Expanded);

      treeItem.label = vscode.workspace.asRelativePath(uri);
      treeItem.resourceUri = uri;
      treeItem.iconPath = vscode.ThemeIcon.File;
      treeItem.tooltip = element;
      treeItem.description = `${this.issuesByFile.get(element)!.length} issues`;

      return treeItem;
    } else {
      const treeItem = new vscode.TreeItem(element.message);

      treeItem.tooltip = `${element.rule} [${element.severity}]`;
      treeItem.description = `Line ${element.line}`;
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

      treeItem.command = {
        command: "sonarExtension.openIssue",
        title: "Open Issue",
        arguments: [element],
      };

      switch (element.severity) {
        case "BLOCKER":
        case "CRITICAL":
          treeItem.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground"));
          break;
        case "MAJOR":
          treeItem.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground"));
          break;
        case "MINOR":
        case "INFO":
          treeItem.iconPath = new vscode.ThemeIcon("info", new vscode.ThemeColor("problemsInfoIcon.foreground"));
          break;
        default:
          treeItem.iconPath = new vscode.ThemeIcon("info");
          break;
      }
      return treeItem;
    }
  }

  // Get the children for a given element
  getChildren(element?: TreeItemElement): Thenable<TreeItemElement[]> {
    if (!element) {
      return Promise.resolve(Array.from(this.issuesByFile.keys()).sort());
    } else if (typeof element === "string") {
      const issues = this.issuesByFile.get(element);
      return Promise.resolve(issues || []);
    } else {
      return Promise.resolve([]);
    }
  }
}

export class ESLintCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {

        const actions: vscode.CodeAction[] = [];
        
        for (const diagnostic of context.diagnostics) {
            
            const fix = (diagnostic as any)?.fix; // The fix property is not in the official Diagnostic type
            if (fix) {
                const action = new vscode.CodeAction(`Fix with ESLint: ${diagnostic.message}`, vscode.CodeActionKind.QuickFix);
                action.diagnostics = [diagnostic]; // Associate the fix with the diagnostic
                action.isPreferred = true; // Mark this as a preferred quick fix

                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, new vscode.Range(fix.range[0], fix.range[1]), fix.text);
                action.edit = edit;

                actions.push(action);
            }
        }

        return actions;
    }
}

// ---- Modes ----
type Mode = "overall-all" | "overall-file" | "new-all" | "new-file";
let currentMode: Mode = "overall-all";
let statusBarItem: vscode.StatusBarItem;

let selectedSeverities: string[] = vscode.workspace
  .getConfiguration("sonarExtension")
  .get<string[]>("selectedSeverities", ["BLOCKER"]);

export async function selectSeverities() {
  const allSeverities = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];

  const items: vscode.QuickPickItem[] = allSeverities.map(sev => ({
    label: sev,
    picked: selectedSeverities.includes(sev),
  }));

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Select severities to filter issues",
    ignoreFocusOut: true,
  });

  if (picked) {
    selectedSeverities = picked.map(item => item.label);
    await vscode.workspace
      .getConfiguration("sonarExtension")
      .update("selectedSeverities", selectedSeverities, vscode.ConfigurationTarget.Workspace);

    // refresh issues immediately
    vscode.commands.executeCommand("sonarExtension.refreshIssues");
  }
}

function updateStatusBar(issueCount: number) {
  if (statusBarItem) {
    let modeDisplayName: string;

    switch (currentMode) {
      case "overall-all":
        modeDisplayName = "Overall Code (All Files)";
        break;
      case "overall-file":
        modeDisplayName = "Overall Code (Current File)";
        break;
      case "new-all":
        modeDisplayName = "New Code (All Files)";
        break;
      case "new-file":
        modeDisplayName = "New Code (Current File)";
        break;
      default:
        modeDisplayName = "Overall Code (All Files)";
        break;
    }

    // statusBarItem.text = `$(bug) Sonar: ${modeDisplayName} | Issues: ${issueCount}`;
    statusBarItem.text = `$(bug) Sonar: ${modeDisplayName}`;
    statusBarItem.tooltip = "Click to refresh Sonar & ESLint issues";
  }
}

// ---- Activate ----
export function activate(context: vscode.ExtensionContext) {
  console.log('Sonar Issue Finder is activating!');
  try{
  diagnosticCollection = vscode.languages.createDiagnosticCollection("sonar");
  context.subscriptions.push(diagnosticCollection);

  const provider = new SonarIssuesProvider();
  const treeView = vscode.window.createTreeView("sonarIssuesView", { treeDataProvider: provider });
  context.subscriptions.push(treeView);

  provider.setTreeView(treeView);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "sonarExtension.refreshIssues";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  updateStatusBar(0);

  // Refresh Command
  context.subscriptions.push(
    vscode.commands.registerCommand("sonarExtension.clearIssues", () => {
      if (diagnosticCollection) {
        diagnosticCollection.clear();
        updateStatusBar(0);
        autoRefreshEnabled = false;

        provider.setIssues([]);
        vscode.window.showInformationMessage("Issues cleared. Click on Refresh issue to show issues");
      }
    }),
    vscode.commands.registerCommand("sonarExtension.refreshIssues", async () => {
      autoRefreshEnabled = true;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Refreshing Sonar issues...",
          cancellable: false,
        },
        async () => {
          try {
            const issues = await refreshAllIssues(currentMode);
            provider.setIssues(issues);
            updateStatusBar(issues.length);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
              `Failed to refresh Sonar issues: ${message}`
            );
            console.error("Refresh failed:", error);
            provider.setIssues([]);
            updateStatusBar(0);
          }
        }
      );
    })
  );


  // Filter Command
  context.subscriptions.push(
    vscode.commands.registerCommand("sonarExtension.setFilter", async () => {
      try{
      const choice = await vscode.window.showQuickPick(
        [
          "All files (Overall Code)",
          "Current file (Overall Code)",
          "All files (New Code)",
          "Current file (New Code)",
        ],
        { placeHolder: "Select Sonar filter mode" }
      );
      if (!choice) {return;}

      switch (choice) {
        case "All files (Overall Code)":
          currentMode = "overall-all";
          break;
        case "Current file (Overall Code)":
          currentMode = "overall-file";
          break;
        case "All files (New Code)":
          currentMode = "new-all";
          break;
        case "Current file (New Code)":
          currentMode = "new-file";
          break;
      }

      const issues = await refreshAllIssues(currentMode);
      provider.setIssues(issues);
      updateStatusBar(issues.length);
    }catch (error: unknown) {
        vscode.window.showErrorMessage(
          `Failed to set filter: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        console.error("Set filter failed:", error);
      }
    })
  );

  // Open Issue
  context.subscriptions.push(
    vscode.commands.registerCommand("sonarExtension.openIssue", async (issue: SonarIssue) => {
      try{
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(issue.filePath));
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(issue.line - 1, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
      }catch(error: unknown){
        vscode.window.showErrorMessage(
          `Failed to open issue: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );


  // --- Select Severities Command ---
  context.subscriptions.push(
    vscode.commands.registerCommand("sonarExtension.selectSeverities", async () => {
      try{
      await selectSeverities();
      }catch(error: unknown){
        vscode.window.showErrorMessage(
          `Failed to select severities: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );
  // Auto-refresh on editor change (only for current file modes)
  vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor) { return; }

    if (currentMode === "overall-file" || currentMode === "new-file") {
      try{
      const issues = await refreshAllIssues(currentMode);
      provider.setIssues(issues);
      updateStatusBar(issues.length);
      }catch(error: unknown){
        vscode.window.showErrorMessage(
          `Failed to refresh issues on editor change: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  });

  // Auto-refresh on save
  vscode.workspace.onDidSaveTextDocument(async () => {
    if (autoRefreshEnabled) {
      try{
      const issues = await refreshAllIssues(currentMode);
      provider.setIssues(issues);
      updateStatusBar(issues.length);
      }catch(error: unknown){
        vscode.window.showErrorMessage(
          `Failed to refresh issues on save: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  });

  // Initial load
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Fetching Sonar issues...",
      cancellable: false,
    },
    async () => {
      try{
      const issues = await refreshAllIssues(currentMode);
      provider.setIssues(issues);
      updateStatusBar(issues.length);
      }catch(error: unknown){
        vscode.window.showErrorMessage(
          `Failed to fetch issues: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        updateStatusBar(0);
      }
    }
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
        { scheme: 'file', language: 'javascript' },
        new ESLintCodeActionProvider(),
        { providedCodeActionKinds: ESLintCodeActionProvider.providedCodeActionKinds }
    ),
    vscode.languages.registerCodeActionsProvider(
        { scheme: 'file', language: 'typescript' },
        new ESLintCodeActionProvider(),
        { providedCodeActionKinds: ESLintCodeActionProvider.providedCodeActionKinds }
    )
  );
}
catch(error){
    console.error('An error occurred during extension activation:', error);
    vscode.window.showErrorMessage(`Something went wrong with the Sonar Extension. Please check the Developer Tools for more details: ${error}`);
}
}

// ---- Fetch / Refresh ----
async function refreshAllIssues(mode: Mode): Promise<SonarIssue[]> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {return [];}

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(workspaceRoot, ".vscode", "sonar-config.json");
    if (!fs.existsSync(configPath)) {
      vscode.window.showWarningMessage("Sonar config not found");
      return [];
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const { server, token, projectKey } = config;

    if (!server || !token || !projectKey) {
      vscode.window.showErrorMessage(
        "Sonar configuration is invalid. Please provide 'server', 'token', and 'projectKey' in .vscode/sonar-config.json file."
      );
      return [];
    }

    const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const isFileMode = mode.endsWith("file");
    const isNewMode = mode.startsWith("new");

    let sonarIssues: SonarIssue[] = [];
    let fetchSuccess = false;
    if (currentMode.startsWith("overall-")) {
      try{
        const apiIssues = await fetchIssues(server, token, projectKey, isFileMode ? currentFile : undefined);
        sonarIssues = filterByWorkspace(apiIssues, projectKey, workspaceRoot, isFileMode ? currentFile : undefined);
        fetchSuccess = true;
      }catch(err:any){
        vscode.window.showErrorMessage("Failed to fetch SonarQube issues");
        console.error(err);
      }
    }

    let localIssues: SonarIssue[] = [];
    if (currentMode.startsWith("new-")) {
      const filesToAnalyzeUris: vscode.Uri[] = isFileMode && currentFile
        ? [vscode.Uri.file(currentFile)]
        : await vscode.workspace.findFiles("**/*.{js,ts,jsx,tsx}", "**/node_modules/**");

      const filesToAnalyze: string[] = filesToAnalyzeUris.map(uri => uri.fsPath);

      try {
        localIssues = await runESLintAnalysis(filesToAnalyze);
      } catch (err: any) {
        vscode.window.showErrorMessage(`ESLint failed: ${err.message}`);
        console.error(err);
      }

    }

    // Filter both lists independently
    const filteredSonarIssues = sonarIssues.filter(issue => selectedSeverities.includes(issue.severity));
    const filteredLocalIssues = localIssues.filter(issue => selectedSeverities.includes(issue.severity));

    const allFilteredIssues = [...filteredSonarIssues, ...filteredLocalIssues];

    if (!fetchSuccess) {
        updateStatusBar(0);
        return [];
    } else if (allFilteredIssues.length === 0) {
        vscode.window.showInformationMessage("No issues found for the selected project and filters.");
        updateStatusBar(0);
    }

    showSeparatedDiagnostics(filteredSonarIssues, filteredLocalIssues);


    const provider = new SonarIssuesProvider();
    provider.setIssues(allFilteredIssues);
    updateStatusBar(allFilteredIssues.length);

    return allFilteredIssues;
  }
  catch (error) {
    let message = "Something went wrong";
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
      message = error;
    }

    vscode.window.showErrorMessage(`Failed to analyze issues: ${message}`);
    console.error(
      error instanceof Error ? message : "Something went wrong"
    );
    return [];
  }
}


// ---- Fetch Sonar ----
async function fetchIssues(server: string, token: string, projectKey: string, filePath?: string) {
  let allIssues: any[] = [];
  let page = 1;
  const pageSize = 500;

  let extraFilter = "";
  if (filePath) {
    extraFilter = `&componentKeys=${projectKey}:${path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, filePath)}`;
  }


  const config = vscode.workspace.getConfiguration("sonarExtension");
  const severities = config.get<string[]>("selectedSeverities", ["BLOCKER"]);

  const severitiesParam = severities.join(",");
  const statuses = "OPEN,REOPENED";

  try{
  while (true) {
    const res = await fetch(
      `${server}/api/issues/search?componentKeys=${projectKey}&severities=${severitiesParam}&statuses=${statuses}&p=${page}&ps=${pageSize}${extraFilter}`,
      { headers: { Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64") } }
    );
    if (!res.ok) {break;}
    const data = await res.json();
    if (!data.issues || data.issues.length === 0) {break;}
    allIssues.push(...data.issues);
    if (data.paging.total <= page * pageSize) {break;}
    page++;
  }
  }catch(error: unknown){
    let message = "Unknown error occurred";
    if (error instanceof Error) {
      message = error.message;
    }
    vscode.window.showErrorMessage(`Failed to fetch issues`);
    return [];
  }
  return allIssues;
}

// ---- Filter workspace ----
function filterByWorkspace(
  issues: any[],
  projectKey: string,
  workspaceRoot: string,
  currentFile?: string
): SonarIssue[] {
  return issues
    .filter((issue) => {
      const relPath = issue.component.replace(`${projectKey}:`, "").replace(/^\/+/, "");
      const absPath = path.join(workspaceRoot, relPath);
      if (!fs.existsSync(absPath)) {return false;}
      if (currentFile) { return absPath === currentFile; }
      return true;
    })
    .map(
      (issue) =>
        new SonarIssue(
          issue.message || "Unknown",
          issue.rule || "Unknown",
          issue.severity || "INFO",
          path.join(workspaceRoot, issue.component.replace(`${projectKey}:`, "").replace(/^\/+/, "")),
          issue.textRange?.startLine || 1
        )
    );
}

// ---- ESLint local analysis ----
async function runESLintAnalysis(files: string[]): Promise<SonarIssue[]> {

  const eslint = new ESLint({
    overrideConfig: {
      env: { node: true, es2021: true },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
      },
      rules: {
        "no-unused-vars": "warn",
        "no-console": "off",
      },
    } as Linter.Config,
  });


  const results = await eslint.lintFiles(files);
  const issues: SonarIssue[] = [];

  results.forEach((result) =>
    result.messages.forEach((msg) => {
      const sonarSeverity = mapEslintSeverity(msg.severity);
      issues.push(
        new SonarIssue(
          msg.message,
          msg.ruleId || "ESLint",
          sonarSeverity,
          result.filePath,
          msg.line
        )
      );
    })
  );

  return issues;
}

// ---- Map severity ----
function mapSeverity(sev: string): { vscodeSeverity: vscode.DiagnosticSeverity; prefix: string } {
  switch (sev) {
    case "BLOCKER":
      return { vscodeSeverity: vscode.DiagnosticSeverity.Error, prefix: "BLOCKER" };
    case "CRITICAL":
      return { vscodeSeverity: vscode.DiagnosticSeverity.Error, prefix: "CRITICAL" };
    case "MAJOR":
      return { vscodeSeverity: vscode.DiagnosticSeverity.Warning, prefix: "MAJOR" };
    case "MINOR":
      return { vscodeSeverity: vscode.DiagnosticSeverity.Information, prefix: "MINOR" };
    case "INFO":
      return { vscodeSeverity: vscode.DiagnosticSeverity.Information, prefix: "INFO" };
    default:
      return { vscodeSeverity: vscode.DiagnosticSeverity.Information, prefix: "INFO" };
  }
}

// Helper function to map ESLint's severity to Sonar-like severity
function mapEslintSeverity(eslintSeverity: number | string): string {
  if (eslintSeverity === 2 || eslintSeverity === "error") {
    return "CRITICAL";
  }
  if (eslintSeverity === 1 || eslintSeverity === "warn") {
    return "MAJOR";
  }
  return "INFO";
}

// ---- Show Diagnostics ----
function showSeparatedDiagnostics(sonarIssues: SonarIssue[], localIssues: SonarIssue[]) {
  diagnosticCollection.clear();

  sonarIssues.forEach((issue) => {
    const range = new vscode.Range(issue.line - 1, 0, issue.line - 1, 100);
    const { vscodeSeverity, prefix } = mapSeverity(issue.severity);

    const message = `${prefix}: ${issue.message} (${issue.rule})`;

    const diag = new vscode.Diagnostic(
      range,
      message,
      vscodeSeverity
    );
    diag.source = "SonarQube";
    const uri = vscode.Uri.file(issue.filePath);
    diagnosticCollection.set(uri, [...(diagnosticCollection.get(uri) || []), diag]);
  });

  localIssues.forEach((issue) => {
    const range = new vscode.Range(issue.line - 1, 0, issue.line - 1, 100);
    const { vscodeSeverity, prefix } = mapSeverity(issue.severity);
    const message = `${prefix}: ${issue.message} (${issue.rule})`;

    const diag = new vscode.Diagnostic(range, message, vscodeSeverity);
    diag.source = "ESLint";
    const uri = vscode.Uri.file(issue.filePath);
    diagnosticCollection.set(uri, [...(diagnosticCollection.get(uri) || []), diag]);
  });
}

// ---- Deactivate ----
export function deactivate() {
  if (diagnosticCollection) {diagnosticCollection.dispose();}
}
