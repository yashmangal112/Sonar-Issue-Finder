# Sonar Issue Finder

A VS Code extension to fetch and display code quality issues from your SonarQube instance and local ESLint analysis. Get real-time feedback on your code without leaving your editor.

---

## ✨ Features

-   **SonarQube Integration:** Connects to your self-hosted SonarQube server to fetch project issues.
-   **Local ESLint Analysis:** Runs a local ESLint analysis on your project files to find issues in real-time.
-   **Rich Issue Display:** Issues are displayed in a dedicated, hierarchical Tree View panel, organized by file.
-   **Problems Panel Integration:** Issues are also seamlessly integrated into the native VS Code Problems panel, clearly separated by source ("SonarQube" and "ESLint").
-   **Customizable Filtering:** Filter issues by severity (**Blocker**, **Critical**, **Major**, **Minor**, **Info**) to focus on what matters most.
-   **Dynamic Scopes:** Toggle between different analysis scopes:
    -   Overall Code (All Files)
    -   Overall Code (Current File)
    -   New Code (All Files)
    -   New Code (Current File)
-   **Auto-Refresh:** Issues automatically refresh when you save a file or change the active editor (for "current file" modes).
-   **Manual Control:** Use dedicated commands to manually refresh issues or clear the panel.
-   **Empty State Message:** A friendly message is displayed in the panel when no issues are found.

---

## 🚀 Getting Started

To get started with the extension, you need to configure your SonarQube connection.

### 1. Installation

Install the "Sonar Issue Finder" extension directly from the Visual Studio Code Marketplace.

### 2. Configuration

Create a file named `sonar-config.json` inside a `.vscode` folder in the root of your workspace. This file should have the following format:

```json
// .vscode/sonar-config.json
{
  "server": "http://localhost:9000",
  "token": "[User Token]",
  "projectKey": "[project-key]"
}
````

  - **`server`**: The URL of your SonarQube server.
  - **`token`**: Your personal access token for SonarQube. You can generate one in your SonarQube profile settings under `My Account > Security`.
  - **`projectKey`**: The unique key for your project in SonarQube.

-----

## 💡 Usage

The extension adds a new panel titled "**SonarQube**" to your panel.

  - **Clickable Issues:** Click on any issue in the panel to be taken directly to the line of code.
  - **Issue Prioritization:** Issues are displayed with a clear visual hierarchy (icons and prefixes) based on their severity. This allows you to quickly identify and prioritize the most critical issues to solve first.


### Commands

You can access the extension's commands from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) or via the buttons in the "Sonar Issue Finder" panel's title bar.

| Command Title           | Icon          | Description                                                    |
|-------------------------|---------------|----------------------------------------------------------------|
| Select Issue Types | `$(checklist)`| Opens a multi-select menu to filter issues by severity.        |
| Toggle Issue Scope | `$(filter)`   | Changes the analysis scope (e.g., all files, current file).    |
| Refresh Issues | `$(refresh)`  | Manually fetches the latest issues from SonarQube and ESLint.  |
| Clear Issues | `$(trashcan)` | Clears all issues from the panel and disables auto-refresh.    |


-----

## ⚙️ Extension Settings

You can customize the extension's behavior in your VS Code settings.
  - `sonarExtension.selectedSeverities`:
      - **Type:** `array of string`
      - **Default:** `["BLOCKER"]`
      - **Description:** The issue severities to display in the panel.

---

### ❤️ Feedback & Contributions

If you find a bug or have a feature request, please [file an issue](https://github.com/yashmangal112/Sonar-Issue-Finder/issues).
Contributions are always welcome! Feel free to open a pull request.

### License

This extension is licensed under the [MIT License](LICENSE).

Enjoy!