import fs from "node:fs";

const checks = [
  {
    path: "src/styles.css",
    minBytes: 40000,
    required: [
      ":root {",
      ".app-shell {",
      ".sidebar {",
      ".content-shell {",
      ".workspace {",
      ".composer {",
      ".preview-pane {",
    ],
  },
  {
    path: "src/App.jsx",
    minBytes: 30000,
    required: [
      "function App(",
      "function VikingAriesApp(",
      "<Sidebar",
      "<PreviewPane",
      "export default",
    ],
  },
  {
    path: "src/WorkspaceViews.jsx",
    minBytes: 30000,
    required: [
      "function WorkspaceView",
      "function SecretsView",
      "case \"API Usage\"",
      "case \"Deployments\"",
      "export default",
    ],
  },
  {
    path: "worker/index.js",
    minBytes: 40000,
    required: [
      "async function githubWriteFile",
      "async function githubReplaceText",
      "async function callOpenAI",
      "export default",
    ],
  },
];

const failures = [];

for (const check of checks) {
  if (!fs.existsSync(check.path)) {
    failures.push(`${check.path}: file is missing`);
    continue;
  }

  const content = fs.readFileSync(check.path, "utf8");
  const bytes = Buffer.byteLength(content, "utf8");

  if (bytes < check.minBytes) {
    failures.push(
      `${check.path}: suspiciously small (${bytes.toLocaleString()} bytes; expected at least ${check.minBytes.toLocaleString()})`
    );
  }

  for (const marker of check.required) {
    if (!content.includes(marker)) {
      failures.push(`${check.path}: required structure missing: ${marker}`);
    }
  }
}

if (failures.length) {
  console.error("\nViking Aries integrity check FAILED. Deployment stopped to protect the app.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "\nA critical source file may have been truncated or replaced with only a partial edit. Restore/review the file before deploying.\n"
  );
  process.exit(1);
}

console.log("Viking Aries integrity check passed.");
