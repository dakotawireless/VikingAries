import { MIGRATED_PROJECTS } from "../shared/projects.js";
import { budgetedFetch as fetch, withRequestBudget, remainingRequests, resolveBoundSecret, RequestBudgetExceeded, MAX_AGENT_ROUNDS, MAX_AGENT_TOOLS } from "./request-budget.js";
import { openAIUsageForResponse, addUsageTotals } from "./usage.js";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const CONVEX_MANAGEMENT_API_BASE = "https://api.convex.dev/v1";
const CLOUDFLARE_ACCOUNT_ID = "f2ca2f43ab364db1c4391a015d6698fe";

async function resolveSecret(binding) {
  if (!binding) return null;
  if (typeof binding === "string") return binding;
  if (typeof binding.get === "function") {
    return await resolveBoundSecret(binding);
  }
  return null;
}


const PROJECT_RUNTIME_CONFIG = {
  ...MIGRATED_PROJECTS,
  timekeeper: {
    repository: "dakotawireless/TimeKeeper-App",
    defaultBranch: "main",
    cloudflareWorker: "timekeeper-app",
    backend: "Convex",
    backendDeployment: "aware-caiman-251",
    backendUrl: "https://aware-caiman-251.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/t/erik-2df00/timekeeper/aware-caiman-251",
  },
  "viking-aries": {
    repository: "dakotawireless/VikingAries",
    defaultBranch: "main",
    cloudflareWorker: "vikingaries",
    backend: "Convex",
    backendDeployment: "flippant-mandrill-487",
    backendUrl: "https://flippant-mandrill-487.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/",
  },
  "rez-lock": {
    repository: "dakotawireless/rez-lock-and-key-staging",
    defaultBranch: "main",
    cloudflareWorker: "rez-lock-and-key-staging",
    backend: "Cloudflare Worker",
    backendDeployment: "rez-lock-and-key-staging",
    backendUrl: "https://rez-lock-and-key-staging.erik-f2c.workers.dev",
  },
};

function registeredProjectConfig(projectId) {
  return PROJECT_RUNTIME_CONFIG[String(projectId || "").trim()] || null;
}

const OWNER_SESSION_COOKIE = "va_owner_session";
const OWNER_SESSION_SECONDS = 60 * 60 * 12;

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacSign(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function hmacVerify(secret, value, signature) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(value));
}

async function ownerAuthConfig(env) {
  const [accessCode, sessionSecret] = await Promise.all([
    resolveSecret(env.OWNER_ACCESS_CODE),
    resolveSecret(env.OWNER_SESSION_SECRET),
  ]);
  return {
    configured: Boolean(accessCode && sessionSecret),
    accessCode,
    sessionSecret,
  };
}

async function createOwnerSession(sessionSecret) {
  const payload = JSON.stringify({
    role: "owner",
    exp: Math.floor(Date.now() / 1000) + OWNER_SESSION_SECONDS,
    nonce: crypto.randomUUID(),
  });
  const payloadBytes = new TextEncoder().encode(payload);
  const encodedPayload = base64UrlEncode(payloadBytes);
  const signature = await hmacSign(sessionSecret, encodedPayload);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

async function verifyOwnerSession(request, sessionSecret) {
  if (!sessionSecret) return false;
  const token = parseCookies(request)[OWNER_SESSION_COOKIE];
  if (!token || !token.includes(".")) return false;

  try {
    const [encodedPayload, encodedSignature] = token.split(".");
    const verified = await hmacVerify(
      sessionSecret,
      encodedPayload,
      base64UrlDecode(encodedSignature)
    );
    if (!verified) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload))
    );
    return payload?.role === "owner" && Number(payload?.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function ownerCookie(value, maxAge = OWNER_SESSION_SECONDS) {
  return `${OWNER_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearOwnerCookie() {
  return `${OWNER_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

async function safeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ""));
  const rightBytes = new TextEncoder().encode(String(right || ""));
  if (leftBytes.length !== rightBytes.length) return false;
  let result = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    result |= leftBytes[index] ^ rightBytes[index];
  }
  return result === 0;
}


function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob(String(value || "").replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function safeProjectStorageId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function safeUploadedFileName(value) {
  const normalized = String(value || "file")
    .normalize("NFKC")
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._ ()-]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "file").slice(0, 160);
}

function encodeGithubPath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

const VA_FILE_STORAGE_REPOSITORY = "dakotawireless/VikingAries";
const VA_FILE_STORAGE_BRANCH = "va-files";
const VA_FILE_MAX_BYTES = 3 * 1024 * 1024;

async function githubStoreProjectFile(token, { projectId, file }) {
  const safeProject = safeProjectStorageId(projectId);
  if (!safeProject) throw new Error("A valid project is required.");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("A file is required.");
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > VA_FILE_MAX_BYTES) throw new Error("Files are limited to 3 MB each.");

  const safeName = safeUploadedFileName(file.name);
  const date = new Date().toISOString().slice(0, 10);
  const unique = crypto.randomUUID().slice(0, 8);
  const storagePath = `project-files/${safeProject}/${date}/${Date.now()}-${unique}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const payload = await githubRequest(
    token,
    `/repos/${VA_FILE_STORAGE_REPOSITORY}/contents/${encodeGithubPath(storagePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Store ${safeProject} file: ${safeName}`,
        content: bytesToBase64(bytes),
        branch: VA_FILE_STORAGE_BRANCH,
      }),
    }
  );

  return {
    id: `durable-${crypto.randomUUID()}`,
    name: file.name || safeName,
    type: file.type || "application/octet-stream",
    size: file.size,
    status: "Stored",
    storage: "github",
    storageRepository: VA_FILE_STORAGE_REPOSITORY,
    storageBranch: VA_FILE_STORAGE_BRANCH,
    storagePath: payload?.content?.path || storagePath,
    storageSha: payload?.content?.sha || null,
    commitSha: payload?.commit?.sha || null,
    commitUrl: payload?.commit?.html_url || null,
    uploadedAt: Date.now(),
  };
}

async function githubDeleteProjectFile(token, { projectId, path, sha, name }) {
  const safeProject = safeProjectStorageId(projectId);
  const safePath = String(path || "").replace(/^\/+/, "").trim();
  const expectedPrefix = `project-files/${safeProject}/`;
  if (!safeProject || !safePath.startsWith(expectedPrefix)) {
    throw new Error("The file path is not valid for this project.");
  }
  if (!sha) throw new Error("The stored file SHA is required.");

  const payload = await githubRequest(
    token,
    `/repos/${VA_FILE_STORAGE_REPOSITORY}/contents/${encodeGithubPath(safePath)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete ${safeProject} file: ${safeUploadedFileName(name || safePath.split("/").pop())}`,
        sha,
        branch: VA_FILE_STORAGE_BRANCH,
      }),
    }
  );

  return {
    ok: true,
    commitSha: payload?.commit?.sha || null,
    commitUrl: payload?.commit?.html_url || null,
  };
}

async function githubDownloadProjectFile(token, { projectId, path }) {
  const safeProject = safeProjectStorageId(projectId);
  const safePath = String(path || "").replace(/^\/+/, "").trim();
  const expectedPrefix = `project-files/${safeProject}/`;
  if (!safeProject || !safePath.startsWith(expectedPrefix)) {
    throw new Error("The file path is not valid for this project.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${VA_FILE_STORAGE_REPOSITORY}/contents/${encodeGithubPath(safePath)}?ref=${encodeURIComponent(VA_FILE_STORAGE_BRANCH)}`,
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Viking-Aries",
      },
    }
  );

  if (!response.ok) {
    let message = `GitHub file download failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {
      // Raw responses are not necessarily JSON.
    }
    throw new Error(message);
  }

  return response;
}

function inferMimeType(name) {
  const lower = String(name || "").toLowerCase();
  const extension = lower.includes(".") ? lower.split(".").pop() : "";
  const known = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    gz: "application/gzip",
  };
  return known[extension] || "application/octet-stream";
}

function originalStoredFileName(path) {
  const base = String(path || "").split("/").pop() || "file";
  return base.replace(/^\d+-[A-Za-z0-9]{8}-/, "") || base;
}

async function githubListProjectFiles(token, projectId) {
  const safeProject = safeProjectStorageId(projectId);
  if (!safeProject) throw new Error("A valid project is required.");

  const payload = await githubRequest(
    token,
    `/repos/${VA_FILE_STORAGE_REPOSITORY}/git/trees/${encodeURIComponent(VA_FILE_STORAGE_BRANCH)}?recursive=1`
  );
  const prefix = `project-files/${safeProject}/`;

  return (Array.isArray(payload?.tree) ? payload.tree : [])
    .filter((entry) => entry?.type === "blob" && String(entry.path || "").startsWith(prefix))
    .map((entry) => {
      const name = originalStoredFileName(entry.path);
      const storedBase = String(entry.path || "").split("/").pop() || "";
      const timestamp = Number(storedBase.split("-")[0] || 0);
      return {
        id: `durable-${entry.sha}`,
        name,
        type: inferMimeType(name),
        size: Number(entry.size || 0),
        status: "Stored",
        storage: "github",
        storageRepository: VA_FILE_STORAGE_REPOSITORY,
        storageBranch: VA_FILE_STORAGE_BRANCH,
        storagePath: entry.path,
        storageSha: entry.sha,
        uploadedAt: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null,
        location: `Durable VA storage · ${entry.path}`,
      };
    })
    .sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0));
}

async function githubRequest(token, path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Viking-Aries",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || `GitHub request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function normalizeRepository(value) {
  const repository = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return "";
  return repository;
}

async function githubReadFile(token, repository, path, ref = "main") {
  const safeRepo = normalizeRepository(repository);
  if (!safeRepo) throw new Error("No valid GitHub repository is mapped to this project.");
  const safePath = String(path || "").replace(/^\/+/, "").trim();
  if (!safePath) throw new Error("A repository file path is required.");

  const payload = await githubRequest(
    token,
    `/repos/${safeRepo}/contents/${safePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref || "main")}`
  );

  if (Array.isArray(payload)) {
    return {
      type: "directory",
      path: safePath,
      ref,
      entries: payload.slice(0, 200).map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        sha: item.sha,
      })),
    };
  }

  if (payload?.type !== "file") {
    return {
      type: payload?.type || "unknown",
      path: payload?.path || safePath,
      sha: payload?.sha || null,
    };
  }

  const content = payload.encoding === "base64" ? base64ToUtf8(payload.content || "") : "";
  return {
    type: "file",
    path: payload.path,
    sha: payload.sha,
    ref,
    size: payload.size,
    truncated: content.length > 220000,
    content: content.slice(0, 220000),
  };
}

async function githubListDirectory(token, repository, path = "", ref = "main") {
  const safeRepo = normalizeRepository(repository);
  if (!safeRepo) throw new Error("No valid GitHub repository is mapped to this project.");
  const cleanPath = String(path || "").replace(/^\/+|\/+$/g, "").trim();
  const suffix = cleanPath
    ? `/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}`
    : "/contents";

  const payload = await githubRequest(
    token,
    `/repos/${safeRepo}${suffix}?ref=${encodeURIComponent(ref || "main")}`
  );
  if (!Array.isArray(payload)) {
    throw new Error("The requested GitHub path is not a directory.");
  }

  return {
    path: cleanPath || "/",
    ref,
    entries: payload.slice(0, 250).map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type,
      sha: item.sha,
      size: item.size,
    })),
  };
}

async function githubWriteFile(token, repository, { path, content, message, branch = "main" }) {
  const safeRepo = normalizeRepository(repository);
  if (!safeRepo) throw new Error("No valid GitHub repository is mapped to this project.");
  const safePath = String(path || "").replace(/^\/+/, "").trim();
  const commitMessage = String(message || "").trim().slice(0, 240);
  const fileContent = String(content ?? "");

  if (!safePath) throw new Error("A repository file path is required.");
  if (!commitMessage) throw new Error("A commit message is required.");
  if (fileContent.length > 500000) throw new Error("File content is too large for this editor action.");

  let sha;
  try {
    const existing = await githubRequest(
      token,
      `/repos/${safeRepo}/contents/${safePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch || "main")}`
    );
    if (existing?.type === "file") sha = existing.sha;
  } catch (error) {
    if (!/Not Found/i.test(error.message)) throw error;
  }

  const body = {
    message: commitMessage,
    content: utf8ToBase64(fileContent),
    branch: branch || "main",
  };
  if (sha) body.sha = sha;

  const payload = await githubRequest(
    token,
    `/repos/${safeRepo}/contents/${safePath.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  return {
    ok: true,
    repository: safeRepo,
    path: payload?.content?.path || safePath,
    branch: branch || "main",
    contentSha: payload?.content?.sha || null,
    commitSha: payload?.commit?.sha || null,
    commitUrl: payload?.commit?.html_url || null,
  };
}

async function githubReplaceText(token, repository, {
  path,
  oldText,
  newText,
  message,
  branch = "main",
  expectedOccurrences = 1,
}) {
  const safeRepo = normalizeRepository(repository);
  if (!safeRepo) throw new Error("No valid GitHub repository is mapped to this project.");

  const safePath = String(path || "").replace(/^\/+/, "").trim();
  const searchText = String(oldText ?? "");
  const replacementText = String(newText ?? "");
  const commitMessage = String(message || "").trim().slice(0, 240);
  const expected = Number(expectedOccurrences);

  if (!safePath) throw new Error("A repository file path is required.");
  if (!searchText) throw new Error("oldText is required.");
  if (!commitMessage) throw new Error("A commit message is required.");
  if (!Number.isInteger(expected) || expected < 1 || expected > 50) {
    throw new Error("expectedOccurrences must be an integer between 1 and 50.");
  }

  const existing = await githubRequest(
    token,
    `/repos/${safeRepo}/contents/${safePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch || "main")}`
  );

  if (existing?.type !== "file") {
    throw new Error("The requested GitHub path is not a file.");
  }

  const currentContent =
    existing.encoding === "base64" ? base64ToUtf8(existing.content || "") : "";

  const matches = currentContent.split(searchText).length - 1;
  if (matches !== expected) {
    throw new Error(
      `Target text matched ${matches} time(s); expected exactly ${expected}. Re-read the file and use a more specific oldText block.`
    );
  }

  const updatedContent = currentContent.split(searchText).join(replacementText);
  if (updatedContent === currentContent) {
    throw new Error("The replacement produced no change.");
  }
  if (updatedContent.length > 500000) {
    throw new Error("Updated file content is too large for this editor action.");
  }

  const payload = await githubRequest(
    token,
    `/repos/${safeRepo}/contents/${safePath.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        content: utf8ToBase64(updatedContent),
        branch: branch || "main",
        sha: existing.sha,
      }),
    }
  );

  return {
    ok: true,
    repository: safeRepo,
    path: payload?.content?.path || safePath,
    branch: branch || "main",
    replacements: matches,
    contentSha: payload?.content?.sha || null,
    commitSha: payload?.commit?.sha || null,
    commitUrl: payload?.commit?.html_url || null,
  };
}

function githubToolsEnabled(authenticated, token, repository) {
  return Boolean(authenticated && token && normalizeRepository(repository));
}

function buildGithubTools() {
  return [
    {
      type: "function",
      name: "github_list_directory",
      description: "List files and folders in the currently selected project's mapped GitHub repository. The repository itself is fixed by the project mapping.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to repository root. Use an empty string for the root." },
          ref: { type: "string", description: "Branch or ref. Defaults to the project's default branch." },
        },
        required: ["path"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "github_read_file",
      description: "Read a file from the currently selected project's mapped GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repository root." },
          ref: { type: "string", description: "Branch or ref. Defaults to the project's default branch." },
        },
        required: ["path"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "github_write_file",
      description: "Create or replace one file in the currently selected project's mapped GitHub repository and commit the change. Use only when the user explicitly wants a repository edit.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repository root." },
          content: { type: "string", description: "Complete new file content." },
          message: { type: "string", description: "Concise Git commit message." },
          branch: { type: "string", description: "Target branch. Defaults to the project's default branch." },
        },
        required: ["path", "content", "message"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "github_replace_text",
      description: "Safely edit part of an existing file in the selected project's mapped GitHub repository. The runtime reads the latest file, requires oldText to match exactly the expected number of times, replaces it with newText, and commits using the current blob SHA. Prefer this for targeted edits to large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Existing file path relative to repository root." },
          oldText: { type: "string", description: "Exact existing text block to replace. Include enough surrounding context to make the match unique." },
          newText: { type: "string", description: "Replacement text block." },
          message: { type: "string", description: "Concise Git commit message." },
          branch: { type: "string", description: "Target branch. Defaults to the project's default branch." },
          expectedOccurrences: { type: "integer", description: "Exact number of expected matches. Defaults to 1.", minimum: 1, maximum: 50 },
        },
        required: ["path", "oldText", "newText", "message"],
        additionalProperties: false,
      },
      strict: false,
    },
  ];
}


async function cloudflareRequest(token, path, init = {}) {
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const apiMessage = Array.isArray(payload?.errors) && payload.errors.length
      ? payload.errors.map((item) => item.message || item.code).join("; ")
      : null;
    throw new Error(apiMessage || `Cloudflare request failed with status ${response.status}`);
  }
  return payload;
}

async function cloudflareVerifyToken(token) {
  const payload = await cloudflareRequest(token, "/user/tokens/verify");
  return {
    status: payload?.result?.status || null,
    id: payload?.result?.id || null,
    expiresOn: payload?.result?.expires_on || null,
  };
}

async function cloudflareStoreVikingAriesSecret(cloudflareToken, name, value) {
  await cloudflareRequest(
    cloudflareToken,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/vikingaries/secrets`,
    {
      method: "PUT",
      body: JSON.stringify({
        name,
        text: value,
        type: "secret_text",
      }),
    }
  );
}

async function cloudflareStoreVikingAriesToken(token) {
  await cloudflareStoreVikingAriesSecret(token, "CLOUDFLARE_API_TOKEN", token);
}

async function cloudflareWorkerRecord(token, workerName) {
  if (!workerName) throw new Error("No Cloudflare Worker is registered for this project.");
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts`
  );
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  const worker = rows.find((item) => item?.id === workerName);
  if (!worker) throw new Error(`Cloudflare Worker "${workerName}" was not found in this account.`);
  return worker;
}

async function cloudflareListVersions(token, workerName) {
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(workerName)}/versions?per_page=10`
  );
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  return rows.slice(0, 10).map((item) => ({
    id: item.id || null,
    number: item.number || null,
    createdOn: item.metadata?.created_on || null,
    modifiedOn: item.metadata?.modified_on || null,
    source: item.metadata?.source || null,
    authorEmail: item.metadata?.author_email || null,
  }));
}

async function cloudflareListDeployments(token, workerName) {
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(workerName)}/deployments`
  );
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  return rows.slice(0, 10).map((item) => ({
    id: item.id || null,
    createdOn: item.created_on || null,
    source: item.source || null,
    strategy: item.strategy || null,
    versions: Array.isArray(item.versions)
      ? item.versions.map((version) => ({
          versionId: version.version_id,
          percentage: version.percentage,
        }))
      : [],
    message: item.annotations?.["workers/message"] || null,
    triggeredBy: item.annotations?.["workers/triggered_by"] || null,
  }));
}

async function cloudflareWorkerTag(token, workerName) {
  const worker = await cloudflareWorkerRecord(token, workerName);
  if (!worker?.tag) throw new Error("Cloudflare did not return a Worker tag for this project.");
  return worker.tag;
}

async function cloudflareListBuilds(token, workerName) {
  const tag = await cloudflareWorkerTag(token, workerName);
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/builds/workers/${encodeURIComponent(tag)}/builds`
  );
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  return rows.slice(0, 10).map((item) => ({
    buildUuid: item.build_uuid || null,
    outcome: item.build_outcome || null,
    createdOn: item.created_on || item.created_at || null,
    branch: item.build_trigger_metadata?.branch || null,
    commitHash: item.build_trigger_metadata?.commit_hash || null,
    triggerSource: item.build_trigger_metadata?.build_trigger_source || null,
    triggerName: item.build_trigger_metadata?.trigger_name || null,
    buildCommand: item.build_trigger_metadata?.build_command || null,
    deployCommand: item.build_trigger_metadata?.deploy_command || null,
  }));
}

async function cloudflareGetBuildLogs(token, buildUuid) {
  const safeUuid = String(buildUuid || "").trim();
  if (!/^[0-9a-f-]{20,}$/i.test(safeUuid)) throw new Error("A valid Cloudflare build UUID is required.");
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/builds/builds/${encodeURIComponent(safeUuid)}/logs`
  );
  const lines = Array.isArray(payload?.result?.lines) ? payload.result.lines : [];
  return {
    buildUuid: safeUuid,
    truncated: Boolean(payload?.result?.truncated),
    lines: lines.slice(-500),
  };
}

async function cloudflareListBuildTriggers(token, workerName) {
  const tag = await cloudflareWorkerTag(token, workerName);
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/builds/workers/${encodeURIComponent(tag)}/triggers`
  );
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  return rows.map((item) => ({
    uuid: item.trigger_uuid || item.uuid || null,
    name: item.trigger_name || null,
    branchIncludes: item.branch_includes || [],
    branchExcludes: item.branch_excludes || [],
    buildCommand: item.build_command || null,
    deployCommand: item.deploy_command || null,
    rootDirectory: item.root_directory || null,
  }));
}

async function cloudflareTriggerBuild(token, workerName, branch, commitHash) {
  const triggers = await cloudflareListBuildTriggers(token, workerName);
  if (!triggers.length) throw new Error("No Cloudflare build trigger is configured for this Worker.");

  const preferred = triggers.find((item) =>
    Array.isArray(item.branchIncludes) && item.branchIncludes.includes(branch)
  ) || triggers[0];

  if (!preferred?.uuid) throw new Error("Cloudflare did not return a usable build trigger UUID.");

  const body = {};
  if (branch) body.branch = branch;
  if (commitHash) body.commit_hash = commitHash;
  if (!body.branch && !body.commit_hash) body.branch = "main";

  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/builds/triggers/${encodeURIComponent(preferred.uuid)}/builds`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  return {
    ok: true,
    worker: workerName,
    trigger: preferred.name || preferred.uuid,
    buildUuid: payload?.result?.build_uuid || payload?.result?.uuid || null,
    branch: body.branch || null,
    commitHash: body.commit_hash || null,
  };
}

function cloudflareToolsEnabled(authenticated, token, workerName) {
  return Boolean(authenticated && token && workerName);
}

function buildCloudflareTools() {
  return [
    {
      type: "function",
      name: "cloudflare_get_project_status",
      description: "Inspect the selected project's registered Cloudflare Worker, including recent versions, deployments, and builds.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "cloudflare_get_build_logs",
      description: "Read Cloudflare build logs for a known build UUID belonging to the selected project's build history.",
      parameters: {
        type: "object",
        properties: {
          buildUuid: { type: "string", description: "Cloudflare build UUID." },
        },
        required: ["buildUuid"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "cloudflare_trigger_build",
      description: "Trigger the selected project's existing Cloudflare production build pipeline. Use only when the user explicitly asks to deploy or rebuild.",
      parameters: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Git branch to build. Defaults to the project's registered default branch." },
          commitHash: { type: "string", description: "Optional specific Git commit SHA to build." },
        },
        additionalProperties: false,
      },
      strict: false,
    },
  ];
}

async function executeCloudflareTool(call, token, projectMetadata) {
  let args = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    throw new Error("The Cloudflare tool arguments were invalid JSON.");
  }

  const workerName = projectMetadata.cloudflareWorker;
  if (!workerName) throw new Error("No Cloudflare Worker is registered for this project.");

  if (call.name === "cloudflare_get_project_status") {
    const [versions, deployments, builds] = await Promise.all([
      cloudflareListVersions(token, workerName),
      cloudflareListDeployments(token, workerName),
      cloudflareListBuilds(token, workerName).catch((error) => [{ error: error.message }]),
    ]);
    return {
      worker: workerName,
      versions,
      deployments,
      builds,
    };
  }

  if (call.name === "cloudflare_get_build_logs") {
    return cloudflareGetBuildLogs(token, args.buildUuid);
  }

  if (call.name === "cloudflare_trigger_build") {
    return cloudflareTriggerBuild(
      token,
      workerName,
      args.branch || projectMetadata.defaultBranch || "main",
      args.commitHash || null
    );
  }

  throw new Error(`Unsupported Cloudflare tool: ${call.name}`);
}


async function convexManagementRequest(token, path, init = {}) {
  const response = await fetch(`${CONVEX_MANAGEMENT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      payload?.errors?.[0]?.message ||
      `Convex request failed with status ${response.status}`;
    throw new Error(String(message));
  }
  return payload;
}

async function convexVerifyToken(token) {
  const payload = await convexManagementRequest(token, "/list_personal_access_tokens");
  const rows = Array.isArray(payload?.result)
    ? payload.result
    : Array.isArray(payload)
      ? payload
      : [];
  return {
    ok: true,
    tokenType: "personal_access_token",
    tokenCount: rows.length,
  };
}

async function convexGetDeployment(token, deploymentName) {
  const safeName = String(deploymentName || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(safeName)) {
    throw new Error("No valid Convex deployment is registered for this project.");
  }

  const payload = await convexManagementRequest(
    token,
    `/deployments/${encodeURIComponent(safeName)}`
  );

  const result = payload?.result || payload;
  return {
    name: result?.name || result?.deploymentName || result?.deployment_name || safeName,
    deploymentType: result?.deploymentType || result?.deployment_type || result?.type || null,
    projectId: result?.projectId || result?.project_id || null,
    projectSlug: result?.projectSlug || result?.project_slug || null,
    teamId: result?.teamId || result?.team_id || null,
    teamSlug: result?.teamSlug || result?.team_slug || null,
    cloudUrl: result?.url || result?.cloudUrl || result?.cloud_url || null,
    creationTime: result?.creationTime || result?.creation_time || result?.createdAt || null,
    raw: result,
  };
}

async function convexFindDeploymentByReference(token, teamSlug, projectSlug, reference) {
  if (!teamSlug || !projectSlug || !reference) return null;

  const response = await fetch(
    `${CONVEX_MANAGEMENT_API_BASE}/teams/${encodeURIComponent(teamSlug)}/projects/${encodeURIComponent(projectSlug)}/deployment?reference=${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (response.status === 404) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.code || payload?.error?.code || payload?.errors?.[0]?.code || "";
    if (String(code).toLowerCase().includes("deploymentnotfound")) return null;
    const message =
      payload?.message ||
      payload?.error?.message ||
      payload?.error ||
      payload?.errors?.[0]?.message ||
      `Convex deployment lookup failed with status ${response.status}`;
    throw new Error(String(message));
  }

  return payload?.result || payload;
}

function normalizeConvexDeployment(result, fallbackReference = null) {
  if (!result) return null;
  return {
    name: result?.name || result?.deploymentName || result?.deployment_name || null,
    deploymentType: result?.deploymentType || result?.deployment_type || result?.type || null,
    projectId: result?.projectId || result?.project_id || null,
    projectSlug: result?.projectSlug || result?.project_slug || null,
    teamId: result?.teamId || result?.team_id || null,
    teamSlug: result?.teamSlug || result?.team_slug || null,
    cloudUrl:
      result?.deploymentUrl ||
      result?.deployment_url ||
      result?.url ||
      result?.cloudUrl ||
      result?.cloud_url ||
      null,
    reference: result?.reference || fallbackReference,
    isDefault: Boolean(result?.isDefault ?? result?.is_default ?? false),
  };
}

async function convexProvisionDwPosStaging(token, cloudflareToken, productionDeploymentName) {
  const reference = "migration-staging";
  const production = await convexGetDeployment(token, productionDeploymentName);

  if (!production.projectId) {
    throw new Error("Convex did not return the Dakota Wireless POS project ID.");
  }
  if (production.name !== productionDeploymentName) {
    throw new Error("The registered production Convex deployment did not match the expected deployment.");
  }

  let existing = null;
  if (production.teamSlug && production.projectSlug) {
    existing = await convexFindDeploymentByReference(
      token,
      production.teamSlug,
      production.projectSlug,
      reference
    );
  }

  let created = false;
  let staging = normalizeConvexDeployment(existing, reference);

  if (!staging?.name) {
    try {
      const payload = await convexManagementRequest(
        token,
        `/projects/${encodeURIComponent(String(production.projectId))}/create_deployment`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "prod",
            region: null,
            reference,
            isDefault: false,
          }),
        }
      );
      staging = normalizeConvexDeployment(payload?.result || payload, reference);
      created = true;
    } catch (error) {
      // If another request created the same reference first, resolve it by reference
      // rather than creating a second staging backend.
      if (production.teamSlug && production.projectSlug) {
        const retry = await convexFindDeploymentByReference(
          token,
          production.teamSlug,
          production.projectSlug,
          reference
        );
        staging = normalizeConvexDeployment(retry, reference);
      }
      if (!staging?.name) throw error;
    }
  }

  if (!staging?.name || !staging?.cloudUrl) {
    throw new Error("Convex created or found staging, but did not return a usable deployment name and URL.");
  }
  if (staging.name === productionDeploymentName || staging.isDefault) {
    throw new Error("Safety check failed: staging resolved to the default production deployment.");
  }

  let deployKeyStored = false;
  if (cloudflareToken) {
    const keyPayload = await convexManagementRequest(
      token,
      `/deployments/${encodeURIComponent(staging.name)}/create_deploy_key`,
      {
        method: "POST",
        body: JSON.stringify({ name: "viking-aries-dw-pos-migration-staging" }),
      }
    );
    const deployKey =
      keyPayload?.result?.deployKey ||
      keyPayload?.deployKey ||
      keyPayload?.result?.deploy_key ||
      keyPayload?.deploy_key ||
      null;

    if (!deployKey) {
      throw new Error("Convex staging was created, but no deploy key was returned.");
    }

    await cloudflareStoreVikingAriesSecret(
      cloudflareToken,
      "DW_POS_STAGING_CONVEX_DEPLOY_KEY",
      deployKey
    );
    deployKeyStored = true;
  }

  return {
    created,
    reference,
    deployment: staging,
    productionDeployment: productionDeploymentName,
    deployKeyStored,
  };
}

function convexToolsEnabled(authenticated, token, deploymentName) {
  return Boolean(authenticated && token && deploymentName);
}

function buildConvexTools() {
  return [
    {
      type: "function",
      name: "convex_get_deployment_status",
      description: "Inspect the selected project's server-registered Convex deployment using the shared PERSONAL Convex connection.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      strict: false,
    },
  ];
}

async function executeConvexTool(call, token, projectMetadata) {
  if (call.name !== "convex_get_deployment_status") {
    throw new Error(`Unsupported Convex tool: ${call.name}`);
  }
  return convexGetDeployment(token, projectMetadata.backendDeployment);
}

function extractFunctionCalls(payload) {
  return (payload?.output || []).filter((item) => item?.type === "function_call");
}

async function executeGithubTool(call, token, projectMetadata) {
  let args = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    throw new Error("The GitHub tool arguments were invalid JSON.");
  }

  const repository = projectMetadata.repository;
  const defaultBranch = projectMetadata.defaultBranch || "main";

  if (call.name === "github_list_directory") {
    return githubListDirectory(token, repository, args.path || "", args.ref || defaultBranch);
  }
  if (call.name === "github_read_file") {
    return githubReadFile(token, repository, args.path, args.ref || defaultBranch);
  }
  if (call.name === "github_write_file") {
    return githubWriteFile(token, repository, {
      path: args.path,
      content: args.content,
      message: args.message,
      branch: args.branch || defaultBranch,
    });
  }
  if (call.name === "github_replace_text") {
    return githubReplaceText(token, repository, {
      path: args.path,
      oldText: args.oldText,
      newText: args.newText,
      message: args.message,
      branch: args.branch || defaultBranch,
      expectedOccurrences: args.expectedOccurrences ?? 1,
    });
  }

  throw new Error(`Unsupported tool: ${call.name}`);
}

function buildVerifiedActionReceipt(call, result, projectMetadata) {
  let args = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    args = {};
  }

  const recordedAt = new Date().toISOString();

  if (
    (call.name === "github_write_file" || call.name === "github_replace_text") &&
    result?.commitSha
  ) {
    return {
      provider: "GitHub",
      action: "repository_write",
      tool: call.name,
      repository: result.repository || projectMetadata.repository || null,
      path: result.path || String(args.path || "").trim() || null,
      branch:
        result.branch ||
        String(args.branch || projectMetadata.defaultBranch || "main").trim() ||
        "main",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl || null,
      commitMessage: String(args.message || "").trim().slice(0, 240) || null,
      recordedAt,
    };
  }

  if (call.name === "cloudflare_trigger_build") {
    return {
      provider: "Cloudflare",
      action: "build_trigger",
      tool: call.name,
      worker: projectMetadata.cloudflareWorker || null,
      branch:
        String(args.branch || projectMetadata.defaultBranch || "main").trim() ||
        "main",
      commitHash: String(args.commitHash || "").trim() || null,
      buildId:
        result?.uuid ||
        result?.id ||
        result?.build_uuid ||
        result?.buildId ||
        null,
      recordedAt,
    };
  }

  return null;
}

function formatVerifiedActionHistory(receipts) {
  if (!Array.isArray(receipts) || !receipts.length) return "";
  return receipts
    .slice(-40)
    .map((receipt) => {
      if (receipt?.provider === "GitHub") {
        const commit = receipt.commitSha ? String(receipt.commitSha).slice(0, 12) : "unknown";
        return [
          "GitHub write",
          receipt.repository ? `repo=${receipt.repository}` : "",
          receipt.path ? `path=${receipt.path}` : "",
          receipt.branch ? `branch=${receipt.branch}` : "",
          `commit=${commit}`,
          receipt.commitMessage ? `message=${receipt.commitMessage}` : "",
          receipt.recordedAt ? `at=${receipt.recordedAt}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
      }
      if (receipt?.provider === "Cloudflare") {
        return [
          "Cloudflare build trigger",
          receipt.worker ? `worker=${receipt.worker}` : "",
          receipt.branch ? `branch=${receipt.branch}` : "",
          receipt.commitHash ? `commit=${receipt.commitHash}` : "",
          receipt.buildId ? `build=${receipt.buildId}` : "",
          receipt.recordedAt ? `at=${receipt.recordedAt}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
      }
      return JSON.stringify(receipt);
    })
    .join("\n");
}

function retryDelayMs(response, payload, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(10000, Math.max(250, retryAfter * 1000));
  }

  const message = String(payload?.error?.message || "");
  const match = message.match(/try again in\s+([0-9.]+)\s*(ms|s)/i);
  if (match) {
    const amount = Number(match[1]);
    if (Number.isFinite(amount)) {
      return Math.min(10000, Math.max(250, match[2].toLowerCase() === "ms" ? amount : amount * 1000));
    }
  }

  return Math.min(8000, 750 * 2 ** attempt);
}

async function callOpenAI({ apiKey, model, instructions, input, tools, previousResponseId, finalOnly = false }) {
  const body = {
    model,
    instructions,
    input,
    // Repository writes may require the model to emit the complete contents of a
    // large source file as function-call arguments. A 3k cap can truncate the
    // tool call before it is valid, leaving the response with no user-facing text.
    max_output_tokens: 30000,
  };
  if (tools?.length) body.tools = tools;
  if (finalOnly) body.tool_choice = "none";
  if (previousResponseId) body.previous_response_id = previousResponseId;

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (response.ok) return payload;

    const error = new Error(payload?.error?.message || "The AI service returned an error.");
    error.status = response.status;
    lastError = error;

    if (response.status !== 429 || attempt === 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, payload, attempt)));
  }

  throw lastError || new Error("The AI service returned an error.");
}

function expandPdfAttachments(messages) {
  const marker = /\\[VA_PDF_ATTACHMENT:(data:application\\/pdf;base64,[A-Za-z0-9+/=\\r\\n]+)\\]/i;
  return messages.map((message) => {
    if (message?.role !== "user" || typeof message?.content !== "string") return message;
    const match = message.content.match(marker);
    if (!match) return message;

    const visibleText = message.content.replace(marker, "").trim();
    return {
      ...message,
      content: [
        ...(visibleText ? [{ type: "input_text", text: visibleText }] : []),
        { type: "input_file", filename: "attached.pdf", file_data: match[1] },
      ],
    };
  });
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}


const VA_CONVEX_SITE_URL = "https://flippant-mandrill-487.convex.site";

async function recordVAUsage(env, record) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) return { recorded: false, reason: "VA_USAGE_INGEST_SECRET is not configured." };

  const response = await fetch(`${VA_CONVEX_SITE_URL}/usage/record`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(5000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.id) {
    throw new Error("API usage could not be saved.");
  }
  return { recorded: true, id: payload?.id || null };
}

async function readVAUsage(env, days) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(
    `${VA_CONVEX_SITE_URL}/usage/summary?days=${encodeURIComponent(days)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Usage store returned status ${response.status}`);
  }
  return payload;
}

async function readVAState(env) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(`${VA_CONVEX_SITE_URL}/state`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `State store returned status ${response.status}`);
  }
  return payload;
}

async function writeVAState(env, entry) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(`${VA_CONVEX_SITE_URL}/state`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `State store returned status ${response.status}`);
  }
  return payload;
}

function jobProgressStateKey(jobId) {
  const safeJob = String(jobId || "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .slice(0, 120);
  return safeJob ? `viking-aries:progress:${safeJob}` : "";
}

function describeRuntimeTool(call) {
  let args = {};
  try {
    args = JSON.parse(call?.arguments || "{}");
  } catch {
    args = {};
  }

  const path = String(args.path || "").trim();
  const labels = {
    github_list_directory: path ? `Inspecting repository folder: ${path}` : "Inspecting repository files",
    github_read_file: path ? `Reading file: ${path}` : "Reading repository file",
    github_write_file: path ? `Writing file: ${path}` : "Writing repository file",
    github_replace_text: path ? `Editing file: ${path}` : "Editing repository file",
    cloudflare_get_project_status: "Checking Cloudflare deployment status",
    cloudflare_get_build_logs: "Reading Cloudflare build logs",
    cloudflare_trigger_build: "Starting Cloudflare build",
    convex_get_deployment_status: "Checking Convex deployment status",
  };

  return labels[call?.name] || "Running project tool";
}

async function persistJobProgress(env, jobId, progress) {
  const key = jobProgressStateKey(jobId);
  if (!key) return;
  try {
    await writeVAState(env, {
      key,
      value: JSON.stringify(progress.slice(-60)),
      updatedAt: Date.now(),
    });
  } catch {
    // Progress is informational and must never make the actual AI job fail.
  }
}

function verifiedActionStateKey(projectId, threadId) {
  const safeProject = String(projectId || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 100);
  const safeThread = String(threadId || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 120);
  return `viking-aries:audit:actions:${safeProject}:${safeThread}`;
}

function actionReceiptIdentity(receipt) {
  if (receipt?.provider === "GitHub" && receipt?.commitSha) {
    return `github:${receipt.commitSha}`;
  }
  if (receipt?.provider === "Cloudflare") {
    return `cloudflare:${receipt.buildId || ""}:${receipt.commitHash || ""}:${receipt.recordedAt || ""}`;
  }
  return JSON.stringify(receipt);
}

function mergeVerifiedActionReceipts(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const receipt of Array.isArray(group) ? group : []) {
      if (!receipt || typeof receipt !== "object") continue;
      const identity = actionReceiptIdentity(receipt);
      if (seen.has(identity)) continue;
      seen.add(identity);
      merged.push(receipt);
    }
  }
  return merged.slice(-80);
}

async function readVerifiedActionReceipts(env, projectId, threadId) {
  if (!projectId || !threadId) return [];
  const state = await readVAState(env);
  const key = verifiedActionStateKey(projectId, threadId);
  const entry = (Array.isArray(state?.entries) ? state.entries : []).find(
    (item) => item?.key === key && !item?.deleted
  );
  if (!entry || typeof entry.value !== "string") return [];
  try {
    const parsed = JSON.parse(entry.value);
    return Array.isArray(parsed) ? parsed.slice(-80) : [];
  } catch {
    return [];
  }
}

async function appendVerifiedActionReceipts(env, projectId, threadId, receipts) {
  if (!projectId || !threadId || !Array.isArray(receipts) || !receipts.length) {
    return { stored: false };
  }

  const existing = await readVerifiedActionReceipts(env, projectId, threadId);
  const merged = mergeVerifiedActionReceipts(existing, receipts);
  await writeVAState(env, {
    key: verifiedActionStateKey(projectId, threadId),
    value: JSON.stringify(merged),
    updatedAt: Date.now(),
  });
  return { stored: true, count: merged.length };
}

async function deleteVAState(env, key, updatedAt) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(
    `${VA_CONVEX_SITE_URL}/state?key=${encodeURIComponent(key)}&updatedAt=${encodeURIComponent(updatedAt)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `State store returned status ${response.status}`);
  }
  return payload;
}

async function createVAJob(env, entry) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(`${VA_CONVEX_SITE_URL}/jobs/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Job store returned status ${response.status}`);
  }
  return payload;
}

async function listVAJobs(env, projectId, limit = 50) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(
    `${VA_CONVEX_SITE_URL}/jobs/list?projectId=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(limit)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Job store returned status ${response.status}`);
  }
  return payload;
}

async function cancelVAJobs(env, projectId, threadId) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await fetch(`${VA_CONVEX_SITE_URL}/jobs/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId, threadId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Job store returned status ${response.status}`);
  }
  return payload;
}

async function internalJobAuthorized(request, env) {
  const expected = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!expected) return false;
  return safeEqual(request.headers.get("X-VA-Internal-Job-Secret") || "", expected);
}


function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/auth/status") {
      const auth = await ownerAuthConfig(env);
      const authenticated = auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : false;
      return json({
        configured: auth.configured,
        authenticated,
        sessionHours: OWNER_SESSION_SECONDS / 3600,
        diagnostics: {
          ownerAccessCodeBinding: Boolean(env.OWNER_ACCESS_CODE),
          ownerSessionSecretBinding: Boolean(env.OWNER_SESSION_SECRET),
          githubTokenBinding: Boolean(env.GITHUB_TOKEN),
          cloudflareApiTokenBinding: Boolean(env.CLOUDFLARE_API_TOKEN),
          convexPersonalAccessTokenBinding: Boolean(env.CONVEX_PERSONAL_ACCESS_TOKEN),
          vaUsageIngestSecretBinding: Boolean(env.VA_USAGE_INGEST_SECRET),
        },
      });
    }

    if (url.pathname === "/api/auth/login") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured) {
        return json(
          { error: "Owner authentication has not been configured in Cloudflare yet." },
          { status: 503 }
        );
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid login request." }, { status: 400 });
      }

      const accepted = await safeEqual(body?.accessCode, auth.accessCode);
      if (!accepted) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        return json({ error: "Incorrect owner access code." }, { status: 401 });
      }

      const session = await createOwnerSession(auth.sessionSecret);
      return json(
        { ok: true, authenticated: true },
        { headers: { "Set-Cookie": ownerCookie(session) } }
      );
    }

    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }
      return json(
        { ok: true, authenticated: false },
        { headers: { "Set-Cookie": clearOwnerCookie() } }
      );
    }

    if (
      url.pathname === "/api/files/upload" ||
      url.pathname === "/api/files/download" ||
      url.pathname === "/api/files/delete" ||
      url.pathname === "/api/files/list"
    ) {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      if (url.pathname === "/api/files/list" && request.method === "GET") {
        return json({
          ok: true,
          files: [],
          storageStatus: "secure-storage-migration",
          message:
            "GitHub-backed hardcopy storage is retired. Project hardcopies are being kept in the private Library archive until a private VA storage backend is connected.",
        });
      }

      return json(
        {
          error:
            "Hardcopy upload/download through VA is temporarily disabled while private storage is being connected. Use the project's private Files & Media Library archive for durable files.",
          storageStatus: "secure-storage-migration",
        },
        { status: 503 }
      );
    }

    if (url.pathname === "/api/projects/dw-pos/staging/convex") {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const projectConfig = PROJECT_RUNTIME_CONFIG["dw-pos"];
      if (
        projectConfig?.repository !== "dakotawireless/Dakota-Wireless-POS---New" ||
        projectConfig?.backendDeployment !== "sleek-bear-647"
      ) {
        return json(
          { error: "DW POS production mapping failed the staging safety check." },
          { status: 409 }
        );
      }

      const [convexToken, cloudflareToken] = await Promise.all([
        resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN),
        resolveSecret(env.CLOUDFLARE_API_TOKEN),
      ]);

      if (!convexToken) {
        return json(
          { error: "The shared Convex personal connection is not configured." },
          { status: 503 }
        );
      }
      if (!cloudflareToken) {
        return json(
          { error: "The shared Cloudflare connection is not configured, so the staging deploy key cannot be stored securely." },
          { status: 503 }
        );
      }

      try {
        const result = await convexProvisionDwPosStaging(
          convexToken,
          cloudflareToken,
          projectConfig.backendDeployment
        );
        return json({ ok: true, ...result });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Could not provision the DW POS staging Convex deployment.",
          },
          { status: 502 }
        );
      }
    }

    if (url.pathname === "/api/integrations/status") {
      const auth = await ownerAuthConfig(env);
      const authenticated = auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : false;
      const [githubToken, cloudflareToken, convexToken] = await Promise.all([
        resolveSecret(env.GITHUB_TOKEN),
        resolveSecret(env.CLOUDFLARE_API_TOKEN),
        resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN),
      ]);
      const projectConfig = registeredProjectConfig(url.searchParams.get("projectId"));

      let githubRepositoryAccessible = false;
      let githubRepositoryError = null;
      if (
        auth.configured &&
        authenticated &&
        githubToken &&
        projectConfig?.repository
      ) {
        try {
          await githubListDirectory(
            githubToken,
            projectConfig.repository,
            "",
            projectConfig.defaultBranch || "main"
          );
          githubRepositoryAccessible = true;
        } catch (error) {
          githubRepositoryError =
            error instanceof Error ? error.message : "Repository access check failed.";
        }
      }

      return json({
        ownerAuth: {
          configured: auth.configured,
          authenticated,
        },
        project: projectConfig
          ? {
              registered: true,
              repository: projectConfig.repository || null,
              defaultBranch: projectConfig.defaultBranch || "main",
              cloudflareWorker: projectConfig.cloudflareWorker || null,
              backend: projectConfig.backend || null,
              backendDeployment: projectConfig.backendDeployment || null,
            }
          : { registered: false },
        providers: {
          github: {
            configured: Boolean(githubToken),
            mapped: Boolean(projectConfig?.repository),
            repositoryAccessible: githubRepositoryAccessible,
            repositoryError: githubRepositoryError,
            usable: Boolean(
              auth.configured &&
              authenticated &&
              githubToken &&
              projectConfig?.repository &&
              githubRepositoryAccessible
            ),
          },
          cloudflare: {
            configured: Boolean(cloudflareToken),
            usable: Boolean(
              auth.configured &&
              authenticated &&
              cloudflareToken &&
              projectConfig?.cloudflareWorker
            ),
          },
          convex: {
            configured: Boolean(convexToken),
            mapped: Boolean(projectConfig?.backendDeployment),
            usable: Boolean(
              auth.configured &&
              authenticated &&
              convexToken &&
              projectConfig?.backendDeployment
            ),
          },
          drive: { configured: false, usable: false },
          gmail: { configured: false, usable: false },
        },
      });
    }

    if (url.pathname === "/api/github/verify") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      const githubToken = await resolveSecret(env.GITHUB_TOKEN);
      if (!githubToken) {
        return json({ error: "GITHUB_TOKEN is not configured in Cloudflare." }, { status: 503 });
      }

      const projectConfig = registeredProjectConfig(url.searchParams.get("projectId"));

      try {
        const profile = await githubRequest(githubToken, "/user");

        if (projectConfig?.repository) {
          try {
            await githubListDirectory(
              githubToken,
              projectConfig.repository,
              "",
              projectConfig.defaultBranch || "main"
            );
          } catch (error) {
            return json(
              {
                error: `GitHub token is valid for ${profile?.login || "the connected account"}, but it cannot access ${projectConfig.repository}: ${error instanceof Error ? error.message : "Not Found"}`,
                login: profile?.login || null,
                repository: projectConfig.repository,
                repositoryAccessible: false,
              },
              { status: 403 }
            );
          }
        }

        return json({
          ok: true,
          login: profile?.login || null,
          name: profile?.name || null,
          repository: projectConfig?.repository || null,
          defaultBranch: projectConfig?.defaultBranch || "main",
          repositoryAccessible: Boolean(projectConfig?.repository),
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "GitHub verification failed." }, { status: 502 });
      }
    }

    if (url.pathname === "/api/github/configure") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid GitHub connection request." }, { status: 400 });
      }

      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (token.length < 20 || token.length > 4096) {
        return json({ error: "Enter a valid GitHub token." }, { status: 400 });
      }

      const projectConfig = registeredProjectConfig(
        typeof body?.projectId === "string" ? body.projectId : ""
      );
      if (!projectConfig?.repository) {
        return json({ error: "This project does not have a registered GitHub repository." }, { status: 400 });
      }

      try {
        const profile = await githubRequest(token, "/user");
        await githubListDirectory(
          token,
          projectConfig.repository,
          "",
          projectConfig.defaultBranch || "main"
        );

        const cloudflareToken = await resolveSecret(env.CLOUDFLARE_API_TOKEN);
        if (!cloudflareToken) {
          return json(
            {
              error:
                "The GitHub token is valid and can access this repository, but Cloudflare must be connected before Viking Aries can securely save the replacement GITHUB_TOKEN.",
            },
            { status: 503 }
          );
        }

        await cloudflareStoreVikingAriesSecret(
          cloudflareToken,
          "GITHUB_TOKEN",
          token
        );

        return json({
          ok: true,
          login: profile?.login || null,
          name: profile?.name || null,
          repository: projectConfig.repository,
          defaultBranch: projectConfig.defaultBranch || "main",
          repositoryAccessible: true,
        });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "GitHub connection failed.",
          },
          { status: 502 }
        );
      }
    }

    if (url.pathname === "/api/cloudflare/configure") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid Cloudflare connection request." }, { status: 400 });
      }

      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (token.length < 20 || token.length > 4096) {
        return json({ error: "Enter a valid Cloudflare API token." }, { status: 400 });
      }

      try {
        const verification = await cloudflareVerifyToken(token);
        if (verification.status !== "active") {
          return json({ error: `Cloudflare token status is ${verification.status || "unknown"}.` }, { status: 400 });
        }

        // Confirm the token can see the Viking Aries Worker before persisting it.
        await cloudflareWorkerRecord(token, "vikingaries");

        // Persist only in Cloudflare's Worker secret store. The token is never
        // written to GitHub, localStorage, Convex state, or the response body.
        await cloudflareStoreVikingAriesToken(token);

        return json({
          ok: true,
          status: verification.status,
          accountId: CLOUDFLARE_ACCOUNT_ID,
          worker: "vikingaries",
        });
      } catch (error) {
        return json({ error: error.message || "Cloudflare connection failed." }, { status: 502 });
      }
    }

    if (url.pathname === "/api/cloudflare/verify") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      const cloudflareToken = await resolveSecret(env.CLOUDFLARE_API_TOKEN);
      if (!cloudflareToken) {
        return json({ error: "CLOUDFLARE_API_TOKEN is not configured in Cloudflare runtime secrets." }, { status: 503 });
      }

      const projectId = (url.searchParams.get("projectId") || "").trim();
      const projectConfig = projectId ? registeredProjectConfig(projectId) : null;

      try {
        const verification = await cloudflareVerifyToken(cloudflareToken);
        let worker = null;
        if (projectConfig?.cloudflareWorker) {
          const record = await cloudflareWorkerRecord(
            cloudflareToken,
            projectConfig.cloudflareWorker
          );
          worker = {
            id: record?.id || projectConfig.cloudflareWorker,
            tag: record?.tag || null,
            modifiedOn: record?.modified_on || null,
          };
        }

        return json({
          ok: verification.status === "active",
          status: verification.status,
          tokenId: verification.id,
          expiresOn: verification.expiresOn,
          accountId: CLOUDFLARE_ACCOUNT_ID,
          projectId: projectId || null,
          worker,
        });
      } catch (error) {
        return json({ error: error.message }, { status: 502 });
      }
    }

    if (url.pathname === "/api/convex/verify") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      const convexToken = await resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN);
      if (!convexToken) {
        return json({ error: "CONVEX_PERSONAL_ACCESS_TOKEN is not configured in Cloudflare runtime secrets." }, { status: 503 });
      }

      const projectId = (url.searchParams.get("projectId") || "").trim();
      const projectConfig = projectId ? registeredProjectConfig(projectId) : null;

      try {
        const verification = await convexVerifyToken(convexToken);
        let deployment = null;
        if (projectConfig?.backend === "Convex" && projectConfig?.backendDeployment) {
          deployment = await convexGetDeployment(
            convexToken,
            projectConfig.backendDeployment
          );
        }

        return json({
          ok: true,
          tokenType: verification.tokenType,
          tokenCount: verification.tokenCount,
          projectId: projectId || null,
          deployment,
        });
      } catch (error) {
        return json({ error: error.message }, { status: 502 });
      }
    }

    if (url.pathname === "/api/usage") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      const requestedDays = Number(url.searchParams.get("days") || 30);
      const days = requestedDays === 0 ? 0 : Number.isFinite(requestedDays)
        ? Math.min(365, Math.max(1, Math.floor(requestedDays))) : 30;
      try {
        return json(await readVAUsage(env, days));
      } catch (error) {
        return json({ error: error.message }, { status: 502 });
      }
    }

    if (url.pathname === "/api/state") {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      try {
        if (request.method === "GET") {
          return json(await readVAState(env));
        }

        if (request.method === "PUT") {
          const body = await request.json();
          const key = typeof body?.key === "string" ? body.key.slice(0, 240) : "";
          const value = typeof body?.value === "string" ? body.value : null;
          const updatedAt = Number(body?.updatedAt || Date.now());
          if (!key.startsWith("viking-aries") || value === null) {
            return json({ error: "Invalid shared state update." }, { status: 400 });
          }
          return json(await writeVAState(env, { key, value, updatedAt }));
        }

        if (request.method === "DELETE") {
          const key = (url.searchParams.get("key") || "").slice(0, 240);
          const updatedAt = Number(url.searchParams.get("updatedAt") || Date.now());
          if (!key.startsWith("viking-aries")) {
            return json({ error: "Invalid shared state key." }, { status: 400 });
          }
          return json(await deleteVAState(env, key, updatedAt));
        }

        return json({ error: "Method not allowed." }, { status: 405 });
      } catch (error) {
        return json({ error: error.message || "Shared state request failed." }, { status: 502 });
      }
    }

    if (url.pathname === "/api/jobs/cancel") {
      const auth = await ownerAuthConfig(env);
      const ownerAuthenticated = auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : true;

      if (auth.configured && !ownerAuthenticated) {
        return json({ error: "Owner login required." }, { status: 401 });
      }
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      try {
        const body = await request.json();
        const projectId = typeof body?.projectId === "string" ? body.projectId.trim().slice(0, 120) : "";
        const threadId = typeof body?.threadId === "string" ? body.threadId.trim().slice(0, 160) : "";
        if (!projectId || !threadId) {
          return json({ error: "A project and thread are required." }, { status: 400 });
        }
        return json(await cancelVAJobs(env, projectId, threadId));
      } catch (error) {
        return json({ error: error.message || "Could not stop AI jobs." }, { status: 502 });
      }
    }

    if (url.pathname === "/api/jobs") {
      const auth = await ownerAuthConfig(env);
      const ownerAuthenticated = auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : true;

      if (auth.configured && !ownerAuthenticated) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      try {
        if (request.method === "POST") {
          const body = await request.json();
          const projectId =
            typeof body?.project?.id === "string" ? body.project.id.trim().slice(0, 120) : "";
          const projectName =
            typeof body?.project?.name === "string" ? body.project.name.trim().slice(0, 160) : projectId;
          const threadId =
            typeof body?.thread?.id === "string" ? body.thread.id.trim().slice(0, 160) : "";
          const threadTitle =
            typeof body?.thread?.title === "string" ? body.thread.title.trim().slice(0, 200) : "Untitled chat";
          const messages = Array.isArray(body?.messages) ? body.messages : [];
          const lastUserMessage = [...messages].reverse().find(
            (message) => message?.role === "user" && typeof message?.content === "string"
          );
          const requestedJobId =
            typeof body?.jobId === "string" ? body.jobId.trim().slice(0, 120) : "";
          const jobId = requestedJobId || crypto.randomUUID();

          if (!projectId || !threadId || !lastUserMessage) {
            return json(
              { error: "A project, thread, and user message are required." },
              { status: 400 }
            );
          }

          const userMessageId =
            typeof lastUserMessage.id === "string" && lastUserMessage.id
              ? lastUserMessage.id.slice(0, 180)
              : `user-${jobId}`;

          const normalizedBody = {
            ...body,
            jobId,
            messages: messages.map((message) => ({ ...message })),
          };
          const currentUserIndex = normalizedBody.messages.findLastIndex(
            (message) =>
              message?.role === "user" &&
              typeof message?.content === "string" &&
              message.content === lastUserMessage.content
          );
          if (currentUserIndex >= 0) {
            normalizedBody.messages[currentUserIndex] = {
              ...normalizedBody.messages[currentUserIndex],
              id: userMessageId,
              jobId,
            };
          }

          const created = await createVAJob(env, {
            jobId,
            projectId,
            projectName,
            threadId,
            threadTitle,
            requestJson: JSON.stringify(normalizedBody),
            userMessageId,
            userMessageContent: String(lastUserMessage.content).slice(0, 20000),
            model: typeof body?.model === "string" ? body.model.slice(0, 120) : undefined,
          });

          return json(created, { status: 202 });
        }

        if (request.method === "GET") {
          const projectId = (url.searchParams.get("projectId") || "").trim().slice(0, 120);
          if (!projectId) {
            return json({ error: "projectId is required." }, { status: 400 });
          }

          const result = await listVAJobs(env, projectId, 100);
          const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
          let progressByJob = new Map();

          try {
            const state = await readVAState(env);
            const jobIds = new Set(jobs.map((job) => job.jobId));
            progressByJob = new Map(
              (Array.isArray(state?.entries) ? state.entries : [])
                .filter(
                  (entry) =>
                    typeof entry?.key === "string" &&
                    entry.key.startsWith("viking-aries:progress:") &&
                    !entry.deleted
                )
                .map((entry) => {
                  const jobId = entry.key.slice("viking-aries:progress:".length);
                  if (!jobIds.has(jobId)) return null;
                  try {
                    const parsed = JSON.parse(entry.value || "[]");
                    return [jobId, Array.isArray(parsed) ? parsed.slice(-60) : []];
                  } catch {
                    return [jobId, []];
                  }
                })
                .filter(Boolean)
            );
          } catch {
            progressByJob = new Map();
          }

          return json({
            ...result,
            jobs: jobs.map((job) => ({
              ...job,
              progress: progressByJob.get(job.jobId) || [],
            })),
          });
        }

        return json({ error: "Method not allowed." }, { status: 405 });
      } catch (error) {
        return json({ error: error.message || "AI job request failed." }, { status: 502 });
      }
    }

    if (url.pathname === "/api/health") {
      const binding = env.OPENAI_API_KEY;
      const diagnostics = {
        bindingPresent: Boolean(binding),
        bindingType: typeof binding,
        hasGetMethod: Boolean(binding && typeof binding.get === "function"),
        getSucceeded: false,
        secretReadable: false,
      };

      try {
        const apiKey = await resolveSecret(binding);
        diagnostics.getSucceeded = true;
        diagnostics.secretReadable =
          typeof apiKey === "string" && apiKey.trim().length > 0;
      } catch {
        diagnostics.getSucceeded = false;
        diagnostics.secretReadable = false;
      }

      return json({
        ok: true,
        aiConfigured: diagnostics.secretReadable,
        model: env.OPENAI_MODEL || "gpt-5.6-luna",
        diagnostics,
      });
    }

    if (url.pathname !== "/api/chat") {
      return new Response("Not found", { status: 404 });
    }

    const auth = await ownerAuthConfig(env);
    const internalJobRequest = await internalJobAuthorized(request, env);
    const ownerAuthenticated = internalJobRequest
      ? true
      : auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : false;
    if (auth.configured && !ownerAuthenticated) {
      return json({ error: "Owner login required." }, { status: 401 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, { status: 405 });
    }

    const apiKey = await resolveSecret(env.OPENAI_API_KEY);

    if (!apiKey) {
      return json(
        {
          error:
            "Viking Aries is ready for live chat, but OPENAI_API_KEY has not been configured in Cloudflare yet.",
        },
        { status: 503 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request." }, { status: 400 });
    }

    const jobId =
      typeof body?.jobId === "string" ? body.jobId.trim().slice(0, 120) : "";
    const jobProgress = [];

    const beginProgress = async (label) => {
      if (!jobId) return "";
      const id = crypto.randomUUID();
      jobProgress.push({
        id,
        label: String(label || "Working").slice(0, 240),
        status: "running",
        at: Date.now(),
      });
      await persistJobProgress(env, jobId, jobProgress);
      return id;
    };

    const finishProgress = async (id, status = "done", detail = "") => {
      if (!jobId || !id) return;
      const event = jobProgress.find((item) => item.id === id);
      if (!event) return;
      event.status = status;
      event.completedAt = Date.now();
      if (detail) event.detail = String(detail).slice(0, 240);
      await persistJobProgress(env, jobId, jobProgress);
    };

    const projectName =
      typeof body?.project?.name === "string" && body.project.name.trim()
        ? body.project.name.trim().slice(0, 120)
        : "Unknown project";

    const threadTitle =
      typeof body?.thread?.title === "string" && body.thread.title.trim()
        ? body.thread.title.trim().slice(0, 160)
        : "Untitled chat";
    const threadId =
      typeof body?.thread?.id === "string" && body.thread.id.trim()
        ? body.thread.id.trim().slice(0, 180)
        : "";

    const projectId =
      typeof body?.project?.id === "string"
        ? body.project.id.trim().slice(0, 120)
        : "";
    const runtimeProject = registeredProjectConfig(projectId);

    const projectMetadata = {
      repository:
        typeof body?.project?.repository === "string"
          ? body.project.repository.trim().slice(0, 240)
          : "",
      defaultBranch:
        typeof body?.project?.defaultBranch === "string"
          ? body.project.defaultBranch.trim().slice(0, 120)
          : "",
      deploymentUrl:
        typeof body?.project?.deploymentUrl === "string"
          ? body.project.deploymentUrl.trim().slice(0, 500)
          : "",
      cloudflareWorker:
        typeof body?.project?.cloudflareWorker === "string"
          ? body.project.cloudflareWorker.trim().slice(0, 240)
          : "",
      backend:
        typeof body?.project?.backend === "string"
          ? body.project.backend.trim().slice(0, 120)
          : "",
      backendDeployment:
        typeof body?.project?.backendDeployment === "string"
          ? body.project.backendDeployment.trim().slice(0, 240)
          : "",
      backendUrl:
        typeof body?.project?.backendUrl === "string"
          ? body.project.backendUrl.trim().slice(0, 500)
          : "",
      convexDashboardUrl:
        typeof body?.project?.convexDashboardUrl === "string"
          ? body.project.convexDashboardUrl.trim().slice(0, 500)
          : "",
      driveFolderUrl:
        typeof body?.project?.driveFolderUrl === "string"
          ? body.project.driveFolderUrl.trim().slice(0, 500)
          : "",
      gmailIdentity:
        typeof body?.project?.gmailIdentity === "string"
          ? body.project.gmailIdentity.trim().slice(0, 240)
          : "",
      status:
        typeof body?.project?.status === "string"
          ? body.project.status.trim().slice(0, 120)
          : "",
      contextSummary:
        typeof body?.project?.contextSummary === "string"
          ? body.project.contextSummary.trim().slice(0, 8000)
          : "",
    };

    if (runtimeProject) {
      projectMetadata.repository = runtimeProject.repository || "";
      projectMetadata.defaultBranch = runtimeProject.defaultBranch || "main";
      projectMetadata.deploymentUrl = runtimeProject.deploymentUrl || projectMetadata.deploymentUrl;
      projectMetadata.cloudflareWorker = runtimeProject.cloudflareWorker || projectMetadata.cloudflareWorker;
      projectMetadata.backend = runtimeProject.backend || projectMetadata.backend;
      projectMetadata.backendDeployment = runtimeProject.backendDeployment || projectMetadata.backendDeployment;
      projectMetadata.backendUrl = runtimeProject.backendUrl || projectMetadata.backendUrl;
      projectMetadata.convexDashboardUrl = runtimeProject.convexDashboardUrl || projectMetadata.convexDashboardUrl;
    } else {
      // Until the durable VA backend owns project mappings, unregistered projects do not receive write-capable provider tools.
      projectMetadata.repository = "";
    }

    const messages = (() => {
      if (!Array.isArray(body?.messages)) return [];

      const candidates = body.messages
        .filter(
          (message) =>
            (message?.role === "user" || message?.role === "assistant") &&
            typeof message?.content === "string" &&
            message.content.trim()
        )
        .slice(-14);

      const MAX_TOTAL_CHARS = 70000;
      const MAX_MESSAGE_CHARS = 7000;
      let remaining = MAX_TOTAL_CHARS;
      const compact = [];

      // Build backward so the newest context is always preserved first.
      for (let index = candidates.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const message = candidates[index];
        const raw = message.content.trim();
        const limit = Math.min(MAX_MESSAGE_CHARS, remaining);
        // Keep the tail of older messages because it usually contains the outcome,
        // while the newest message keeps its beginning in full.
        const content =
          index === candidates.length - 1
            ? raw.slice(0, limit)
            : raw.length > limit
              ? raw.slice(-limit)
              : raw;
        remaining -= content.length;
        compact.unshift({ role: message.role, content });
      }

      return expandPdfAttachments(compact);
    })();

    if (!messages.length) {
      return json({ error: "At least one chat message is required." }, { status: 400 });
    }

    const allowedModels = new Set(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]);
    const requestedModel =
      typeof body?.model === "string" && allowedModels.has(body.model)
        ? body.model
        : "";
    const configuredDefaultModel =
      typeof env.OPENAI_MODEL === "string" && allowedModels.has(env.OPENAI_MODEL)
        ? env.OPENAI_MODEL
        : "gpt-5.6-luna";
    const model = requestedModel || configuredDefaultModel;
    const requestActionHistory = Array.isArray(body?.verifiedActionHistory)
      ? body.verifiedActionHistory
          .filter((receipt) => receipt && typeof receipt === "object")
          .slice(-40)
      : [];
    let durableActionHistory = [];
    try {
      durableActionHistory = await readVerifiedActionReceipts(env, projectId, threadId);
    } catch {
      // Audit history improves reliability but must never block chat.
      durableActionHistory = [];
    }
    const verifiedActionHistory = mergeVerifiedActionReceipts(
      durableActionHistory,
      requestActionHistory
    ).slice(-40);
    const verifiedActionText = formatVerifiedActionHistory(verifiedActionHistory);

    const projectFacts = [
      projectMetadata.repository ? `Repository: ${projectMetadata.repository}` : "",
      projectMetadata.defaultBranch ? `Default branch: ${projectMetadata.defaultBranch}` : "",
      projectMetadata.deploymentUrl ? `Production URL: ${projectMetadata.deploymentUrl}` : "",
      projectMetadata.cloudflareWorker ? `Cloudflare worker/project: ${projectMetadata.cloudflareWorker}` : "",
      projectMetadata.backend ? `Backend: ${projectMetadata.backend}` : "",
      projectMetadata.backendDeployment ? `Backend deployment: ${projectMetadata.backendDeployment}` : "",
      projectMetadata.backendUrl ? `Backend URL: ${projectMetadata.backendUrl}` : "",
      projectMetadata.convexDashboardUrl ? `Convex dashboard: ${projectMetadata.convexDashboardUrl}` : "",
      projectMetadata.driveFolderUrl ? `Drive folder: ${projectMetadata.driveFolderUrl}` : "",
      projectMetadata.gmailIdentity ? `Gmail identity/purpose: ${projectMetadata.gmailIdentity}` : "",
      projectMetadata.status ? `Project status: ${projectMetadata.status}` : "",
      projectMetadata.contextSummary ? `Known project context:\n${projectMetadata.contextSummary}` : "",
      verifiedActionText
        ? `Verified prior action receipts from the Viking Aries runtime:\n${verifiedActionText}`
        : "",
    ].filter(Boolean).join("\n");

    const instructions = [
      "You are Viking Aries, an AI software-building assistant inside Erik's private app-builder workspace.",
      `The currently selected project is: ${projectName}.`,
      `The current chat thread is: ${threadTitle}.`,
      projectFacts,
      "Use supplied project facts as durable project context. Do not invent missing repository, deployment, backend, credential, or file details.",
      "Be practical, concise, and implementation-oriented.",
      "Maintain awareness that Viking Aries manages multiple related projects while keeping write actions scoped to the selected project.",
      "Project records should either be stored in Viking Aries or point to a durable retrievable source such as a repository file, commit, deployment, provider record, or Drive item.",
      "Never expose secret values to the AI layer unless the owner explicitly requests that exact value for an immediate task. Secret values belong in the secure vault; normal project context should include only names, providers, purposes, and configuration status.",
      "Do not claim that you changed code, deployed an app, accessed a repository, or called an external service unless the Viking Aries runtime actually supplied a tool result or verified prior action receipt proving that action occurred.",
      "Verified prior action receipts are authoritative evidence of earlier runtime actions. When the owner asks whether an earlier write, commit, or deployment action occurred, consult those receipts before answering. Never deny an action that a verified receipt proves occurred.",
      "If the owner asks whether an earlier action occurred and no verified receipt is available, do not infer that it did not happen. Use the available provider inspection tools (for example GitHub history) to verify the current external record before answering when practical.",
      "Use any tool-backed actions supplied by the Viking Aries runtime when they are available. If a required provider action is not actually available, say exactly which connection or capability is missing instead of claiming the action occurred.",
      "When the owner explicitly asks you to make, fix, implement, update, commit, deploy, or otherwise carry out a project change, do the work with the available tools rather than stopping at diagnosis or giving instructions. Inspect the necessary files, make the requested change, commit it, and report the actual tool result. Only stop without executing when a required capability is genuinely unavailable, the request is ambiguous in a way that blocks safe execution, or the requested action would violate a safety constraint.",
      "When a requested change is successfully committed to the selected GitHub repository, report it simply as 'Changes committed to GitHub' with the commit SHA. Treat Cloudflare as the repository's automatic deployment destination; do not add a warning that deployment is unverified or say the change is not deployed unless the owner specifically asks for deployment status or a tool result shows an actual deployment failure.",
      "Preserve existing product behavior unless the owner explicitly requests a change. In particular, keep the dollar API counter in the sidebar footer beside Log Out, keep API Usage as the detail-page navigation item, and keep both surfaces backed by the recorded usage totals. Do not remove, relocate, rename, or replace them during unrelated edits.",
      "GitHub editing supports both full-file replacement and targeted exact-text replacement. Prefer github_replace_text for focused edits to existing large files: first read the latest file, choose a unique oldText block, replace only that block, and commit. Use github_write_file when creating a file or when a full-file rewrite is genuinely appropriate. File size alone is never a reason to refuse a requested change. If a targeted replacement does not match exactly as expected, re-read the file and retry with a more specific block.",
      "Work in focused batches. The runtime bounds tool calls and subrequests per message; when paused, summarize completed and remaining work accurately so the user can continue. Never repeat a verified write merely because a batch paused.",
      "For multi-file implementation work, batch independent read or inspection tool calls in the same model turn whenever safe instead of serializing every small step. Complete the requested implementation before returning a final answer.",
    ].filter(Boolean).join("\n");

    const [githubToken, cloudflareToken, convexToken] = await Promise.all([
      resolveSecret(env.GITHUB_TOKEN),
      resolveSecret(env.CLOUDFLARE_API_TOKEN),
      resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN),
    ]);
    const tools = [
      ...(githubToolsEnabled(ownerAuthenticated, githubToken, projectMetadata.repository)
        ? buildGithubTools()
        : []),
      ...(cloudflareToolsEnabled(ownerAuthenticated, cloudflareToken, projectMetadata.cloudflareWorker)
        ? buildCloudflareTools()
        : []),
      ...(convexToolsEnabled(ownerAuthenticated, convexToken, projectMetadata.backendDeployment)
        ? buildConvexTools()
        : []),
    ];

    const runtimeCapabilityNotes = [];
    if (githubToolsEnabled(ownerAuthenticated, githubToken, projectMetadata.repository)) {
      runtimeCapabilityNotes.push("GitHub read/list/write tools are available for the selected project's server-registered repository. Use them when needed, and report commit SHAs from tool results after writes.");
    }
    if (cloudflareToolsEnabled(ownerAuthenticated, cloudflareToken, projectMetadata.cloudflareWorker)) {
      runtimeCapabilityNotes.push("Cloudflare status, build-log, and build-trigger tools are available for the selected project's server-registered Worker. Trigger builds only when the user explicitly asks to deploy or rebuild.");
    }
    if (convexToolsEnabled(ownerAuthenticated, convexToken, projectMetadata.backendDeployment)) {
      runtimeCapabilityNotes.push("Convex deployment-status tools are available for the selected project's server-registered deployment. Use GitHub tools to inspect or edit convex/schema.ts and convex function source, and use the project's existing deployment pipeline for backend deploys unless a direct Convex deployment action is explicitly available.");
    }

    const runtimeInstructions = runtimeCapabilityNotes.length
      ? `${instructions}\n${runtimeCapabilityNotes.join("\n")}`
      : instructions;

    let payload;
    let budgetPaused = false;
    let executedTools = 0;
    const actionReceipts = [];
    let chatUsage = {
      requests: 0,
      inputTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    let usageRecorded = true;
    const usageWarning = () => usageRecorded ? "" : " API Counter warning: some usage could not be saved; totals may be incomplete.";
    const captureUsage = async (response) => {
      if (!response?.usage) {
        usageRecorded = false;
        return;
      }
      const usage = openAIUsageForResponse(model, response);
      chatUsage = addUsageTotals(chatUsage, usage);
      // Save each provider response before running tools or requesting another.
      // Later failures must not erase calls that have already consumed tokens.
      try {
        const recorded = await recordVAUsage(env, {
          projectId: projectId || "unknown",
          projectName,
          threadId: typeof body?.thread?.id === "string" ? body.thread.id.trim().slice(0, 180) : "",
          provider: "OpenAI",
          model,
          responseId: response.id || "",
          ...usage,
          createdAt: Date.now(),
        });
        if (!recorded.recorded) usageRecorded = false;
      } catch {
        usageRecorded = false;
      }
    };
    try {
      const analysisProgressId = await beginProgress("Analyzing request");
      payload = await callOpenAI({
        apiKey,
        model,
        instructions: runtimeInstructions,
        input: messages,
        tools,
      });
      await captureUsage(payload);
      await finishProgress(analysisProgressId, "done");

      for (let step = 0; step < MAX_AGENT_ROUNDS; step += 1) {
        const calls = extractFunctionCalls(payload);
        if (!calls.length) break;

        const outputs = [];
        for (const call of calls) {
          // Reserve four provider calls, two audit operations, and finalization.
          if (budgetPaused || executedTools >= MAX_AGENT_TOOLS || remainingRequests() < 8) {
            budgetPaused = true;
            outputs.push({ type: "function_call_output", call_id: call.call_id,
              output: JSON.stringify({ ok: false, deferred: true, error: "Not executed: this batch reached its request budget. Ask the user to continue in a new message." }) });
            continue;
          }
          executedTools += 1;
          const toolProgressId = await beginProgress(describeRuntimeTool(call));
          try {
            let result;
            if (call.name.startsWith("github_")) {
              result = await executeGithubTool(call, githubToken, projectMetadata);
            } else if (call.name.startsWith("cloudflare_")) {
              result = await executeCloudflareTool(call, cloudflareToken, projectMetadata);
            } else if (call.name.startsWith("convex_")) {
              result = await executeConvexTool(call, convexToken, projectMetadata);
            } else {
              throw new Error(`Unsupported runtime tool: ${call.name}`);
            }

            await finishProgress(toolProgressId, "done");

            const receipt = buildVerifiedActionReceipt(call, result, projectMetadata);
            if (receipt) {
              actionReceipts.push(receipt);
              try {
                await appendVerifiedActionReceipts(env, projectId, threadId, [receipt]);
              } catch {
                // A receipt-store outage must not turn a successful provider action into a failed action.
              }
            }

            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ ok: true, result }),
            });
          } catch (error) {
            if (error instanceof RequestBudgetExceeded) budgetPaused = true;
            await finishProgress(
              toolProgressId,
              "failed",
              error instanceof Error ? error.message : "Tool action failed"
            );
            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ ok: false, error: error.message }),
            });
          }
        }

        budgetPaused ||= step === MAX_AGENT_ROUNDS - 1 || executedTools >= MAX_AGENT_TOOLS || remainingRequests() < 8;
        payload = await callOpenAI({
          apiKey,
          model,
          instructions: runtimeInstructions + (budgetPaused
            ? "\nThis batch is paused. Summarize verified completed work and remaining work, including relevant paths and findings. Deferred tools did not run. Do not claim completion. Ask the user to send continue for a fresh execution budget."
            : ""),
          finalOnly: budgetPaused,
          input: outputs,
          tools,
          previousResponseId: payload.id,
        });
        await captureUsage(payload);
        if (budgetPaused) break;
      }
    } catch (error) {
      if (budgetPaused || error instanceof RequestBudgetExceeded) {
        return json({
          text: "Execution paused at the batch limit. The progress summary could not be generated. Send continue to inspect the current state and finish remaining work. Do not repeat completed writes.\n" + formatVerifiedActionHistory(actionReceipts) + usageWarning(),
          model, responseId: null, toolsAvailable: tools.map((tool) => tool.name),
          usage: chatUsage, usageRecorded, actionReceipts,
          executionStatus: "paused", continuationRequired: true,
        });
      }
      return json(
        { error: (error.message || "Could not reach the AI service.") + usageWarning(), usage: chatUsage, usageRecorded, actionReceipts },
        { status: error.status || 502 }
      );
    }

    const pauseNotice = "Execution paused at the batch limit. Completed actions are preserved. Send continue to work on the remaining steps.";
    const text = budgetPaused
      ? [extractResponseText(payload), pauseNotice].filter(Boolean).join("\n\n")
      : extractResponseText(payload);
    if (!text) {
      const incompleteReason =
        payload?.incomplete_details?.reason ||
        payload?.status ||
        null;
      const pendingCalls = extractFunctionCalls(payload);
      if (pendingCalls.length) {
        return json(
          {
            error:
              "The AI response ended while a tool action was still pending. Retry the request; no successful completion was returned." + usageWarning(),
            usage: chatUsage, usageRecorded,
            responseStatus: incompleteReason,
            pendingTools: pendingCalls.map((call) => call.name),
          },
          { status: 502 }
        );
      }
      return json(
        {
          error: (incompleteReason
            ? `The AI response did not complete (${incompleteReason}). Please retry.`
            : "The AI service returned no text.") + usageWarning(),
          usage: chatUsage, usageRecorded,
        },
        { status: 502 }
      );
    }


    return json({
      text: text + usageWarning(),
      model,
      responseId: payload?.id || null,
      toolsAvailable: tools.map((tool) => tool.name),
      usage: chatUsage,
      usageRecorded,
      actionReceipts,
      ...(budgetPaused ? { executionStatus: "paused", continuationRequired: true } : {}),
    });
  },
};

export default {
  fetch(request, env) {
    return new URL(request.url).pathname === "/api/chat"
      ? withRequestBudget(() => worker.fetch(request, env))
      : worker.fetch(request, env);
  },
};
