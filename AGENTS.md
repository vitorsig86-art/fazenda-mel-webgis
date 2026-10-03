# Repository Guidelines

## Project Structure & Module Organization

This workspace currently contains CesiumJS contributor resources rather than a runnable map application.

- `agent/skills/`: domain guides such as `cesiumjs-camera` and `cesiumjs-entities`, each with a `SKILL.md`.
- `.agents/skills/`: installed skills; `.claude/skills/` contains junctions pointing to these directories.
- `agent/skills/cesiumjs-custom-shader/`: shader reference documentation and numbered JavaScript examples under `examples/`.
- `skills-lock.json`: upstream sources, skill paths, and installation hashes.

Keep reference material beside its domain skill. Check corresponding installed copies when updating duplicated documentation; preserve junctions.

## Development & Validation

No `package.json`, build scripts, or automated test runner currently exists. Do not assume `npm install`, `npm run dev`, or `npm test` is available.

Useful PowerShell commands:

- `rg --files --hidden`: inventory documentation and examples, including hidden skill directories.
- `Get-Content skills-lock.json | ConvertFrom-Json | Out-Null`: check lockfile JSON syntax.

For shader validation, follow `agent/skills/cesiumjs-custom-shader/examples/README.md`: open Cesium Sandcastle, use `_sandcastle-template.html` as the scaffold, insert the selected snippet, and click **Run**. Confirm visible rendering and inspect the browser console for GLSL and asset-loading errors. No coverage threshold is configured.

## Coding Style & Naming Conventions

Use descriptive Markdown headings and short, actionable explanations. Preserve skill YAML frontmatter, including `name` and `description`.

Follow existing JavaScript examples: two-space indentation, double-quoted strings, semicolons, ES module imports from `cesium`, and camelCase variables. Skill directories use kebab-case; examples use `0N-description.js`. Reserve underscore-prefixed files for internal scaffolding. No formatter or linter configuration is present.

## Commit & Pull Request Guidelines

Git history is unavailable in this workspace, so no established commit convention can be verified. Use concise, imperative messages such as `docs: clarify shader validation`.

Pull requests should describe the affected skill, explain the change, and report validation performed. Link relevant issues when available. Include screenshots for rendering changes and identify the CesiumJS version used.

## Configuration Tips

Keep credentials and Cesium ion tokens out of documentation and examples. Document external asset requirements. Change lockfile metadata through the installation workflow rather than inventing hashes.
