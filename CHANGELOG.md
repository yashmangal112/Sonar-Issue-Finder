# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.4] - 2025-08-25

### Fixed

- Enhanced error handling for issue fetching. The extension now fails gracefully if the SonarQube API is unavailable, hiding all issues and showing a clear error message.

---

## [0.0.3] - 2025-08-24

### Added

-   Added a dedicated extension icon to the Marketplace listing.
-   Added new commands for filtering, refreshing, and clearing issues.
-   Added a `CHANGELOG.md` file to document all changes.
-   Added `repository` field to `package.json` for proper Marketplace linking.

### Changed

-   Updated `engines.vscode` and `@types/vscode` to `^1.103.0` for full compatibility.

---

## [0.0.2] - 2025-08-23

### Added

-   Introduced a hierarchical Tree View panel that groups issues by file.
-   Added color-coded icons and clear descriptions to Tree View items for better issue prioritization.
-   Implemented a state-based auto-refresh system, which can be disabled after clearing issues.
-   Added a custom message to the panel when no issues are found.

### Changed

-   Refactored the core logic to separate SonarQube issues from local ESLint issues in the Problems panel.
-   Updated `package.json` to use more appropriate icons for commands (`$(checklist)` and `$(filter)`).

---

## [0.0.1] - 2025-08-23

### Added

-   Initial release of the "Sonar Issue Finder" extension.
-   Connects to a self-hosted SonarQube instance to fetch and display issues.
-   Provides an initial local ESLint analysis.
-   Issues are displayed in the VS Code Problems panel.
-   Configurable via `sonar-config.json` in the workspace root.