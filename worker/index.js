import {
  withRunControl,
  currentRunSignal,
  currentRunDeadlineAt,
  currentRunRecoveryAt,
  currentRunRecoveryState,
  beginRunRecoveryMode,
  updateRunRecoveryState,
} from "./run-control.js";
import { MIGRATED_PROJECTS } from "../shared/projects.js";
import { budgetedFetch as fetch, withRequestBudget, remainingRequests, resolveBoundSecret, RequestBudgetExceeded, MAX_AGENT_ROUNDS, MAX_AGENT_TOOLS, MAX_AGENT_COST_USD } from "./request-budget.js";
import { openAIUsageForResponse, addUsageTotals } from "./usage.js";
import { runtimeClockSnapshot, runtimeClockInstruction } from "./runtime-clock.js";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_REQUEST_TIMEOUT_MS = 180000;
const MAX_WRITE_ATTEMPTS_PER_PATH = 3;
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

const PROJECT_DISPLAY_NAMES = {
  "dw-pos": "Dakota Wireless POS",
  "dw-site": "Dakota Wireless Website",
  "smoke-pos": "Smoke Signals POS",
  "timekeeper": "Timekeeper",
  "viking-aries": "Viking Aries",
  "rez-lock": "Rez Lock & Key",
};

function registeredProjectName(projectId) {
  const id = String(projectId || "").trim();
  const config = registeredProjectConfig(id);
  if (!config) return id || "Unknown project";
  return PROJECT_DISPLAY_NAMES[id] || config.repository?.split("/").pop()?.replace(/[-_]+/g, " ") || id;
}

function safeOwnerProjectMetadata(projectId) {
  const id = String(projectId || "").trim();
  const config = registeredProjectConfig(id);
  if (!config) return null;
  return {
    id,
    name: registeredProjectName(id),
    repository: config.repository || null,
    defaultBranch: config.defaultBranch || "main",
    backend: config.backend || null,
    backendDeployment: config.backendDeployment || null,
    backendUrl: config.backendUrl || null,
    cloudflareWorker: config.cloudflareWorker || null,
    deploymentUrl: config.deploymentUrl || null,
    status: config.status || null,
    navigationLinks: Array.isArray(config.navigationLinks) ? config.navigationLinks : [],
    contextSummary: config.contextSummary || null,
  };
}

function projectMetadataStateKey(projectId) {
  const safe = String(projectId || "").trim().replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 120);
  return safe ? `viking-aries:project-metadata:${safe}` : "";
}

function sanitizeProjectNavigationLinks(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 20).map((item, index) => {
    const path = String(item?.path || "").trim().slice(0, 500);
    const url = String(item?.url || "").trim().slice(0, 500);
    const label = String(item?.label || item?.name || `Link ${index + 1}`).trim().slice(0, 80);
    const id = String(item?.id || label || `link-${index + 1}`)
      .trim().replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 80);
    return { id, label, ...(path ? { path } : {}), ...(url ? { url } : {}) };
  }).filter((item) => item.path || item.url);
}

function sanitizeProjectMetadataPatch(value) {
  const source = value && typeof value === "object" ? value : {};
  const patch = {};
  if (typeof source.name === "string" && source.name.trim()) patch.name = source.name.trim().slice(0, 120);
  if (typeof source.deploymentUrl === "string") patch.deploymentUrl = source.deploymentUrl.trim().slice(0, 500);
  if (typeof source.status === "string") patch.status = source.status.trim().slice(0, 80);
  if (typeof source.contextSummary === "string") patch.contextSummary = source.contextSummary.trim().slice(0, 12000);
  const links = sanitizeProjectNavigationLinks(source.navigationLinks);
  if (links) patch.navigationLinks = links;
  return patch;
}

async function readProjectMetadataOverride(env, projectId) {
  const key = projectMetadataStateKey(projectId);
  if (!key) return {};
  try {
    const state = await readVAState(env);
    const entry = (Array.isArray(state?.entries) ? state.entries : []).find(
      (item) => item?.key === key && !item?.deleted
    );
    if (!entry?.value) return {};
    const parsed = JSON.parse(entry.value);
    return sanitizeProjectMetadataPatch(parsed);
  } catch {
    return {};
  }
}

async function resolvedOwnerProjectMetadata(env, projectId) {
  const base = safeOwnerProjectMetadata(projectId);
  if (!base) return null;
  const override = await readProjectMetadataOverride(env, projectId);
  return { ...base, ...override, id: base.id, repository: base.repository, defaultBranch: base.defaultBranch, backend: base.backend, backendDeployment: base.backendDeployment, backendUrl: base.backendUrl, cloudflareWorker: base.cloudflareWorker };
}

async function updateOwnerProjectMetadata(env, projectId, patch) {
  const base = safeOwnerProjectMetadata(projectId);
  if (!base) throw new Error("That project is not a registered owner project.");
  const clean = sanitizeProjectMetadataPatch(patch);
  if (!Object.keys(clean).length) throw new Error("No supported project metadata fields were provided.");

  const existing = await readProjectMetadataOverride(env, projectId);
  const merged = { ...existing, ...clean };
  const before = { ...base, ...existing };
  const after = { ...base, ...merged };
  const changedFields = Object.keys(clean).filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));

  await writeVAState(env, {
    key: projectMetadataStateKey(projectId),
    value: JSON.stringify(merged),
    updatedAt: Date.now(),
  });

  return {
    ok: true,
    projectId,
    projectName: registeredProjectName(projectId),
    changedFields,
    metadata: after,
    protectedFields: ["repository", "defaultBranch", "cloudflareWorker", "backend", "backendDeployment", "backendUrl", "credentials", "routing"],
  };
}

function ownerProjectAliases(projectId) {
  const id = String(projectId || "").trim();
  const config = registeredProjectConfig(id);
  const aliases = new Set([
    id.toLowerCase(),
    registeredProjectName(id).toLowerCase(),
    String(config?.repository || "").split("/").pop()?.replace(/[-_]+/g, " ").toLowerCase(),
  ].filter(Boolean));
  if (id === "dw-pos") ["dakota wireless pos","dw pos"].forEach((v) => aliases.add(v));
  if (id === "dw-site") ["dakota wireless website","dw website"].forEach((v) => aliases.add(v));
  if (id === "smoke-pos") ["smoke signals pos"].forEach((v) => aliases.add(v));
  if (id === "timekeeper") ["timekeeper app"].forEach((v) => aliases.add(v));
  if (id === "rez-lock") ["rez lock","rez lock and key","rez lock & key"].forEach((v) => aliases.add(v));
  if (id === "viking-aries") ["viking aries","vikingaries"].forEach((v) => aliases.add(v));
  return [...aliases].filter((value) => value && value.length >= 3);
}

function crossProjectWriteAuthorized(selectedProjectId, targetProjectId, rawMessages) {
  const selected = String(selectedProjectId || "").trim();
  const target = String(targetProjectId || "").trim();
  if (!registeredProjectConfig(target)) return false;
  if (target === selected) return true;
  const text = latestUserText(rawMessages).toLowerCase();
  if (!text) return false;
  const targetNamed = ownerProjectAliases(target).some((alias) => text.includes(alias));
  const explicitNoWrite =
    /\b(?:do\s+not|don't|dont|without)\s+(?:make\s+)?(?:any\s+)?(?:changes?|edits?|writes?|updates?|modifications?)\b/.test(text) ||
    /\bread[-\s]?only\b/.test(text);
  if (explicitNoWrite) return false;
  const writeIntent = /\b(copy|move|use|write|edit|modify|change|update|add|remove|create|implement|integrate|sync|commit|apply|deploy|replace|share)\b/.test(text);
  return targetNamed && writeIntent;
}

function projectSecretEnvironments(projectConfig) {
  if (!projectConfig) return [];

  const branch = String(projectConfig.defaultBranch || "").toLowerCase();
  const status = String(projectConfig.status || "").toLowerCase();
  const mappedId =
    status === "migration" || branch.includes("staging") || branch.includes("migration")
      ? "staging"
      : "production";

  const destination =
    projectConfig.backend === "Convex" && projectConfig.backendDeployment
      ? `Convex · ${projectConfig.backendDeployment}`
      : projectConfig.cloudflareWorker
        ? `Cloudflare Worker · ${projectConfig.cloudflareWorker}`
        : "Secure project environment";

  return ["production", "staging", "development"].map((id) => ({
    id,
    label: id === "production" ? "Production" : id === "staging" ? "Staging" : "Development",
    available: id === mappedId,
    destination: id === mappedId ? destination : null,
  }));
}

function projectSecretEnvironmentConfig(projectConfig, environmentId) {
  const environment = projectSecretEnvironments(projectConfig).find(
    (item) => item.id === environmentId && item.available
  );
  return environment ? projectConfig : null;
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

function assertNonDestructiveFileUpdate(path, currentContent, nextContent) {
  const current = String(currentContent || "");
  const next = String(nextContent || "");
  const currentSize = new TextEncoder().encode(current).length;
  const nextSize = new TextEncoder().encode(next).length;

  // New/small files are intentionally exempt. This guard is for catastrophic
  // truncation of substantial existing source files, not ordinary refactors.
  if (currentSize < 10000) return;

  const retainedRatio = currentSize > 0 ? nextSize / currentSize : 1;
  const removedBytes = Math.max(0, currentSize - nextSize);
  const catastrophicShrink =
    retainedRatio < 0.35 ||
    (currentSize >= 50000 && removedBytes >= 40000 && retainedRatio < 0.5);

  if (!catastrophicShrink) return;

  throw new Error(
    [
      `Destructive write blocked for ${path}.`,
      `Existing file: ${currentSize.toLocaleString()} bytes; proposed file: ${nextSize.toLocaleString()} bytes (${Math.round(retainedRatio * 100)}% retained).`,
      "This looks like accidental truncation or partial-file replacement.",
      "Re-read the complete file and use github_replace_text for targeted edits. If a true full rewrite is required, break it into reviewed incremental changes instead of replacing most of a large file at once.",
    ].join(" ")
  );
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
  let currentContent = "";
  try {
    const existing = await githubRequest(
      token,
      `/repos/${safeRepo}/contents/${safePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch || "main")}`
    );
    if (existing?.type === "file") {
      sha = existing.sha;
      currentContent =
        existing.encoding === "base64" ? base64ToUtf8(existing.content || "") : "";
      assertNonDestructiveFileUpdate(safePath, currentContent, fileContent);
    }
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

async function githubWriteBinaryFile(token, repository, { path, bytes, message, branch = "main" }) {
  const safeRepo = normalizeRepository(repository);
  if (!safeRepo) throw new Error("No valid GitHub repository is mapped to this project.");
  const safePath = String(path || "").replace(/^\/+/, "").trim();
  const commitMessage = String(message || "").trim().slice(0, 240);
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!safePath) throw new Error("A repository file path is required.");
  if (!commitMessage) throw new Error("A commit message is required.");
  if (!byteArray.length) throw new Error("The binary asset is empty.");
  if (byteArray.length > 10 * 1024 * 1024) throw new Error("Binary asset exceeds the 10 MB Files & Media limit.");

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
    content: bytesToBase64(byteArray),
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
    binary: true,
    size: byteArray.length,
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
  assertNonDestructiveFileUpdate(safePath, currentContent, updatedContent);

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
      description: "Create a new file or replace a small existing file in the currently selected project's mapped GitHub repository and commit the change. For substantial existing files, prefer github_replace_text. The runtime blocks catastrophic shrinkage so a partial response cannot wipe most of a large file.",
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
      description: "Safely edit part of an existing file in the selected project's mapped GitHub repository. The runtime reads the latest file, requires oldText to match exactly the expected number of times, rejects catastrophic file shrinkage, and commits using the current blob SHA. Prefer this for targeted edits to large files.",
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


function buildVikingAriesPlatformTools() {
  return buildGithubTools().map((tool) => ({
    ...tool,
    name: tool.name.replace(/^github_/, "va_platform_"),
    description:
      "Viking Aries platform repository only (dakotawireless/VikingAries). " +
      tool.description.replace(
        /currently selected project's mapped GitHub repository|selected project's mapped GitHub repository/gi,
        "Viking Aries platform repository"
      ),
  }));
}

async function executeVikingAriesPlatformTool(call, token) {
  const mappedCall = {
    ...call,
    name: call.name.replace(/^va_platform_/, "github_"),
  };
  return executeGithubTool(mappedCall, token, {
    repository: "dakotawireless/VikingAries",
    defaultBranch: "main",
  });
}

function latestUserText(rawMessages) {
  if (!Array.isArray(rawMessages)) return "";
  const latest = [...rawMessages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message?.content === "string");
  return String(latest?.content || "").trim();
}

function openAIModelKnowledgeQuestion(rawMessages) {
  const text = latestUserText(rawMessages).toLowerCase();
  if (!text) return false;

  const modelSubject =
    /\b(astra|sol|terra|luna|gpt[- ]?6|gpt[- ]?5\.6|openai model|api model|model pricing|model capability|context window|reasoning model)\b/.test(text);
  if (!modelSubject) return false;

  // These phrases indicate the owner is asking about Viking Aries configuration
  // or requesting a platform change, not asking a generalized provider question.
  const vaSpecific =
    /\b(viking aries|vikingaries|\bva\b|model picker|model selector|routing logic|recommendation logic|worker allowlist|configured in|wired into|add astra|enable astra|use astra in)\b/.test(text);
  if (vaSpecific) return false;

  const knowledgeIntent =
    /\b(what|why|how|compare|comparison|difference|benefit|advantage|better|stronger|capable|capability|when would|when should|which model|pricing|price|cost|current|latest|available|availability)\b/.test(text);

  return knowledgeIntent;
}

function repeatedRepairDiagnosisRequested(rawMessages) {
  const latest = latestUserText(rawMessages).toLowerCase();
  if (!latest) return false;

  const repair =
    /\b(fix|repair|debug|troubleshoot|preview|blank|crash|broken|error|issue|problem|hang|stuck|queue|deploy|build|integration)\b/.test(latest);
  const failure =
    /\b(still|again|same issue|same problem|not fixed|didn't fix|did not fix|doesn't work|does not work|not working|keeps happening|keeps failing|keeps breaking|tried .* times|asked .* times|multiple times|several times)\b/.test(latest);

  if (repair && failure) return true;

  const recentUsers = (Array.isArray(rawMessages) ? rawMessages : [])
    .filter((message) => message?.role === "user" && typeof message?.content === "string")
    .slice(-8)
    .map((message) => message.content.toLowerCase());

  return recentUsers.filter(
    (text) =>
      /\b(fix|repair|debug|troubleshoot|preview|blank|crash|broken|error|issue|problem)\b/.test(text) &&
      /\b(still|again|not fixed|doesn't work|does not work|not working|keeps)\b/.test(text)
  ).length >= 2;
}

function buildCrossProjectDiagnosticTools() {
  const projectIds = Object.keys(PROJECT_RUNTIME_CONFIG).sort().join(", ");
  return [
    {
      type: "function",
      name: "diagnostic_list_project_directory",
      description:
        "Read-only cross-project diagnosis. List a directory in another registered Viking Aries project when the visible symptom may originate outside the selected project. Registered project IDs: " +
        projectIds +
        ". Never use this tool to write.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["projectId", "path"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "diagnostic_read_project_file",
      description:
        "Read-only cross-project diagnosis. Read one source file from another registered Viking Aries project to prove or rule out a cross-project failure. Registered project IDs: " +
        projectIds +
        ". Never use this tool to write.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["projectId", "path"],
        additionalProperties: false,
      },
      strict: false,
    },
  ];
}

async function executeCrossProjectDiagnosticTool(call, token) {
  const args = call?.arguments || {};
  const projectId = String(args.projectId || "").trim();
  const config = registeredProjectConfig(projectId);
  if (!config?.repository) {
    throw new Error("That project is not registered for cross-project diagnosis.");
  }

  const path = String(args.path || "").trim();
  const ref = String(args.ref || config.defaultBranch || "main").trim();

  if (call.name === "diagnostic_list_project_directory") {
    return executeGithubTool(
      { name: "github_list_directory", arguments: { path, ref } },
      token,
      { repository: config.repository, defaultBranch: config.defaultBranch || "main" }
    );
  }

  if (call.name === "diagnostic_read_project_file") {
    return executeGithubTool(
      { name: "github_read_file", arguments: { path, ref } },
      token,
      { repository: config.repository, defaultBranch: config.defaultBranch || "main" }
    );
  }

  throw new Error(`Unsupported diagnostic tool: ${call.name}`);
}

function buildOwnerProjectTools() {
  const projectIds = Object.keys(PROJECT_RUNTIME_CONFIG).sort().join(", ");
  return [
    {
      type: "function",
      name: "owner_projects_list",
      description:
        "List the owner's registered Personal projects and safe integration metadata. This is owner-wide read-only context and never returns secret values.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      strict: false,
    },
    {
      type: "function",
      name: "owner_project_get_metadata",
      description:
        "Read the effective project metadata record for a registered Personal project, including active deployment URL, status, navigation links, and protected provider mappings. Never returns secrets.",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "owner_project_update_metadata",
      description:
        "Update safe owner project metadata such as display name, active deployment URL, status, context summary, and app navigation links. This does not change repository, GitHub branch, Cloudflare Worker, Convex deployment/backend URL, credentials, or application routing. Cross-project updates require the latest user instruction to explicitly name/authorize the target project.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          name: { type: "string" },
          deploymentUrl: { type: "string" },
          status: { type: "string" },
          contextSummary: { type: "string" },
          navigationLinks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                path: { type: "string" },
                url: { type: "string" },
              },
              additionalProperties: false,
            },
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "owner_project_list_directory",
      description:
        "Read-only: list a directory in any registered owner project repository. Registered project IDs: " + projectIds + ".",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["projectId", "path"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "owner_project_read_file",
      description:
        "Read-only: read a source file from any registered owner project repository, even when another project is selected. Registered project IDs: " + projectIds + ".",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["projectId", "path"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "owner_project_write_file",
      description:
        "Write to a registered owner project repository only when the user's latest instruction explicitly names/authorizes that target project. The selected project is always an allowed write target. For unrelated projects, the runtime rejects ambiguous writes.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          content: { type: "string" },
          message: { type: "string" },
          branch: { type: "string" },
        },
        required: ["projectId", "path", "content", "message"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "owner_project_replace_text",
      description:
        "Targeted edit in a registered owner project repository only when the user's latest instruction explicitly names/authorizes that target project. The selected project is always an allowed write target.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
          message: { type: "string" },
          branch: { type: "string" },
          expectedOccurrences: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["projectId", "path", "oldText", "newText", "message"],
        additionalProperties: false,
      },
      strict: false,
    },
  ];
}

async function executeOwnerProjectTool(call, token, env, selectedProjectId, rawMessages) {
  let args = {};
  try {
    args = JSON.parse(call?.arguments || "{}");
  } catch {
    throw new Error("The owner project tool arguments were invalid JSON.");
  }

  if (call.name === "owner_projects_list") {
    const projects = await Promise.all(
      Object.keys(PROJECT_RUNTIME_CONFIG).sort().map((id) => resolvedOwnerProjectMetadata(env, id))
    );
    return {
      projects: projects.filter(Boolean),
      access: "Owner Personal projects are globally readable. Safe metadata is durably writable; repository/provider mappings remain protected. Cross-project writes require explicit authorization.",
    };
  }

  const targetProjectId = String(args.projectId || "").trim();
  const config = registeredProjectConfig(targetProjectId);
  if (!config) {
    throw new Error("That project is not a registered owner project.");
  }

  if (call.name === "owner_project_get_metadata") {
    return resolvedOwnerProjectMetadata(env, targetProjectId);
  }

  if (call.name === "owner_project_update_metadata") {
    if (!crossProjectWriteAuthorized(selectedProjectId, targetProjectId, rawMessages)) {
      throw new Error(
        `Project metadata update blocked. The latest user instruction must explicitly authorize changes to ${registeredProjectName(targetProjectId)}.`
      );
    }
    return updateOwnerProjectMetadata(env, targetProjectId, {
      name: args.name,
      deploymentUrl: args.deploymentUrl,
      status: args.status,
      contextSummary: args.contextSummary,
      navigationLinks: args.navigationLinks,
    });
  }

  if (!config.repository) {
    throw new Error("That owner project does not have a registered repository.");
  }

  if (!token) throw new Error("GitHub is not connected for repository operations.");

  const metadata = {
    repository: config.repository,
    defaultBranch: config.defaultBranch || "main",
  };

  if (call.name === "owner_project_list_directory") {
    return executeGithubTool(
      { name: "github_list_directory", arguments: JSON.stringify({ path: args.path || "", ref: args.ref }) },
      token,
      metadata
    );
  }
  if (call.name === "owner_project_read_file") {
    return executeGithubTool(
      { name: "github_read_file", arguments: JSON.stringify({ path: args.path, ref: args.ref }) },
      token,
      metadata
    );
  }

  if (!crossProjectWriteAuthorized(selectedProjectId, targetProjectId, rawMessages)) {
    throw new Error(
      `Cross-project write blocked. The latest user instruction must explicitly authorize changes to ${registeredProjectName(targetProjectId)}.`
    );
  }

  if (call.name === "owner_project_write_file") {
    return executeGithubTool(
      {
        name: "github_write_file",
        arguments: JSON.stringify({
          path: args.path,
          content: args.content,
          message: args.message,
          branch: args.branch,
        }),
      },
      token,
      metadata
    );
  }
  if (call.name === "owner_project_replace_text") {
    return executeGithubTool(
      {
        name: "github_replace_text",
        arguments: JSON.stringify({
          path: args.path,
          oldText: args.oldText,
          newText: args.newText,
          message: args.message,
          branch: args.branch,
          expectedOccurrences: args.expectedOccurrences,
        }),
      },
      token,
      metadata
    );
  }

  throw new Error(`Unsupported owner project tool: ${call.name}`);
}

function vikingAriesPlatformChangeRequested(projectId, rawMessages) {
  if (projectId === "viking-aries") return false;
  if (!Array.isArray(rawMessages)) return false;

  const latest = [...rawMessages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message?.content === "string");
  const text = String(latest?.content || "").toLowerCase();
  if (!text) return false;

  const changeVerb = /\b(redesign|redo|rework|revamp|change|modify|fix|update|build|add|remove|implement|make)\b/.test(text);
  const platformNamed = /\b(viking aries|vikingaries|va app|va platform)\b/.test(text);
  const platformSurface = /\b(secrets?|theme|sidebar|navigation|project selector|preview|ai builder|model selector|model recommendation|activity feed|chat ui|workspace settings|integrations? tab)\b/.test(text);
  const surfaceLanguage = /\b(tab|screen|page|panel|workspace|sidebar|ui|interface|app)\b/.test(text);

  return Boolean(changeVerb && (platformNamed || (platformSurface && surfaceLanguage)));
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

async function cloudflareStoreWorkerSecret(cloudflareToken, workerName, name, value) {
  if (!workerName) throw new Error("No Cloudflare Worker is registered for this project.");
  await cloudflareRequest(
    cloudflareToken,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
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

async function cloudflareStoreVikingAriesSecret(cloudflareToken, name, value) {
  return cloudflareStoreWorkerSecret(cloudflareToken, "vikingaries", name, value);
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

async function cloudflareWorkersSubdomain(token) {
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain`
  );
  return payload?.result?.subdomain || null;
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

async function cloudflareSetDeployCommand(token, triggerUuid, deployCommand) {
  const safeUuid = String(triggerUuid || "").trim();
  if (!safeUuid) throw new Error("Cloudflare did not return a build trigger UUID.");
  const payload = await cloudflareRequest(
    token,
    `/accounts/${CLOUDFLARE_ACCOUNT_ID}/builds/triggers/${encodeURIComponent(safeUuid)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ deploy_command: deployCommand }),
    }
  );
  const result = payload?.result || {};
  return {
    uuid: result.trigger_uuid || result.uuid || safeUuid,
    deployCommand: result.deploy_command || deployCommand,
  };
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

async function convexCreateTemporaryDeployKey(token, deploymentName) {
  const name = `viking-aries-secret-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const payload = await convexManagementRequest(
    token,
    `/deployments/${encodeURIComponent(deploymentName)}/create_deploy_key`,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    }
  );
  const deployKey =
    payload?.deployKey ||
    payload?.result?.deployKey ||
    payload?.deploy_key ||
    payload?.result?.deploy_key ||
    null;
  if (!deployKey) throw new Error("Convex did not return a temporary deployment key.");
  return { name, deployKey };
}

async function convexDeleteTemporaryDeployKey(token, deploymentName, deployKey) {
  try {
    const fullKey = String(deployKey || "");
    const separator = fullKey.indexOf("|");
    const id = (separator >= 0 ? fullKey.slice(separator + 1) : fullKey).trim();
    if (!id) return false;

    await convexManagementRequest(
      token,
      `/deployments/${encodeURIComponent(deploymentName)}/delete_deploy_key`,
      {
        method: "POST",
        body: JSON.stringify({ id }),
      }
    );
    return true;
  } catch {
    // Cleanup must never expose the key or turn a successful environment write
    // into a response that reveals anything about the secret.
    return false;
  }
}

async function convexDeploymentAdminRequest(backendUrl, deployKey, path, init = {}) {
  const base = String(backendUrl || "").replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+\.convex\.cloud$/i.test(base)) {
    throw new Error("This project does not have a valid Convex deployment URL.");
  }
  const response = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Convex ${deployKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error?.message ||
      payload?.error ||
      `Convex deployment request failed with status ${response.status}`;
    throw new Error(String(message));
  }
  return payload;
}

async function withTemporaryConvexDeployKey(token, projectConfig, callback) {
  const deploymentName = projectConfig?.backendDeployment;
  const backendUrl = projectConfig?.backendUrl;
  if (!deploymentName || !backendUrl) {
    throw new Error("This project does not have a registered Convex deployment.");
  }

  const { deployKey } = await convexCreateTemporaryDeployKey(token, deploymentName);
  try {
    return await callback({ deployKey, backendUrl, deploymentName });
  } finally {
    await convexDeleteTemporaryDeployKey(token, deploymentName, deployKey);
  }
}

async function convexListEnvironmentVariableNames(token, projectConfig) {
  return withTemporaryConvexDeployKey(token, projectConfig, async ({ deployKey, backendUrl }) => {
    const payload = await convexDeploymentAdminRequest(
      backendUrl,
      deployKey,
      "/list_environment_variables",
      { method: "GET" }
    );
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.result)
        ? payload.result
        : Array.isArray(payload?.environmentVariables)
          ? payload.environmentVariables
          : [];
    return rows
      .map((row) => (typeof row === "string" ? row : row?.name))
      .filter((name) => typeof name === "string" && name);
  });
}

async function convexSetEnvironmentVariable(token, projectConfig, name, value) {
  return withTemporaryConvexDeployKey(token, projectConfig, async ({ deployKey, backendUrl }) => {
    await convexDeploymentAdminRequest(
      backendUrl,
      deployKey,
      "/update_environment_variables",
      {
        method: "POST",
        body: JSON.stringify({ changes: [{ name, value }] }),
      }
    );
    return true;
  });
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

function projectFilesToolEnabled(authenticated, env, projectId) {
  return Boolean(authenticated && env.VA_USAGE_INGEST_SECRET && registeredProjectConfig(projectId));
}

function buildProjectFilesTools() {
  const projectIds = Object.keys(PROJECT_RUNTIME_CONFIG).sort().join(", ");
  return [
    {
      type: "function",
      name: "files_media_list_project_files",
      description:
        "List live Files & Media metadata from any registered owner project. projectId defaults to the selected project; pass 'all' for all registered Personal projects. Registered project IDs: " + projectIds + ".",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Optional project ID or 'all'. Defaults to the selected project." },
        },
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "files_media_search_files",
      description:
        "Search Files & Media by filename/type across all registered owner projects or within one project. Returns metadata only and never exposes storage secrets or raw bytes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          projectId: { type: "string", description: "Optional project ID. Defaults to all registered owner projects." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "files_media_get_project_file_preview",
      description:
        "Create a secure owner-authenticated preview reference for an image in any registered owner project's Files & Media. Raw storage URLs and bytes are never returned to the model.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Source project ID. Defaults to the selected project." },
          fileId: { type: "string", description: "Files & Media record ID." },
        },
        required: ["fileId"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "files_media_copy_project_file",
      description:
        "Securely copy a Files & Media asset from one registered owner project to another. The destination write must be the selected project or explicitly named/authorized by the user's latest instruction. The copied record preserves source provenance.",
      parameters: {
        type: "object",
        properties: {
          sourceProjectId: { type: "string" },
          destinationProjectId: { type: "string" },
          fileId: { type: "string" },
          name: { type: "string" },
        },
        required: ["sourceProjectId", "destinationProjectId", "fileId"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "files_media_copy_file_to_project_repository",
      description:
        "Copy a binary Files & Media asset directly into a registered owner's GitHub repository without exposing raw bytes to the model. Use this for logos, favicons, images, PDFs, and other binary assets. The destination project must be selected or explicitly authorized by the user's latest instruction.",
      parameters: {
        type: "object",
        properties: {
          sourceProjectId: { type: "string" },
          fileId: { type: "string" },
          destinationProjectId: { type: "string" },
          destinationPath: { type: "string" },
          message: { type: "string" },
          branch: { type: "string" },
        },
        required: ["sourceProjectId", "fileId", "destinationProjectId", "destinationPath", "message"],
        additionalProperties: false,
      },
      strict: false,
    },
  ];
}

async function getVAProjectFilePreview(env, projectId, fileId) {
  const listed = await listVAProjectFiles(env, projectId);
  const safeId = String(fileId || "").trim();
  const file = listed.files.find((item) => item.id === safeId);
  if (!file) throw new Error("That file is not available in the requested owner project.");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Only image files have a preview operation.");
  }
  return {
    projectId: listed.projectId,
    file: {
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: file.uploadedAt,
    },
    previewPath: `/api/files/preview?id=${encodeURIComponent(file.id)}&projectId=${encodeURIComponent(listed.projectId)}`,
    access: "The preview path requires the owner's authenticated Viking Aries session and is private/no-store.",
  };
}

async function executeProjectFilesTool(call, env, selectedProjectId, githubToken, rawMessages) {
  let args = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    throw new Error("The Files & Media tool arguments were invalid JSON.");
  }

  if (call.name === "files_media_list_project_files") {
    const requested = String(args.projectId || selectedProjectId || "").trim();
    return requested === "all" ? listVAAllProjectFiles(env) : listVAProjectFiles(env, requested);
  }
  if (call.name === "files_media_search_files") {
    const query = String(args.query || "").trim().toLowerCase();
    if (!query) throw new Error("A Files & Media search query is required.");
    const requested = String(args.projectId || "all").trim();
    const listed = requested === "all" ? await listVAAllProjectFiles(env) : await listVAProjectFiles(env, requested);
    return {
      query,
      projectId: requested,
      files: (listed.files || []).filter((file) =>
        [file.name, file.type, file.projectId, file.projectName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      ),
    };
  }
  if (call.name === "files_media_get_project_file_preview") {
    const sourceProjectId = String(args.projectId || selectedProjectId || "").trim();
    return getVAProjectFilePreview(env, sourceProjectId, args.fileId);
  }
  if (call.name === "files_media_copy_project_file") {
    const sourceProjectId = String(args.sourceProjectId || "").trim();
    const destinationProjectId = String(args.destinationProjectId || selectedProjectId || "").trim();
    if (!registeredProjectConfig(sourceProjectId) || !registeredProjectConfig(destinationProjectId)) {
      throw new Error("Both source and destination must be registered owner projects.");
    }
    if (!crossProjectWriteAuthorized(selectedProjectId, destinationProjectId, rawMessages)) {
      throw new Error(
        `Cross-project file copy blocked. The latest user instruction must explicitly authorize changes to ${registeredProjectName(destinationProjectId)}.`
      );
    }
    return copyVAProjectFile(env, {
      sourceProjectId,
      destinationProjectId,
      fileId: args.fileId,
      name: args.name,
    });
  }
  if (call.name === "files_media_copy_file_to_project_repository") {
    const sourceProjectId = String(args.sourceProjectId || "").trim();
    const destinationProjectId = String(args.destinationProjectId || selectedProjectId || "").trim();
    const destinationConfig = registeredProjectConfig(destinationProjectId);
    if (!registeredProjectConfig(sourceProjectId) || !destinationConfig?.repository) {
      throw new Error("Both source and destination must be registered owner projects.");
    }
    if (!githubToken) throw new Error("GitHub is not connected for repository asset copy.");
    if (!crossProjectWriteAuthorized(selectedProjectId, destinationProjectId, rawMessages)) {
      throw new Error(
        `Cross-project repository write blocked. The latest user instruction must explicitly authorize changes to ${registeredProjectName(destinationProjectId)}.`
      );
    }
    const asset = await readVAProjectFileBytes(env, sourceProjectId, args.fileId);
    const result = await githubWriteBinaryFile(githubToken, destinationConfig.repository, {
      path: args.destinationPath,
      bytes: asset.bytes,
      message: args.message,
      branch: args.branch || destinationConfig.defaultBranch || "main",
    });
    return {
      ...result,
      sourceProjectId,
      sourceFileId: String(args.fileId || ""),
      sourceName: asset.name,
      destinationProjectId,
    };
  }

  throw new Error(`Unsupported Files & Media tool: ${call.name}`);
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
    (
      call.name === "github_write_file" ||
      call.name === "github_replace_text" ||
      call.name === "va_platform_write_file" ||
      call.name === "va_platform_replace_text" ||
      call.name === "owner_project_write_file" ||
      call.name === "owner_project_replace_text" ||
      call.name === "files_media_copy_file_to_project_repository"
    ) &&
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

  if (call.name === "owner_project_update_metadata" && result?.ok) {
    return {
      provider: "Viking Aries",
      action: "project_metadata_update",
      tool: call.name,
      projectId: result.projectId || String(args.projectId || "").trim() || null,
      changedFields: Array.isArray(result.changedFields) ? result.changedFields : [],
      recordedAt,
    };
  }

  if (call.name === "files_media_copy_project_file" && result?.file?.id) {
    return {
      provider: "Files & Media",
      action: "project_file_copy",
      tool: call.name,
      sourceProjectId: result.sourceProjectId || String(args.sourceProjectId || "").trim() || null,
      destinationProjectId: result.destinationProjectId || String(args.destinationProjectId || "").trim() || null,
      sourceFileId: String(args.fileId || "").trim() || null,
      destinationFileId: result.file.id,
      name: result.file.name || null,
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

async function callOpenAI({
  apiKey,
  model,
  instructions,
  input,
  tools,
  previousResponseId,
  finalOnly = false,
  abortSignal = null,
  timeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
  maxOutputTokens = 12000,
}) {
  const body = {
    model,
    instructions,
    input,
    // Repository writes may require complete file contents. Recovery passes use
    // a smaller explicit limit because they never call tools.
    max_output_tokens: maxOutputTokens,
  };
  if (tools?.length) body.tools = tools;
  if (finalOnly) body.tool_choice = "none";
  if (previousResponseId) body.previous_response_id = previousResponseId;

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (abortSignal?.aborted) {
      throw abortSignal.reason || new DOMException("Aborted", "AbortError");
    }

    const timeoutSignal = AbortSignal.timeout(Math.max(1000, Math.min(OPENAI_REQUEST_TIMEOUT_MS, timeoutMs)));
    const requestSignal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutSignal])
      : timeoutSignal;

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: requestSignal,
    });

    const payload = await response.json().catch(() => null);
    if (response.ok) return payload;

    const error = new Error(payload?.error?.message || "The AI service returned an error.");
    error.status = response.status;
    lastError = error;

    if (response.status !== 429 || attempt === 3) throw error;
    if (abortSignal?.aborted) {
      throw abortSignal.reason || new DOMException("Aborted", "AbortError");
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, retryDelayMs(response, payload, attempt));
      if (!abortSignal) return;
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortSignal.reason || new DOMException("Aborted", "AbortError"));
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  throw lastError || new Error("The AI service returned an error.");
}

function expandAttachmentMarkers(messages) {
  const legacyAttachmentPattern = /\[VA_ATTACHMENT:([^|]*)\|([^|]*)\|(data:[^\]]+)\]/gi;
  const legacyPdfPattern = /\[VA_PDF_ATTACHMENT:(data:application\/pdf;base64,[A-Za-z0-9+/=\r\n]+)\]/i;
  const fileMarkerPattern = /\[VA_FILE:([^|\]]+)\|([^\]]+)\]/gi;

  const lastUserIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") return index;
    }
    return -1;
  })();

  return messages.map((message, messageIndex) => {
    if (message?.role !== "user") {
      return {
        role: message?.role,
        content: typeof message?.content === "string" ? message.content : message?.content,
      };
    }

    const isCurrentUserMessage = messageIndex === lastUserIndex;
    const attachments = [];

    // Binary attachments are valid only on the current request. Older chat files
    // stay in history as filename references but are never uploaded repeatedly.
    if (isCurrentUserMessage) {
      const structuredAttachments = Array.isArray(message?.attachments)
        ? message.attachments
        : message?.attachment?.dataUrl
          ? [message.attachment]
          : [];

      for (const item of structuredAttachments) {
        if (!item?.dataUrl) continue;
        attachments.push({
          filename: String(item.name || "attached").slice(0, 180),
          type: String(item.type || "application/octet-stream").slice(0, 180),
          dataUrl: String(item.dataUrl),
        });
      }
    }

    let visibleText = typeof message?.content === "string" ? message.content : "";

    visibleText = visibleText.replace(
      legacyAttachmentPattern,
      (_match, encodedName, type, dataUrl) => {
        let filename = "attached";
        try { filename = decodeURIComponent(encodedName) || filename; } catch { /* Keep fallback. */ }

        if (isCurrentUserMessage) {
          attachments.push({ filename, type, dataUrl });
          return "";
        }
        return `[Previously attached file: ${filename}]`;
      }
    );

    const legacyPdfMatch = visibleText.match(legacyPdfPattern);
    if (legacyPdfMatch) {
      if (isCurrentUserMessage) {
        attachments.push({
          filename: "attached.pdf",
          type: "application/pdf",
          dataUrl: legacyPdfMatch[1],
        });
        visibleText = visibleText.replace(legacyPdfPattern, "");
      } else {
        visibleText = visibleText.replace(legacyPdfPattern, "[Previously attached PDF]");
      }
    } else {
      const incompletePdf = visibleText.indexOf("[VA_PDF_ATTACHMENT:data:application/pdf;base64,");
      if (incompletePdf >= 0) {
        visibleText =
          visibleText.slice(0, incompletePdf).trimEnd() +
          (isCurrentUserMessage ? "" : "\n[Previously attached PDF]");
      }
      const incompleteGeneric = visibleText.indexOf("[VA_ATTACHMENT:");
      if (incompleteGeneric >= 0 && visibleText.indexOf("|data:", incompleteGeneric) >= 0) {
        visibleText =
          visibleText.slice(0, incompleteGeneric).trimEnd() +
          (isCurrentUserMessage ? "" : "\n[Previously attached file]");
      }
    }

    visibleText = visibleText.replace(
      fileMarkerPattern,
      (_match, encodedName) => {
        let filename = "attachment";
        try { filename = decodeURIComponent(encodedName) || filename; } catch { /* Keep fallback. */ }
        return isCurrentUserMessage ? "" : `[Previously attached file: ${filename}]`;
      }
    ).trim();

    if (!attachments.length) {
      return { role: "user", content: visibleText };
    }

    const content = visibleText ? [{ type: "input_text", text: visibleText }] : [];
    for (const attachment of attachments) {
      if (String(attachment.type || "").startsWith("image/")) {
        content.push({ type: "input_image", image_url: attachment.dataUrl });
      } else {
        content.push({
          type: "input_file",
          filename: attachment.filename,
          file_data: attachment.dataUrl,
        });
      }
    }

    return { role: "user", content };
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

  const response = await globalThis.fetch(`${VA_CONVEX_SITE_URL}/usage/record`, {
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

async function listVAProjectFiles(env, projectId) {
  const scopedProjectId = String(projectId || "").trim().slice(0, 120);
  if (!scopedProjectId || !registeredProjectConfig(scopedProjectId)) {
    throw new Error("The selected project is not registered for Files & Media access.");
  }

  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("Private Files & Media storage is not configured.");

  const response = await fetch(
    `${VA_CONVEX_SITE_URL}/files/list?projectId=${encodeURIComponent(scopedProjectId)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Files & Media query failed with status ${response.status}`);
  }

  // Return record metadata only. In particular, never pass a private storage
  // URL, a download URL, or the storage ID to the model.
  const files = Array.isArray(payload?.files) ? payload.files : [];
  return {
    projectId: scopedProjectId,
    projectName: registeredProjectName(scopedProjectId),
    files: files.map((file) => ({
      id: typeof file?.id === "string" ? file.id : null,
      projectId: scopedProjectId,
      projectName: registeredProjectName(scopedProjectId),
      name: typeof file?.name === "string" ? file.name : "Unnamed file",
      type: typeof file?.type === "string" ? file.type : "application/octet-stream",
      size: Number.isFinite(Number(file?.size)) ? Number(file.size) : 0,
      uploadedAt: Number.isFinite(Number(file?.uploadedAt)) ? Number(file.uploadedAt) : null,
      sourceProjectId: typeof file?.sourceProjectId === "string" ? file.sourceProjectId : null,
      sourceFileId: typeof file?.sourceFileId === "string" ? file.sourceFileId : null,
      storage: "convex",
      status: "Stored",
    })),
  };
}

async function listVAAllProjectFiles(env) {
  const results = await Promise.all(
    Object.keys(PROJECT_RUNTIME_CONFIG).sort().map(async (id) => {
      try {
        return await listVAProjectFiles(env, id);
      } catch (error) {
        return {
          projectId: id,
          projectName: registeredProjectName(id),
          files: [],
          error: error instanceof Error ? error.message : "Files & Media unavailable.",
        };
      }
    })
  );
  return {
    scope: "all-owner-projects",
    projects: results.map(({ projectId, projectName, error }) => ({ projectId, projectName, error: error || null })),
    files: results.flatMap((result) => result.files || [])
      .sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0)),
  };
}

async function copyVAProjectFile(env, { sourceProjectId, destinationProjectId, fileId, name }) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("Private Files & Media storage is not configured.");

  const response = await fetch(`${VA_CONVEX_SITE_URL}/files/copy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sourceProjectId,
      destinationProjectId,
      fileId,
      name: name || undefined,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Files & Media copy failed with status ${response.status}`);
  }
  return {
    ok: true,
    sourceProjectId,
    destinationProjectId,
    file: payload?.file || null,
  };
}

async function readVAProjectFileBytes(env, projectId, fileId) {
  const scopedProjectId = String(projectId || "").trim();
  if (!registeredProjectConfig(scopedProjectId)) {
    throw new Error("The source project is not a registered owner project.");
  }
  const listed = await listVAProjectFiles(env, scopedProjectId);
  const file = (listed.files || []).find((item) => item.id === String(fileId || "").trim());
  if (!file) throw new Error("That Files & Media asset was not found in the source project.");

  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("Private Files & Media storage is not configured.");
  const response = await fetch(
    `${VA_CONVEX_SITE_URL}/files/raw?id=${encodeURIComponent(file.id)}&projectId=${encodeURIComponent(scopedProjectId)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Stored asset read failed with status ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    bytes: new Uint8Array(buffer),
  };
}

async function readVAState(env) {
  const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
  if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured.");

  const response = await globalThis.fetch(`${VA_CONVEX_SITE_URL}/state`, {
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

  const response = await globalThis.fetch(`${VA_CONVEX_SITE_URL}/state`, {
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
    va_platform_list_directory: path ? `Inspecting Viking Aries folder: ${path}` : "Inspecting Viking Aries platform files",
    va_platform_read_file: path ? `Reading Viking Aries file: ${path}` : "Reading Viking Aries platform file",
    va_platform_write_file: path ? `Writing Viking Aries file: ${path}` : "Writing Viking Aries platform file",
    va_platform_replace_text: path ? `Editing Viking Aries file: ${path}` : "Editing Viking Aries platform file",
    diagnostic_list_project_directory: path
      ? `Inspecting related project folder: ${path}`
      : "Inspecting related project",
    diagnostic_read_project_file: path
      ? `Reading related project file: ${path}`
      : "Reading related project file",
    owner_projects_list: "Reading owner project registry",
    owner_project_get_metadata: `Reading ${registeredProjectName(args.projectId)} project metadata`,
    owner_project_update_metadata: `Updating ${registeredProjectName(args.projectId)} project metadata`,
    owner_project_list_directory: path
      ? `Inspecting ${registeredProjectName(args.projectId)} folder: ${path}`
      : `Inspecting ${registeredProjectName(args.projectId)} repository`,
    owner_project_read_file: path
      ? `Reading ${registeredProjectName(args.projectId)} file: ${path}`
      : `Reading ${registeredProjectName(args.projectId)} file`,
    owner_project_write_file: path
      ? `Writing ${registeredProjectName(args.projectId)} file: ${path}`
      : `Writing ${registeredProjectName(args.projectId)} repository file`,
    owner_project_replace_text: path
      ? `Editing ${registeredProjectName(args.projectId)} file: ${path}`
      : `Editing ${registeredProjectName(args.projectId)} repository file`,
    cloudflare_get_project_status: "Checking Cloudflare deployment status",
    cloudflare_get_build_logs: "Reading Cloudflare build logs",
    cloudflare_trigger_build: "Starting Cloudflare build",
    convex_get_deployment_status: "Checking Convex deployment status",
    files_media_list_project_files: "Reading live Files & Media records",
    files_media_search_files: "Searching Files & Media across owner projects",
    files_media_get_project_file_preview: "Preparing a secure image preview",
    files_media_copy_project_file: "Copying Files & Media asset between projects",
    files_media_copy_file_to_project_repository: "Copying Files & Media asset into project repository",
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

  const response = await globalThis.fetch(
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

const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_ACTIONS_OIDC_AUDIENCE = "viking-aries-convex-deploy";
const GITHUB_ACTIONS_DEPLOY_REPOSITORY = "dakotawireless/VikingAries";
const GITHUB_ACTIONS_DEPLOY_REF = "refs/heads/main";
const GITHUB_ACTIONS_DEPLOY_WORKFLOW_REF =
  "dakotawireless/VikingAries/.github/workflows/deploy-va-convex.yml@refs/heads/main";

async function verifyGithubActionsDeployOidc(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("GitHub Actions OIDC token is required.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid GitHub Actions OIDC token.");

  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new Error("Invalid GitHub Actions OIDC token.");
  }

  if (header?.alg !== "RS256" || typeof header?.kid !== "string" || !header.kid) {
    throw new Error("Unsupported GitHub Actions OIDC signing key.");
  }

  const jwksResponse = await globalThis.fetch(
    `${GITHUB_ACTIONS_OIDC_ISSUER}/.well-known/jwks`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!jwksResponse.ok) {
    throw new Error("GitHub Actions OIDC signing keys are unavailable.");
  }

  const jwks = await jwksResponse.json();
  const jwk = Array.isArray(jwks?.keys)
    ? jwks.keys.find((candidate) => candidate?.kid === header.kid)
    : null;
  if (!jwk) throw new Error("GitHub Actions OIDC signing key was not found.");

  const verificationKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signedBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signatureBytes = base64UrlDecode(parts[2]);
  const signatureValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    verificationKey,
    signatureBytes,
    signedBytes
  );
  if (!signatureValid) throw new Error("GitHub Actions OIDC signature is invalid.");

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  const workflowRefs = [claims?.workflow_ref, claims?.job_workflow_ref].filter(Boolean);

  if (claims?.iss !== GITHUB_ACTIONS_OIDC_ISSUER) {
    throw new Error("Unexpected GitHub Actions OIDC issuer.");
  }
  if (!audience.includes(GITHUB_ACTIONS_OIDC_AUDIENCE)) {
    throw new Error("Unexpected GitHub Actions OIDC audience.");
  }
  if (!Number.isFinite(Number(claims?.exp)) || Number(claims.exp) <= now) {
    throw new Error("GitHub Actions OIDC token has expired.");
  }
  if (claims?.nbf != null && Number(claims.nbf) > now + 30) {
    throw new Error("GitHub Actions OIDC token is not active yet.");
  }
  if (claims?.repository !== GITHUB_ACTIONS_DEPLOY_REPOSITORY) {
    throw new Error("GitHub Actions OIDC repository is not authorized.");
  }
  if (claims?.ref !== GITHUB_ACTIONS_DEPLOY_REF) {
    throw new Error("GitHub Actions OIDC ref is not authorized.");
  }
  if (!workflowRefs.includes(GITHUB_ACTIONS_DEPLOY_WORKFLOW_REF)) {
    throw new Error("GitHub Actions OIDC workflow is not authorized.");
  }
  if (claims?.event_name !== "push" && claims?.event_name !== "workflow_dispatch") {
    throw new Error("GitHub Actions OIDC event is not authorized.");
  }

  return claims;
}


function recoveryStateKey(projectId, threadId) {
  const safeProject = String(projectId || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 100);
  const safeThread = String(threadId || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 120);
  return `viking-aries:recovery:${safeProject}:${safeThread}`;
}

function isContinuationRequest(rawMessages) {
  return /^(continue|finish that|keep going|resume|continue that|finish it)[.!\s]*$/i.test(
    latestUserText(rawMessages)
  );
}

function safeOperationRecord(call, result, status = "done", detail = "") {
  let args = {};
  try { args = JSON.parse(call?.arguments || "{}"); } catch { args = {}; }
  const record = {
    tool: String(call?.name || "unknown").slice(0, 120),
    label: describeRuntimeTool(call),
    status,
    at: Date.now(),
  };
  if (args.path) record.path = String(args.path).slice(0, 300);
  if (args.projectId) record.projectId = String(args.projectId).slice(0, 120);
  if (detail) record.detail = String(detail).slice(0, 500);
  if (result && typeof result === "object") {
    record.result = {
      type: result.type || undefined,
      path: result.path || undefined,
      ref: result.ref || undefined,
      size: Number.isFinite(result.size) ? result.size : undefined,
      commitSha: result.commitSha || undefined,
      branch: result.branch || undefined,
      worker: result.worker || undefined,
      buildUuid: result.buildUuid || undefined,
      deployment: result.name || result.deployment?.name || undefined,
      entryNames: Array.isArray(result.entries)
        ? result.entries.slice(0, 80).map((entry) => entry?.path || entry?.name).filter(Boolean)
        : undefined,
      fileNames: Array.isArray(result.files)
        ? result.files.slice(0, 80).map((file) => file?.name).filter(Boolean)
        : undefined,
    };
  }
  return record;
}

function classifyRunStop(error, budgetPaused = false) {
  const message = String(error?.message || error || "").toLowerCase();
  const explicit = String(error?.runStopStatus || "").toLowerCase();
  if (explicit.includes("cancel")) return { code: "canceled", label: "User cancellation" };
  if (explicit.includes("timeout") || explicit.includes("timed_out")) return { code: "timed_out", label: "Execution timeout" };
  if (budgetPaused || error instanceof RequestBudgetExceeded || /request budget|batch limit|tool budget/.test(message)) {
    return { code: "paused", label: "Execution/tool budget reached" };
  }
  if (/recovery window|deadline|timeout|timed out|aborterror|timeouterror/.test(`${error?.name || ""} ${message}`.toLowerCase())) {
    return { code: "timed_out", label: "Execution timeout" };
  }
  if (/network|fetch failed|connection|econn|dns|socket/.test(message)) return { code: "failed", label: "Network error" };
  if (Number(error?.status) >= 400 || /ai service|provider|openai/.test(message)) return { code: "failed", label: "Provider/API error" };
  if (/tool|github|cloudflare|convex|files & media/.test(message)) return { code: "failed", label: "Tool failure" };
  if (/control unavailable|runtime|backend|heartbeat/.test(message)) return { code: "failed", label: "Backend/runtime failure" };
  return { code: "failed", label: "Other known failure" };
}

function recoveryFallbackText(state, stop) {
  const completed = Array.isArray(state?.completedOperations) ? state.completedOperations : [];
  const writes = Array.isArray(state?.writes) ? state.writes : [];
  const completedText = completed.length
    ? completed.slice(-12).map((item) => `- ${item.label}${item.path ? ` (${item.path})` : ""}`).join("\n")
    : "- The request was accepted, but no tool operation completed before the interruption.";
  const remains = state?.finalOperation
    ? `Continue from ${state.finalOperation}; use the saved findings and do not repeat completed operations.`
    : "Continue from the saved run checkpoint and perform only the remaining bounded investigation.";
  const safety = writes.length
    ? `${writes.length} write action${writes.length === 1 ? " was" : "s were"} completed before the stop:\n${writes.map((item) => `- ${item.path || item.tool}${item.commitSha ? ` — ${item.commitSha}` : ""}`).join("\n")}\nNo completed write should be replayed automatically.`
    : "No files or settings were changed. No deployment was started by this run.";
  return [
    `## Stop reason\n${stop.label}.`,
    `## What was completed\n${completedText}`,
    `## Where it stopped\n${state?.finalOperation || "The active model/provider step ended before normal completion."}`,
    `## What remains\n${remains}`,
    `## Change safety\n${safety}`,
    `## Next best action\nSend continue to resume from this checkpoint. Viking Aries will use the saved progress and will not automatically replay writes or destructive actions.`,
  ].join("\n\n");
}

async function persistRecoveryCheckpoint(env, projectId, threadId, state) {
  if (!projectId || !threadId || !state) return;
  const compact = {
    ...state,
    completedOperations: (state.completedOperations || []).slice(-40),
    writes: (state.writes || []).slice(-20),
    updatedAt: Date.now(),
  };
  try {
    await writeVAState(env, {
      key: recoveryStateKey(projectId, threadId),
      value: JSON.stringify(compact),
      updatedAt: Date.now(),
    });
  } catch {
    // A checkpoint outage must not hide the actual run result.
  }
}

async function readRecoveryCheckpoint(env, projectId, threadId) {
  try {
    const state = await readVAState(env);
    const key = recoveryStateKey(projectId, threadId);
    const entry = (Array.isArray(state?.entries) ? state.entries : []).find(
      (item) => item?.key === key && !item?.deleted
    );
    if (!entry?.value) return null;
    const parsed = JSON.parse(entry.value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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

    if (
      url.pathname === "/api/ci/convex-deploy-key" ||
      url.pathname === "/api/ci/convex-deploy-key/revoke"
    ) {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      try {
        await verifyGithubActionsDeployOidc(request);

        const convexToken = await resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN);
        if (!convexToken) {
          return json(
            { error: "The shared Convex personal connection is not configured." },
            { status: 503 }
          );
        }

        const project = PROJECT_RUNTIME_CONFIG["viking-aries"];
        const deploymentName = project?.backendDeployment;
        if (!deploymentName || deploymentName !== "flippant-mandrill-487") {
          return json(
            { error: "Viking Aries production Convex mapping failed its safety check." },
            { status: 409 }
          );
        }

        if (url.pathname.endsWith("/revoke")) {
          const body = await request.json().catch(() => ({}));
          const deployKey =
            typeof body?.deployKey === "string" ? body.deployKey.trim() : "";
          if (!deployKey) {
            return json({ error: "deployKey is required." }, { status: 400 });
          }

          const revoked = await convexDeleteTemporaryDeployKey(
            convexToken,
            deploymentName,
            deployKey
          );
          if (!revoked) {
            return json(
              { error: "The temporary Convex deploy key could not be revoked." },
              { status: 502 }
            );
          }
          return json({ ok: true, deployment: deploymentName });
        }

        const temporary = await convexCreateTemporaryDeployKey(
          convexToken,
          deploymentName
        );
        return json({
          ok: true,
          deployment: deploymentName,
          keyName: temporary.name,
          deployKey: temporary.deployKey,
        });
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "CI authorization failed." },
          { status: 401 }
        );
      }
    }

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
      url.pathname === "/api/files/preview" ||
      url.pathname === "/api/files/delete" ||
      url.pathname === "/api/files/list" ||
      url.pathname === "/api/files/copy" ||
      url.pathname === "/api/files/legacy-download" ||
      url.pathname === "/api/files/legacy-preview"
    ) {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
      if (!secret) {
        return json({ error: "Private VA storage is not configured." }, { status: 503 });
      }

      if (url.pathname === "/api/files/list" && (url.searchParams.get("projectId") || "").trim() === "all") {
        try {
          const results = await Promise.all(
            Object.keys(PROJECT_RUNTIME_CONFIG).sort().map(async (id) => {
              const response = await fetch(
                `${VA_CONVEX_SITE_URL}/files/list?projectId=${encodeURIComponent(id)}`,
                { headers: { Authorization: `Bearer ${secret}` } }
              );
              const payload = await response.json().catch(() => ({}));
              return {
                projectId: id,
                projectName: registeredProjectName(id),
                files: response.ok && Array.isArray(payload.files)
                  ? payload.files.map((file) => ({
                      ...file,
                      projectId: id,
                      projectName: registeredProjectName(id),
                    }))
                  : [],
                error: response.ok ? null : (payload.error || `Files query failed with status ${response.status}`),
              };
            })
          );
          return json({
            ok: true,
            scope: "all-owner-projects",
            projects: results.map(({ projectId, projectName, error }) => ({ projectId, projectName, error })),
            files: results.flatMap((result) => result.files)
              .sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0)),
          }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Could not list owner project files." },
            { status: 502 }
          );
        }
      }

      if (url.pathname === "/api/files/copy" && request.method === "POST") {
        const bodyText = await request.text();
        let body = {};
        try { body = JSON.parse(bodyText || "{}"); } catch { body = {}; }
        const sourceProjectId = String(body?.sourceProjectId || "").trim();
        const destinationProjectId = String(body?.destinationProjectId || "").trim();
        if (!registeredProjectConfig(sourceProjectId) || !registeredProjectConfig(destinationProjectId)) {
          return json({ error: "Both source and destination must be registered owner projects." }, { status: 400 });
        }
        try {
          const response = await fetch(`${VA_CONVEX_SITE_URL}/files/copy`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json",
            },
            body: bodyText,
          });
          const responseHeaders = new Headers(response.headers);
          responseHeaders.set("Cache-Control", "private, no-store");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
          });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Cross-project file copy failed." },
            { status: 502 }
          );
        }
      }

      const legacyFileRoute =
        url.pathname === "/api/files/legacy-download" ||
        url.pathname === "/api/files/legacy-preview";
      if (legacyFileRoute) {
        const projectId = (url.searchParams.get("projectId") || "").trim();
        const storagePath = (url.searchParams.get("path") || "").trim();
        const fileName = safeUploadedFileName(url.searchParams.get("name") || storagePath.split("/").pop() || "file");
        const type = inferMimeType(fileName);
        const preview = url.pathname === "/api/files/legacy-preview";
        if (preview && !type.startsWith("image/")) {
          return json({ error: "Only image files can be previewed." }, { status: 415 });
        }
        const githubToken = await resolveSecret(env.GITHUB_TOKEN);
        if (!githubToken) {
          return json({ error: "Legacy file access is not configured." }, { status: 503 });
        }
        try {
          const response = await githubDownloadProjectFile(githubToken, { projectId, path: storagePath });
          const headers = new Headers(response.headers);
          headers.set("Content-Type", type);
          headers.set("Content-Disposition", `${preview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
          headers.set("Cache-Control", "private, no-store");
          headers.set("X-Content-Type-Options", "nosniff");
          return new Response(response.body, { status: response.status, headers });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Legacy file is unavailable." }, { status: 404 });
        }
      }

      const route = url.pathname.replace(/^\/api/, "");
      const target = new URL(`${VA_CONVEX_SITE_URL}${route}`);
      for (const [key, value] of url.searchParams) target.searchParams.append(key, value);

      try {
        const headers = new Headers({ Authorization: `Bearer ${secret}` });
        const init = { method: request.method, headers };
        if (request.method === "POST") {
          const contentType = request.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            headers.set("Content-Type", "application/json");
            init.body = await request.text();
          } else {
            init.body = await request.formData();
          }
        }
        const response = await fetch(target.toString(), init);
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Cache-Control", "private, no-store");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Private file storage request failed." },
          { status: 502 }
        );
      }
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

    if (url.pathname === "/api/projects/smoke-pos/staging/deploy") {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const projectConfig = registeredProjectConfig("smoke-pos");
      if (
        projectConfig?.repository !== "dakotawireless/Smoke-Signals-POS---New" ||
        projectConfig?.defaultBranch !== "migration/remove-hercules" ||
        projectConfig?.cloudflareWorker !== "smoke-signals-pos---new" ||
        projectConfig?.backendDeployment !== "benevolent-bulldog-176"
      ) {
        return json(
          { error: "Smoke Signals staging mapping failed the deployment safety check." },
          { status: 409 }
        );
      }

      const cloudflareToken = await resolveSecret(env.CLOUDFLARE_API_TOKEN);
      if (!cloudflareToken) {
        return json(
          { error: "The shared Cloudflare connection is not configured." },
          { status: 503 }
        );
      }

      try {
        await cloudflareWorkerRecord(cloudflareToken, projectConfig.cloudflareWorker);

        const triggers = await cloudflareListBuildTriggers(
          cloudflareToken,
          projectConfig.cloudflareWorker
        );
        const stagingTrigger =
          triggers.find(
            (item) =>
              Array.isArray(item.branchIncludes) &&
              item.branchIncludes.includes(projectConfig.defaultBranch)
          ) || triggers[0];

        if (!stagingTrigger?.uuid) {
          throw new Error("No Cloudflare build trigger is configured for the Smoke Signals staging Worker.");
        }

        const triggerConfig = await cloudflareSetDeployCommand(
          cloudflareToken,
          stagingTrigger.uuid,
          "npx wrangler deploy"
        );

        const result = await cloudflareTriggerBuild(
          cloudflareToken,
          projectConfig.cloudflareWorker,
          projectConfig.defaultBranch,
          null
        );
        return json({
          ok: true,
          ...result,
          deployCommand: triggerConfig.deployCommand,
          backendDeployment: projectConfig.backendDeployment,
          productionUntouched: true,
        });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Could not trigger the Smoke Signals staging build.",
          },
          { status: 502 }
        );
      }
    }

    if (url.pathname === "/api/projects/smoke-pos/staging/build") {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      if (request.method !== "GET") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const projectConfig = registeredProjectConfig("smoke-pos");
      if (
        projectConfig?.cloudflareWorker !== "smoke-signals-pos---new" ||
        projectConfig?.defaultBranch !== "migration/remove-hercules"
      ) {
        return json(
          { error: "Smoke Signals staging mapping failed the build-status safety check." },
          { status: 409 }
        );
      }

      const cloudflareToken = await resolveSecret(env.CLOUDFLARE_API_TOKEN);
      if (!cloudflareToken) {
        return json(
          { error: "The shared Cloudflare connection is not configured." },
          { status: 503 }
        );
      }

      try {
        const requestedBuildUuid = (url.searchParams.get("buildUuid") || "").trim();
        const builds = await cloudflareListBuilds(
          cloudflareToken,
          projectConfig.cloudflareWorker
        );
        const build = requestedBuildUuid
          ? builds.find((item) => item.buildUuid === requestedBuildUuid)
          : builds[0];

        if (!build) {
          return json({
            ok: true,
            found: false,
            worker: projectConfig.cloudflareWorker,
          });
        }

        const outcome = String(build.outcome || "").toLowerCase();
        const failed =
          outcome.includes("fail") ||
          outcome.includes("error") ||
          outcome.includes("cancel");
        let logs = null;
        if (failed && build.buildUuid) {
          try {
            const result = await cloudflareGetBuildLogs(
              cloudflareToken,
              build.buildUuid
            );
            logs = {
              truncated: result.truncated,
              lines: result.lines.slice(-80),
            };
          } catch {
            logs = null;
          }
        }

        let stagingUrl = null;
        try {
          const subdomain = await cloudflareWorkersSubdomain(cloudflareToken);
          stagingUrl = subdomain
            ? `https://${projectConfig.cloudflareWorker}.${subdomain}.workers.dev`
            : null;
        } catch {
          stagingUrl = null;
        }

        let stagingHealth = null;
        if (stagingUrl) {
          try {
            const response = await fetch(stagingUrl, { redirect: "follow" });
            const contentType = response.headers.get("content-type") || "";
            let sample = "";
            if (contentType.includes("text/html")) {
              sample = (await response.text()).slice(0, 300);
            }
            stagingHealth = {
              reachable: response.ok,
              status: response.status,
              statusText: response.statusText || "",
              contentType,
              finalUrl: response.url || stagingUrl,
              htmlDocument: /<html|<!doctype html/i.test(sample),
            };
          } catch (error) {
            stagingHealth = {
              reachable: false,
              error: error instanceof Error ? error.message : "Staging URL request failed.",
            };
          }
        }

        return json({
          ok: true,
          found: true,
          worker: projectConfig.cloudflareWorker,
          build,
          logs,
          stagingUrl,
          stagingHealth,
          productionUntouched: true,
        });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Could not read the Smoke Signals staging build status.",
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

    if (url.pathname === "/api/secrets") {
      const auth = await ownerAuthConfig(env);
      if (!auth.configured || !(await verifyOwnerSession(request, auth.sessionSecret))) {
        return json({ error: "Owner login required." }, { status: 401 });
      }

      const queryProjectId = (url.searchParams.get("projectId") || "").trim();
      let body = null;
      if (request.method === "POST") {
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid secret configuration request." }, { status: 400 });
        }
      }

      const resolvedProjectId =
        request.method === "POST"
          ? String(body?.projectId || "").trim()
          : queryProjectId;
      const projectConfig = registeredProjectConfig(resolvedProjectId);
      if (!projectConfig) {
        return json({ error: "This project is not registered in Viking Aries." }, { status: 400 });
      }

      const environments = projectSecretEnvironments(projectConfig);

      if (request.method === "GET") {
        try {
          if (projectConfig.backend === "Convex" && projectConfig.backendDeployment) {
            const convexToken = await resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN);
            if (!convexToken) {
              return json(
                { error: "Convex is not connected for secure environment management." },
                { status: 503 }
              );
            }
            const names = await convexListEnvironmentVariableNames(convexToken, projectConfig);
            return json({
              ok: true,
              projectId: resolvedProjectId,
              destination: `Convex · ${projectConfig.backendDeployment}`,
              provider: "Convex",
              environments,
              names,
            });
          }

          if (projectConfig.cloudflareWorker) {
            const cloudflareToken = await resolveSecret(env.CLOUDFLARE_API_TOKEN);
            if (!cloudflareToken) {
              return json(
                { error: "Cloudflare is not connected for secure secret management." },
                { status: 503 }
              );
            }
            await cloudflareWorkerRecord(cloudflareToken, projectConfig.cloudflareWorker);
            return json({
              ok: true,
              projectId: resolvedProjectId,
              destination: `Cloudflare Worker · ${projectConfig.cloudflareWorker}`,
              provider: "Cloudflare",
              environments,
              names: [],
            });
          }

          return json(
            { error: "This project does not have a supported secure runtime destination." },
            { status: 400 }
          );
        } catch (error) {
          return json({ error: error.message || "Could not inspect secure configuration." }, { status: 502 });
        }
      }

      if (request.method === "POST") {
        const name = String(body?.name || "").trim().toUpperCase();
        const value = typeof body?.value === "string" ? body.value : "";
        const requestedEnvironments = Array.isArray(body?.environments)
          ? [...new Set(body.environments.map((item) => String(item || "").toLowerCase()))]
          : [];
        const mappedEnvironmentIds = environments
          .filter((item) => item.available)
          .map((item) => item.id);
        const targetEnvironments = requestedEnvironments.filter((id) =>
          mappedEnvironmentIds.includes(id)
        );

        if (!/^[A-Z][A-Z0-9_]{0,255}$/.test(name)) {
          return json({ error: "Secret names must use letters, numbers, and underscores." }, { status: 400 });
        }
        if (!value || new TextEncoder().encode(value).length > 8192) {
          return json({ error: "Enter a value no larger than 8 KiB." }, { status: 400 });
        }
        if (!targetEnvironments.length) {
          return json(
            { error: "Choose at least one environment that is mapped for this project." },
            { status: 400 }
          );
        }
        if (targetEnvironments.length !== requestedEnvironments.length) {
          return json(
            { error: "One or more selected environments are not mapped for this project." },
            { status: 400 }
          );
        }

        try {
          // The current registry maps one secure runtime per environment. This
          // loop already supports multiple targets once more mappings are added.
          const savedDestinations = [];

          for (const environmentId of targetEnvironments) {
            const environmentConfig =
              projectSecretEnvironmentConfig(projectConfig, environmentId);
            if (!environmentConfig) {
              throw new Error(`The ${environmentId} environment is not mapped for this project.`);
            }

            if (environmentConfig.backend === "Convex" && environmentConfig.backendDeployment) {
              const convexToken = await resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN);
              if (!convexToken) {
                return json(
                  { error: "Convex is not connected for secure environment management." },
                  { status: 503 }
                );
              }
              await convexSetEnvironmentVariable(convexToken, environmentConfig, name, value);
              savedDestinations.push({
                environment: environmentId,
                destination: `Convex · ${environmentConfig.backendDeployment}`,
                provider: "Convex",
              });
              continue;
            }

            if (environmentConfig.cloudflareWorker) {
              const cloudflareToken = await resolveSecret(env.CLOUDFLARE_API_TOKEN);
              if (!cloudflareToken) {
                return json(
                  { error: "Cloudflare is not connected for secure secret management." },
                  { status: 503 }
                );
              }
              await cloudflareStoreWorkerSecret(
                cloudflareToken,
                environmentConfig.cloudflareWorker,
                name,
                value
              );
              savedDestinations.push({
                environment: environmentId,
                destination: `Cloudflare Worker · ${environmentConfig.cloudflareWorker}`,
                provider: "Cloudflare",
              });
              continue;
            }

            throw new Error("The selected environment does not have a supported secure runtime.");
          }

          return json({
            ok: true,
            name,
            configured: true,
            environments: targetEnvironments,
            destinations: savedDestinations,
            destination:
              savedDestinations.length === 1
                ? savedDestinations[0].destination
                : `${savedDestinations.length} mapped environments`,
            provider:
              savedDestinations.length === 1
                ? savedDestinations[0].provider
                : "Multiple",
          });
        } catch (error) {
          return json({ error: error.message || "Could not save the secure value." }, { status: 502 });
        }
      }

      return json({ error: "Method not allowed." }, { status: 405 });
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

    if (url.pathname === "/api/progress") {
      const auth = await ownerAuthConfig(env);
      const ownerAuthenticated = auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : true;

      if (auth.configured && !ownerAuthenticated) {
        return json({ error: "Owner login required." }, { status: 401 });
      }
      if (request.method !== "GET") {
        return json({ error: "Method not allowed." }, { status: 405 });
      }

      const jobId = (url.searchParams.get("jobId") || "").trim().slice(0, 120);
      if (!jobId) {
        return json({ error: "jobId is required." }, { status: 400 });
      }

      try {
        const state = await readVAState(env);
        const key = `viking-aries:progress:${jobId}`;
        const entry = (Array.isArray(state?.entries) ? state.entries : []).find(
          (item) => item?.key === key && !item?.deleted
        );
        if (!entry || typeof entry.value !== "string") {
          return json({ progress: [] });
        }
        const parsed = JSON.parse(entry.value || "[]");
        return json({ progress: Array.isArray(parsed) ? parsed.slice(-60) : [] });
      } catch (error) {
        return json({ error: error.message || "Could not load job progress." }, { status: 502 });
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
            (typeof message?.content === "string" || message?.attachment?.dataUrl)
        )
        .slice(-14);

      // Convert attachments before text compaction so PDF/image data is never
      // mistaken for conversation text and never consumes the rolling text budget.
      const expanded = expandAttachmentMarkers(candidates);
      const MAX_TOTAL_CHARS = 70000;
      const MAX_MESSAGE_CHARS = 7000;
      let remaining = MAX_TOTAL_CHARS;
      const compact = [];

      for (let index = expanded.length - 1; index >= 0; index -= 1) {
        const message = expanded[index];

        if (Array.isArray(message.content)) {
          compact.unshift({ role: message.role, content: message.content });
          continue;
        }

        if (remaining <= 0) continue;
        const raw = String(message.content || "").trim();
        if (!raw) continue;

        const limit = Math.min(MAX_MESSAGE_CHARS, remaining);
        const content =
          index === expanded.length - 1
            ? raw.slice(0, limit)
            : raw.length > limit
              ? raw.slice(-limit)
              : raw;

        remaining -= content.length;
        compact.unshift({ role: message.role, content });
      }

      return compact;
    })();

    if (!messages.length) {
      return json({ error: "At least one chat message is required." }, { status: 400 });
    }

    const allowedModels = new Set([
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "gpt-6-astra",
    ]);
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
    const continuationRequested = isContinuationRequest(body?.messages);
    const priorRecoveryCheckpoint = continuationRequested
      ? await readRecoveryCheckpoint(env, projectId, threadId)
      : null;

    // Generate one authoritative clock snapshot at the start of every run.
    // It is server-derived and project-independent, so stale project/chat
    // context cannot become the model's notion of "today".
    const runtimeClock = runtimeClockSnapshot();
    const runtimeClockText = runtimeClockInstruction(runtimeClock);

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
      priorRecoveryCheckpoint
        ? `Saved interrupted-run checkpoint for this continuation request:\n${JSON.stringify(priorRecoveryCheckpoint)}\nResume from these findings. Do not reread completed files unless verification requires it, and never replay a recorded write or destructive action automatically.`
        : "",
    ].filter(Boolean).join("\n");

    const instructions = [
      "You are Viking Aries, an AI software-building assistant inside Erik's private app-builder workspace.",
      model === "gpt-6-astra"
        ? "You are running on GPT-6 Astra because this request was manually selected for Astra or Auto classified it as exceptionally complex. Use the extra capability to carry the end-to-end task through carefully; do not inflate scope or add unnecessary work merely because a stronger model is active."
        : "",
      `The currently selected project is: ${projectName}.`,
      `The current chat thread is: ${threadTitle}.`,
      projectFacts,
      runtimeClockText,
      "Use supplied project facts as durable project context. Do not invent missing repository, deployment, backend, credential, or file details.",
      "Be practical, concise, implementation-oriented, and conversational.",
      "Talk to Erik like a knowledgeable technical partner working alongside him, not like a support bot, ticketing system, or automated build log.",
      "Use natural conversational English. Warm, familiar, direct language is good. Phrases such as 'Yep', 'Exactly', 'I found the problem', 'That makes sense', 'There is one catch', and 'Done' are fine when they fit naturally.",
      "Do not sound ceremonious or robotic. Avoid canned openings and labels such as 'Confirmed', 'Important distinction', 'Current status', 'Proceeding with', 'Based on the information provided', or 'Please provide' unless that wording is genuinely necessary.",
      "Do not force every answer into a fixed template. Lead with the actual answer or result, then explain the few details Erik needs. Use headings only when they make a longer answer easier to scan.",
      "Treat the conversation as a continuing working session, not a sequence of unrelated support tickets. Resolve references like 'the POS', 'the website', 'the migration', 'that button', or 'the customer portal' from the current selected project, durable project context, recent chat, and verified action history before asking Erik to repeat himself.",
      "Carry forward established decisions and constraints. Do not repeatedly suggest an option Erik has already rejected, and do not re-ask a question whose answer is already in project context or the current conversation.",
      "When Erik's request is clear and the requested work is low-risk within the selected project's approved staging or working branch, use the available tools and do the work instead of asking for unnecessary confirmation.",
      "Never merge to production, publish a live production change, alter live customer data, send live customer or vendor communications, expose secrets, or take another irreversible/high-impact action without explicit approval.",
      "When you make a code change, explain the business result first. Then give the commit/build detail briefly. Example: 'Done. I changed X so Y now happens. Z is unchanged. Commit: ...' Do not narrate each file read, tool call, or internal implementation step.",
      "If something is already working, say so plainly. If something is wrong, say what is wrong and what needs to change. Do not hide uncertainty, but do not pad straightforward answers with generic caveats.",
      "Correct Erik plainly when an assumption is wrong. Do not agree merely to sound agreeable, and do not flatter him.",
      "Distinguish generalized knowledge questions from project-specific questions before using tools. A question like 'What is the benefit of Astra over Sol?' is about the models themselves, not about how Viking Aries is configured. Answer the generalized question directly; do not inspect the selected project's repository merely because a project is open.",
      "For current facts about OpenAI models, API availability, model capabilities, pricing, limits, or provider behavior, use current provider documentation/search when that capability is available. Prefer OpenAI's own documentation over assumptions from Viking Aries source code.",
      "Never treat 'not configured in Viking Aries' as evidence that a model or provider feature does not exist. App configuration and provider reality are separate questions.",
      "If Erik challenges a factual statement, do not automatically say 'you're right'. Verify the disputed fact when verification is available, then either correct yourself or explain why the original statement still stands.",
      "If a previous answer missed Erik's actual question, answer the original question immediately. Do not spend the response discussing your own mistake, tool limitations, or local app configuration unless that information is directly relevant.",
      "Do not invent a generalized capability hierarchy from model names. When comparing current models, ground the comparison in current provider documentation and clearly distinguish documented capabilities from your own practical interpretation.",
      "A little personality or light humor is fine when appropriate, but technical accuracy and project safety come first.",
      "Do not dump every technically relevant observation into the answer. Suppress side findings, package inventory, unrelated migration status, warnings, dependency notes, architecture commentary, and historical context unless they directly affect the current request or explain the failure.",
      "For build or deployment logs, identify the first real failure or blocker and explain it plainly. Treat warnings as warnings, not failures. Do not recap successful steps unless they help locate where the failure occurred.",
      "If you notice an unrelated issue while answering, mention it only as one short secondary note when it is genuinely important; otherwise leave it out.",
      "Do not ask Erik for more logs or information when the supplied material is already sufficient to answer or take the next available action.",
      "Prefer a short useful answer over a comprehensive report unless Erik explicitly asks for a full audit, detailed explanation, or technical breakdown.",
      "When setup or configuration requires Erik to do something in an external dashboard, provider portal, browser UI, hardware device, or account, guide him interactively instead of dumping a checklist. Do everything Viking Aries can do itself first, then give Erik the single next concrete action he must take.",
      "For guided setup, tell Erik exactly where to go, what to click, what field or value to look for, and what successful completion should look like. Use plain language and avoid vague instructions such as 'configure the funding source' or 'set up the webhook'.",
      "After giving the next user action, stop and wait for Erik to confirm the result before moving to the following step. A one-sentence preview such as 'After that, we'll connect the contractor funding sources' is fine, but do not list all later steps unless Erik asks for the full plan.",
      "If Erik asks 'what do you need?', 'what do I do next?', or similar during a setup flow, answer with the immediate missing input or action, not every future prerequisite.",
      "Clearly distinguish information that is safe to paste into chat, such as a non-secret provider ID, from secrets or bank credentials that must go through the Secrets tab or provider UI. Never ask Erik to paste secret keys, routing numbers, account numbers, passwords, or private tokens into chat.",
      "Do not make Erik perform work Viking Aries can already do with its connected tools. Only hand off the parts that genuinely require his account access, physical action, approval, or information that is not available to the runtime.",
      "When multiple owner actions are on the same screen and are simple, reversible, and naturally completed together, you may group them into one step; otherwise keep the flow one step at a time.",
      "Owner Personal-workspace projects are transparent to one another for read/search operations. The selected project remains the default write target. Read other registered owner projects whenever useful for reuse, comparison, or integration. Do not write to another project unless the owner's latest instruction explicitly names/authorizes that destination.",
      "Viking Aries platform surfaces such as the Secrets tab, Theme, project selector, AI Builder chat UI, preview pane, model recommendation UI, and platform settings belong to dakotawireless/VikingAries, not to the selected app repository. When the owner explicitly asks to change one of those platform surfaces and va_platform_* tools are available, use those tools even if another project is selected. Do not use va_platform_* tools for changes to the selected app itself.",
      "When a project needs a credential or API secret, never ask the owner to paste the value into AI chat. Direct them to the project Secrets tab, where the value can be sent directly to the secure runtime without entering model context.",
      "Project records should either be stored in Viking Aries or point to a durable retrievable source such as a repository file, commit, deployment, provider record, or Drive item.",
      "Never expose secret values to the AI layer unless the owner explicitly requests that exact value for an immediate task. Secret values belong in the secure vault; normal project context should include only names, providers, purposes, and configuration status.",
      "Treat uploaded attachments as opaque attachments. Do not reproduce raw PDF text, OCR output, base64, binary data, or full document contents in the chat. Keep the attachment represented by its filename and type, and inspect or summarize its contents only when the owner explicitly asks you to do so.",
      "For Files & Media questions, use the Files & Media tools first. In the owner's Personal workspace these tools can list/search registered owner projects globally, preview assets securely, and explicitly copy assets between projects or into an authorized project repository. These live Convex records are separate from GitHub; do not inspect repositories merely to identify, date, or size Files & Media records.",
      "Do not claim that you changed code, deployed an app, accessed a repository, or called an external service unless the Viking Aries runtime actually supplied a tool result or verified prior action receipt proving that action occurred.",
      "Verified prior action receipts are authoritative evidence of earlier runtime actions. When the owner asks whether an earlier write, commit, or deployment action occurred, consult those receipts before answering. Never deny an action that a verified receipt proves occurred.",
      "If the owner asks whether an earlier action occurred and no verified receipt is available, do not infer that it did not happen. Use the available provider inspection tools (for example GitHub history) to verify the current external record before answering when practical.",
      "Use any tool-backed actions supplied by the Viking Aries runtime when they are available. If a required provider action is not actually available, say exactly which connection or capability is missing instead of claiming the action occurred.",
      "When the owner explicitly asks you to make, fix, implement, update, commit, deploy, or otherwise carry out a project change, do the work with the available tools rather than stopping at diagnosis or giving instructions. Inspect the necessary files, make the requested change, commit it, and report the actual tool result. Only stop without executing when a required capability is genuinely unavailable, the request is ambiguous in a way that blocks safe execution, or the requested action would violate a safety constraint.",
      "Root-cause rule for repairs: do not edit the first plausible file merely because it is near the visible symptom. Identify the system layers involved, inspect evidence at the likely failure boundaries, and determine which layer actually fails before changing code.",
      "If Erik says a prior repair did not work, is still broken, happens again, or has already been attempted multiple times, STOP repeating variations of the previous fix. Re-diagnose from first principles before making another write and change diagnostic approach.",
      "For previews, embedded apps, integrations, API handoffs, authentication redirects, shared backends, and other cross-system symptoms, inspect both the host/orchestrator and the target/dependency when read-only diagnostic tools are available. A symptom visible inside Viking Aries does not prove Viking Aries owns the fault.",
      "After a failed repair attempt, use read/status/log/build evidence before the next edit whenever those tools are available. Prefer proving one cause over making several speculative edits.",
      "Verification rule: after a repair, verify the strongest available evidence before declaring it fixed: source consistency, build/typecheck, deployment status/logs, runtime status, or the specific failing path. A successful commit alone proves only that code changed, not that the original bug is resolved.",
      "If runtime verification requires Erik to perform the final browser or hardware action, say exactly what has already been verified and give him one precise test to run. Do not claim the bug is fixed until either runtime evidence confirms it or clearly label the result as a code-level fix awaiting that final test.",
      "When a requested change is successfully committed to the selected GitHub repository, report it simply as 'Changes committed to GitHub' with the commit SHA. Treat Cloudflare as the repository's automatic deployment destination; do not add a warning that deployment is unverified or say the change is not deployed unless the owner specifically asks for deployment status or a tool result shows an actual deployment failure.",
      "Preserve existing product behavior unless the owner explicitly requests a change. In particular, keep the dollar API counter in the sidebar footer beside Log Out, keep API Usage as the detail-page navigation item, and keep both surfaces backed by the recorded usage totals. Do not remove, relocate, rename, or replace them during unrelated edits.",
      "GitHub editing supports both full-file replacement and targeted exact-text replacement. Prefer github_replace_text for focused edits to existing large files: first read the latest file, choose a unique oldText block, replace only that block, and commit. Use github_write_file when creating a file or when a full-file rewrite is genuinely appropriate. File size alone is never a reason to refuse a requested change. If a targeted replacement does not match exactly as expected, re-read the file and retry with a more specific block.",
      "Work in focused batches. The runtime bounds tool calls and subrequests per message; when paused, summarize completed and remaining work accurately so the user can continue. Never repeat a verified write merely because a batch paused.",
      "Recognize when an investigation is becoming too broad. Before the execution window is exhausted, narrow to likely files and exact terms, stop rereading irrelevant files, preserve supported findings, and return the specific next bounded step instead of running into the deadline.",
      "For multi-file implementation work, batch independent read or inspection tool calls in the same model turn whenever safe instead of serializing every small step. Complete the requested implementation before returning a final answer.",
    ].filter(Boolean).join("\n");

    const [githubToken, cloudflareToken, convexToken] = await Promise.all([
      resolveSecret(env.GITHUB_TOKEN),
      resolveSecret(env.CLOUDFLARE_API_TOKEN),
      resolveSecret(env.CONVEX_PERSONAL_ACCESS_TOKEN),
    ]);
    const modelKnowledgeQuestion = openAIModelKnowledgeQuestion(body?.messages);
    const repeatedRepairDiagnosis = repeatedRepairDiagnosisRequested(body?.messages);
    const platformToolsRequested =
      !modelKnowledgeQuestion &&
      vikingAriesPlatformChangeRequested(projectId, body?.messages);

    const tools = modelKnowledgeQuestion
      ? [{ type: "web_search" }]
      : [
          ...(projectFilesToolEnabled(ownerAuthenticated, env, projectId)
            ? buildProjectFilesTools()
            : []),
          ...(githubToolsEnabled(ownerAuthenticated, githubToken, projectMetadata.repository)
            ? buildGithubTools()
            : []),
          ...(ownerAuthenticated && registeredProjectConfig(projectId)
            ? buildOwnerProjectTools()
            : []),
          ...(platformToolsRequested && ownerAuthenticated && githubToken
            ? buildVikingAriesPlatformTools()
            : []),
          ...(repeatedRepairDiagnosis && ownerAuthenticated && githubToken && registeredProjectConfig(projectId)
            ? buildCrossProjectDiagnosticTools()
            : []),
          ...(cloudflareToolsEnabled(ownerAuthenticated, cloudflareToken, projectMetadata.cloudflareWorker)
            ? buildCloudflareTools()
            : []),
          ...(convexToolsEnabled(ownerAuthenticated, convexToken, projectMetadata.backendDeployment)
            ? buildConvexTools()
            : []),
        ];

    const runtimeCapabilityNotes = [];
    if (modelKnowledgeQuestion) {
      runtimeCapabilityNotes.push(
        "This is a generalized/current OpenAI model question. Use web search to verify current OpenAI documentation, answer the model question directly, and do not discuss or inspect Viking Aries configuration unless the owner asks about configuration."
      );
    }
    if (!modelKnowledgeQuestion && projectFilesToolEnabled(ownerAuthenticated, env, projectId)) {
      runtimeCapabilityNotes.push("Files & Media is owner-wide across registered Personal projects. You may list/search/read metadata and preview images from any registered owner project. You may securely copy an asset between owner projects or into a project repository when the destination is the selected project or the latest user instruction explicitly authorizes that destination. Never expose private storage URLs, storage IDs, secrets, or raw binary bytes to the model.");
    }
    if (!modelKnowledgeQuestion && githubToolsEnabled(ownerAuthenticated, githubToken, projectMetadata.repository)) {
      runtimeCapabilityNotes.push("Owner-wide owner_project_* tools can read registered Personal project metadata and repositories. Safe project metadata (name, active deployment URL, status, context summary, navigation links) is durably writable without editing application code. Repository, branch, Cloudflare Worker, Convex deployment/backend URL, credentials, and routing remain protected provider mappings. Cross-project writes are runtime-blocked unless the latest user instruction explicitly names/authorizes that destination project. Use owner_projects_list when mappings are unclear.");
    }
    if (platformToolsRequested && ownerAuthenticated && githubToken) {
      runtimeCapabilityNotes.push("The owner explicitly requested a Viking Aries platform UI change. va_platform_* tools are available and are hard-scoped to dakotawireless/VikingAries on main. Use them for the platform change while keeping ordinary github_* tools scoped to the selected project.");
    }
    if (repeatedRepairDiagnosis && ownerAuthenticated && githubToken) {
      runtimeCapabilityNotes.push("A prior repair appears to have failed. Read-only diagnostic_* tools are available across registered Viking Aries projects. Re-diagnose across relevant layers before another edit; do not repeat the previous repair strategy without new evidence.");
    }
    if (!modelKnowledgeQuestion && cloudflareToolsEnabled(ownerAuthenticated, cloudflareToken, projectMetadata.cloudflareWorker)) {
      runtimeCapabilityNotes.push("Cloudflare status, build-log, and build-trigger tools are available for the selected project's server-registered Worker. Trigger builds only when the user explicitly asks to deploy or rebuild.");
    }
    if (!modelKnowledgeQuestion && convexToolsEnabled(ownerAuthenticated, convexToken, projectMetadata.backendDeployment)) {
      runtimeCapabilityNotes.push("Convex deployment-status tools are available for the selected project's server-registered deployment. Use GitHub tools to inspect or edit convex/schema.ts and convex function source, and use the project's existing deployment pipeline for backend deploys unless a direct Convex deployment action is explicitly available.");
    }

    const runtimeInstructions = runtimeCapabilityNotes.length
      ? `${instructions}\n${runtimeCapabilityNotes.join("\n")}`
      : instructions;

    let payload;
    let budgetPaused = false;
    let budgetStop = null;
    let executedTools = 0;
    let toolRounds = 0;
    const writeAttempts = new Map();
    const actionReceipts = [];
    const runState = currentRunRecoveryState() || {
      startedAt: Date.now(), completedOperations: [], writes: [],
    };
    updateRunRecoveryState({
      runId: jobId || crypto.randomUUID(),
      model,
      provider: "OpenAI",
      projectId,
      threadId,
      request: latestUserText(body?.messages).slice(0, 4000),
      writesOccurred: false,
    });
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
      updateRunRecoveryState({ estimatedCostUsd: chatUsage.estimatedCostUsd });
      if (chatUsage.estimatedCostUsd >= MAX_AGENT_COST_USD) {
        budgetPaused = true;
        budgetStop = {
          code: "paused",
          label: `AI cost ceiling reached (${MAX_AGENT_COST_USD.toFixed(2)} per run)`,
        };
      }
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

    const buildRecoveryResult = async (error, forcedStop = null, precomputedRecoveryText = "") => {
      const stop = forcedStop || classifyRunStop(error, budgetPaused);
      beginRunRecoveryMode();
      const state = currentRunRecoveryState() || runState;
      updateRunRecoveryState({
        stopReason: stop.label,
        executionStatus: stop.code,
        elapsedMs: Date.now() - Number(state.startedAt || Date.now()),
        toolRounds,
        toolExecutions: executedTools,
        finalOperation: state.finalOperation || (error?.message ? String(error.message).slice(0, 500) : null),
        writesOccurred: (state.writes || []).length > 0,
      });

      let recoveryText = String(precomputedRecoveryText || "").trim();
      const recoveryPrompt = [
        "The run must stop before normal completion. Produce a concise, factual recovery response using exactly these headings:",
        "## Stop reason",
        "## What was completed",
        "## Where it stopped",
        "## What remains",
        "## Change safety",
        "## Next best action",
        `Actual stop reason: ${stop.label}.`,
        `Run checkpoint: ${JSON.stringify(state)}.`,
        "Use only supported findings from the conversation and checkpoint. State exactly which writes/deployments occurred or that none occurred. Recommend a specific bounded next step. Say that 'continue' resumes from saved progress without replaying writes. Do not call tools.",
      ].join("\n");

      const costCeilingReached =
        stop.label.startsWith("AI cost ceiling reached") ||
        chatUsage.estimatedCostUsd >= MAX_AGENT_COST_USD;
      if (!recoveryText && !costCeilingReached && !currentRunSignal()?.aborted && currentRunDeadlineAt() - Date.now() > 3000) {
        try {
          const recoveryPayload = await callOpenAI({
            apiKey,
            model,
            instructions: runtimeInstructions,
            input: recoveryPrompt,
            tools: [],
            previousResponseId: payload?.id || undefined,
            finalOnly: true,
            abortSignal: currentRunSignal() || request.signal,
            timeoutMs: Math.max(1000, Math.min(40000, currentRunDeadlineAt() - Date.now() - 1000)),
            maxOutputTokens: 2200,
          });
          await captureUsage(recoveryPayload);
          recoveryText = extractResponseText(recoveryPayload);
        } catch {
          recoveryText = "";
        }
      }

      const requiredRecoveryHeadings = [
        "## Stop reason",
        "## What was completed",
        "## Where it stopped",
        "## What remains",
        "## Change safety",
        "## Next best action",
      ];
      const recoveryIsStructured =
        recoveryText &&
        requiredRecoveryHeadings.every((heading) => recoveryText.includes(heading));
      if (!recoveryIsStructured) recoveryText = recoveryFallbackText(state, stop);
      updateRunRecoveryState({ recoveryText });
      await persistRecoveryCheckpoint(env, projectId, threadId, currentRunRecoveryState() || state);

      return {
        text: recoveryText + usageWarning(),
        model,
        responseId: payload?.id || null,
        toolsAvailable: tools.map((tool) => tool.name),
        usage: chatUsage,
        usageRecorded,
        actionReceipts,
        runtimeClock,
        executionStatus: stop.code,
        continuationRequired: true,
        diagnostics: {
          runId: state.runId || jobId || null,
          stopReason: stop.label,
          elapsedMs: Date.now() - Number(state.startedAt || Date.now()),
          toolRounds,
          toolExecutions: executedTools,
          lastSuccessfulOperation: state.lastSuccessfulOperation || null,
          finalOperation: state.finalOperation || null,
          provider: "OpenAI",
          model,
          writesOccurred: (state.writes || []).length > 0,
        },
      };
    };

    try {
      const analysisProgressId = await beginProgress("Analyzing request");
      payload = await callOpenAI({
        apiKey,
        model,
        instructions: runtimeInstructions,
        input: messages,
        tools,
        abortSignal: currentRunSignal() || request.signal,
      });
      await captureUsage(payload);
      await finishProgress(analysisProgressId, "done");

      if (budgetStop) {
        return json(await buildRecoveryResult(new RequestBudgetExceeded(), budgetStop));
      }

      for (let step = 0; step < MAX_AGENT_ROUNDS; step += 1) {
        const calls = extractFunctionCalls(payload);
        if (!calls.length) break;
        if (Date.now() >= currentRunRecoveryAt()) {
          const error = new Error("Recovery window reached before the next tool round");
          error.name = "RecoveryWindowReached";
          throw error;
        }
        toolRounds += 1;
        updateRunRecoveryState({ toolRounds, toolExecutions: executedTools });

        const outputs = [];
        for (const call of calls) {
          currentRunSignal()?.throwIfAborted();
          // Reserve four provider calls, two audit operations, and finalization.
          if (budgetPaused || executedTools >= MAX_AGENT_TOOLS || remainingRequests() < 8) {
            budgetPaused = true;
            budgetStop ||= { code: "paused", label: "Execution/tool budget reached" };
            outputs.push({ type: "function_call_output", call_id: call.call_id,
              output: JSON.stringify({ ok: false, deferred: true, error: "Not executed: this batch reached its safety budget. Send continue to resume from saved progress." }) });
            continue;
          }

          const writeTool = new Set([
            "github_write_file",
            "github_replace_text",
            "va_platform_write_file",
            "va_platform_replace_text",
            "owner_project_write_file",
            "owner_project_replace_text",
            "owner_project_update_metadata",
            "files_media_copy_project_file",
            "files_media_copy_file_to_project_repository",
          ]).has(call.name);
          if (writeTool) {
            let writeArgs = {};
            try {
              writeArgs = JSON.parse(call.arguments || "{}");
            } catch {
              writeArgs = {};
            }
            const writePath = String(writeArgs.path || writeArgs.destinationPath || "").trim() || "(unknown path)";
            const writeProject = String(writeArgs.projectId || writeArgs.destinationProjectId || projectId || "").trim();
            const writeKey = `${call.name.replace(/^va_platform_/, "github_")}:${writeProject}:${writePath}`;
            const attempts = (writeAttempts.get(writeKey) || 0) + 1;
            writeAttempts.set(writeKey, attempts);
            if (attempts > MAX_WRITE_ATTEMPTS_PER_PATH) {
              budgetPaused = true;
              budgetStop = { code: "paused", label: "Repeated write safety limit reached" };
              updateRunRecoveryState({
                finalOperation: `Stopped repeated edits to ${writePath} after ${MAX_WRITE_ATTEMPTS_PER_PATH} attempts`,
              });
              outputs.push({
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify({
                  ok: false,
                  deferred: true,
                  error: `Stopped: ${writePath} already had ${MAX_WRITE_ATTEMPTS_PER_PATH} write attempts in this run. Re-read the file and continue in a fresh bounded invocation instead of retrying the same edit.`,
                }),
              });
              continue;
            }
          }

          executedTools += 1;
          const operationLabel = describeRuntimeTool(call);
          updateRunRecoveryState({
            toolExecutions: executedTools,
            finalOperation: operationLabel,
          });
          const toolProgressId = await beginProgress(operationLabel);
          try {
            let result;
            if (call.name.startsWith("github_")) {
              result = await executeGithubTool(call, githubToken, projectMetadata);
            } else if (call.name.startsWith("owner_project")) {
              result = await executeOwnerProjectTool(call, githubToken, env, projectId, body?.messages);
            } else if (call.name.startsWith("va_platform_")) {
              result = await executeVikingAriesPlatformTool(call, githubToken);
            } else if (call.name.startsWith("diagnostic_")) {
              result = await executeCrossProjectDiagnosticTool(call, githubToken);
            } else if (call.name.startsWith("cloudflare_")) {
              result = await executeCloudflareTool(call, cloudflareToken, projectMetadata);
            } else if (call.name.startsWith("convex_")) {
              result = await executeConvexTool(call, convexToken, projectMetadata);
            } else if (call.name.startsWith("files_media_")) {
              result = await executeProjectFilesTool(call, env, projectId, githubToken, body?.messages);
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

            const operation = safeOperationRecord(call, result);
            const state = currentRunRecoveryState() || runState;
            state.completedOperations = [...(state.completedOperations || []), operation].slice(-40);
            if (receipt) {
              state.writes = [...(state.writes || []), {
                tool: call.name,
                path: receipt.path || null,
                commitSha: receipt.commitSha || null,
                buildId: receipt.buildId || null,
              }].slice(-20);
            }
            updateRunRecoveryState({
              completedOperations: state.completedOperations,
              writes: state.writes || [],
              writesOccurred: (state.writes || []).length > 0,
              lastSuccessfulOperation: operationLabel,
              finalOperation: operationLabel,
            });
            await persistRecoveryCheckpoint(env, projectId, threadId, currentRunRecoveryState() || state);

            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ ok: true, result }),
            });
          } catch (error) {
            if (error instanceof RequestBudgetExceeded) budgetPaused = true;
            const detail = error instanceof Error ? error.message : "Tool action failed";
            await finishProgress(toolProgressId, "failed", detail);
            const state = currentRunRecoveryState() || runState;
            state.failedOperations = [
              ...(state.failedOperations || []),
              safeOperationRecord(call, null, "failed", detail),
            ].slice(-20);
            updateRunRecoveryState({
              failedOperations: state.failedOperations,
              finalOperation: `${operationLabel}: ${detail}`,
            });
            await persistRecoveryCheckpoint(env, projectId, threadId, currentRunRecoveryState() || state);

            if (error?.name === "RecoveryWindowReached" || currentRunSignal()?.aborted) {
              throw error;
            }

            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ ok: false, error: error.message }),
            });
          }
        }

        if (step === MAX_AGENT_ROUNDS - 1 || executedTools >= MAX_AGENT_TOOLS || remainingRequests() < 8) {
          budgetPaused = true;
          budgetStop ||= { code: "paused", label: "Execution/tool budget reached" };
        }
        payload = await callOpenAI({
          apiKey,
          model,
          instructions: runtimeInstructions + (budgetPaused
            ? "\nThis batch is paused. Return the recovery response now using exactly these headings: ## Stop reason, ## What was completed, ## Where it stopped, ## What remains, ## Change safety, ## Next best action. Use the tool outputs from this round, do not claim deferred tools ran, identify completed writes, and tell the user that continue resumes from saved progress without replaying writes."
            : ""),
          finalOnly: budgetPaused,
          input: outputs,
          tools,
          previousResponseId: payload.id,
          abortSignal: currentRunSignal() || request.signal,
        });
        await captureUsage(payload);
        if (budgetPaused) break;
      }
    } catch (error) {
      return json(await buildRecoveryResult(error));
    }

    if (budgetPaused) {
      return json(await buildRecoveryResult(
        new RequestBudgetExceeded(),
        budgetStop || { code: "paused", label: "Execution/tool budget reached" },
        extractResponseText(payload)
      ));
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
        updateRunRecoveryState({
          finalOperation: `Provider response ended with pending tools: ${pendingCalls.map((call) => call.name).join(", ")}`,
        });
      }
      const incompleteError = new Error(
        incompleteReason
          ? `The AI response did not complete (${incompleteReason}).`
          : "The AI service returned no text."
      );
      incompleteError.status = 502;
      return json(await buildRecoveryResult(incompleteError));
    }


    return json({
      text: text + usageWarning(),
      model,
      responseId: payload?.id || null,
      toolsAvailable: tools.map((tool) => tool.name),
      usage: chatUsage,
      usageRecorded,
      actionReceipts,
      runtimeClock,
      ...(budgetPaused ? { executionStatus: "paused", continuationRequired: true } : {}),
    });
  },
};

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/api/chat") return worker.fetch(request, env);
    // Browser submissions must use the durable queue, including older open tabs.
    if (!await internalJobAuthorized(request, env)) {
      return json({ error: "This client must refresh and submit through the durable job queue." }, { status: 409 });
    }
    const body = await request.clone().json().catch(() => null);
    if (!body?.jobId) return json({ error: "A durable job ID is required." }, { status: 400 });
    const secret = await resolveSecret(env.VA_USAGE_INGEST_SECRET);
    const control = async (claim = false) => {
      const response = await globalThis.fetch(VA_CONVEX_SITE_URL + "/jobs/control", {
        method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: body.jobId, claim }), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Execution control unavailable; stopping safely.");
      return response.json();
    };
    try {
      const claimed = await control(true);
      if (claimed.status !== "running") return json({ error: "Execution is " + claimed.status }, { status: 409 });
      return await withRunControl(
        { heartbeat: control, deadlineAt: claimed.deadlineAt },
        () => withRequestBudget(async () => {
          try {
            return await worker.fetch(request, env);
          } catch (error) {
            const stop = classifyRunStop(error);
            const state = currentRunRecoveryState() || {
              runId: body.jobId,
              startedAt: Date.now(),
              completedOperations: [],
              writes: [],
              finalOperation: error?.message || "Worker execution failed",
            };
            updateRunRecoveryState({
              stopReason: stop.label,
              executionStatus: stop.code,
              elapsedMs: Date.now() - Number(state.startedAt || Date.now()),
            });
            return json({
              text: recoveryFallbackText(state, stop),
              executionStatus: stop.code,
              continuationRequired: true,
              diagnostics: {
                runId: body.jobId,
                stopReason: stop.label,
                elapsedMs: Date.now() - Number(state.startedAt || Date.now()),
                toolRounds: state.toolRounds || 0,
                toolExecutions: state.toolExecutions || 0,
                lastSuccessfulOperation: state.lastSuccessfulOperation || null,
                finalOperation: state.finalOperation || null,
                provider: state.provider || "OpenAI",
                model: state.model || body.model || null,
                writesOccurred: (state.writes || []).length > 0,
              },
            });
          }
        })
      );
    } catch (error) {
      const stop = classifyRunStop(error);
      const state = {
        runId: body.jobId,
        startedAt: Date.now(),
        completedOperations: [],
        writes: [],
        finalOperation: error?.message || "Execution control failed",
      };
      return json({
        text: recoveryFallbackText(state, stop),
        executionStatus: stop.code,
        continuationRequired: true,
        diagnostics: {
          runId: body.jobId,
          stopReason: stop.label,
          elapsedMs: 0,
          toolRounds: 0,
          toolExecutions: 0,
          lastSuccessfulOperation: null,
          finalOperation: state.finalOperation,
          provider: "OpenAI",
          model: body.model || null,
          writesOccurred: false,
        },
      });
    }
  },
};
