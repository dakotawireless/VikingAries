const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_ACCOUNT_ID = "f2ca2f43ab364db1c4391a015d6698fe";

async function resolveSecret(binding) {
  if (!binding) return null;
  if (typeof binding === "string") return binding;
  if (typeof binding.get === "function") {
    return await binding.get();
  }
  return null;
}


const PROJECT_RUNTIME_CONFIG = {
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

  throw new Error(`Unsupported tool: ${call.name}`);
}

async function callOpenAI({ apiKey, model, instructions, input, tools, previousResponseId }) {
  const body = {
    model,
    instructions,
    input,
    max_output_tokens: 3000,
  };
  if (tools?.length) body.tools = tools;
  if (previousResponseId) body.previous_response_id = previousResponseId;

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "The AI service returned an error.");
    error.status = response.status;
    throw error;
  }
  return payload;
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

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export default {
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

    if (url.pathname === "/api/integrations/status") {
      const auth = await ownerAuthConfig(env);
      const authenticated = auth.configured
        ? await verifyOwnerSession(request, auth.sessionSecret)
        : false;
      const [githubToken, cloudflareToken] = await Promise.all([
        resolveSecret(env.GITHUB_TOKEN),
        resolveSecret(env.CLOUDFLARE_API_TOKEN),
      ]);
      const projectConfig = registeredProjectConfig(url.searchParams.get("projectId"));

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
            usable: Boolean(
              auth.configured &&
              authenticated &&
              githubToken &&
              projectConfig?.repository
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
          convex: { configured: false, usable: false },
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

      try {
        const profile = await githubRequest(githubToken, "/user");
        return json({
          ok: true,
          login: profile?.login || null,
          name: profile?.name || null,
        });
      } catch (error) {
        return json({ error: error.message }, { status: 502 });
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

      try {
        const verification = await cloudflareVerifyToken(cloudflareToken);
        return json({
          ok: verification.status === "active",
          status: verification.status,
          tokenId: verification.id,
          expiresOn: verification.expiresOn,
          accountId: CLOUDFLARE_ACCOUNT_ID,
        });
      } catch (error) {
        return json({ error: error.message }, { status: 502 });
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
    const ownerAuthenticated = auth.configured
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

    const projectName =
      typeof body?.project?.name === "string" && body.project.name.trim()
        ? body.project.name.trim().slice(0, 120)
        : "Unknown project";

    const threadTitle =
      typeof body?.thread?.title === "string" && body.thread.title.trim()
        ? body.thread.title.trim().slice(0, 160)
        : "Untitled chat";

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
      projectMetadata.cloudflareWorker = runtimeProject.cloudflareWorker || projectMetadata.cloudflareWorker;
      projectMetadata.backend = runtimeProject.backend || projectMetadata.backend;
      projectMetadata.backendDeployment = runtimeProject.backendDeployment || projectMetadata.backendDeployment;
      projectMetadata.backendUrl = runtimeProject.backendUrl || projectMetadata.backendUrl;
      projectMetadata.convexDashboardUrl = runtimeProject.convexDashboardUrl || projectMetadata.convexDashboardUrl;
    } else {
      // Until the durable VA backend owns project mappings, unregistered projects do not receive write-capable provider tools.
      projectMetadata.repository = "";
    }

    const messages = Array.isArray(body?.messages)
      ? body.messages
          .filter(
            (message) =>
              (message?.role === "user" || message?.role === "assistant") &&
              typeof message?.content === "string" &&
              message.content.trim()
          )
          .slice(-40)
          .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, 12000),
          }))
      : [];

    if (!messages.length) {
      return json({ error: "At least one chat message is required." }, { status: 400 });
    }

    const model = env.OPENAI_MODEL || "gpt-5.6-luna";
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
      "Do not claim that you changed code, deployed an app, accessed a repository, or called an external service unless the Viking Aries runtime actually supplied a tool result proving that action occurred.",
      "Use any tool-backed actions supplied by the Viking Aries runtime when they are available. If a required provider action is not actually available, say exactly which connection or capability is missing instead of claiming the action occurred.",
    ].filter(Boolean).join("\n");

    const [githubToken, cloudflareToken] = await Promise.all([
      resolveSecret(env.GITHUB_TOKEN),
      resolveSecret(env.CLOUDFLARE_API_TOKEN),
    ]);
    const tools = [
      ...(githubToolsEnabled(ownerAuthenticated, githubToken, projectMetadata.repository)
        ? buildGithubTools()
        : []),
      ...(cloudflareToolsEnabled(ownerAuthenticated, cloudflareToken, projectMetadata.cloudflareWorker)
        ? buildCloudflareTools()
        : []),
    ];

    const runtimeCapabilityNotes = [];
    if (githubToolsEnabled(ownerAuthenticated, githubToken, projectMetadata.repository)) {
      runtimeCapabilityNotes.push("GitHub read/list/write tools are available for the selected project's server-registered repository. Use them when needed, and report commit SHAs from tool results after writes.");
    }
    if (cloudflareToolsEnabled(ownerAuthenticated, cloudflareToken, projectMetadata.cloudflareWorker)) {
      runtimeCapabilityNotes.push("Cloudflare status, build-log, and build-trigger tools are available for the selected project's server-registered Worker. Trigger builds only when the user explicitly asks to deploy or rebuild.");
    }

    const runtimeInstructions = runtimeCapabilityNotes.length
      ? `${instructions}\n${runtimeCapabilityNotes.join("\n")}`
      : instructions;

    let payload;
    try {
      payload = await callOpenAI({
        apiKey,
        model,
        instructions: runtimeInstructions,
        input: messages,
        tools,
      });

      for (let step = 0; step < 8; step += 1) {
        const calls = extractFunctionCalls(payload);
        if (!calls.length) break;

        const outputs = [];
        for (const call of calls) {
          try {
            let result;
            if (call.name.startsWith("github_")) {
              result = await executeGithubTool(call, githubToken, projectMetadata);
            } else if (call.name.startsWith("cloudflare_")) {
              result = await executeCloudflareTool(call, cloudflareToken, projectMetadata);
            } else {
              throw new Error(`Unsupported runtime tool: ${call.name}`);
            }
            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ ok: true, result }),
            });
          } catch (error) {
            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({ ok: false, error: error.message }),
            });
          }
        }

        payload = await callOpenAI({
          apiKey,
          model,
          instructions: runtimeInstructions,
          input: outputs,
          tools,
          previousResponseId: payload.id,
        });
      }
    } catch (error) {
      return json(
        { error: error.message || "Could not reach the AI service." },
        { status: error.status || 502 }
      );
    }

    const text = extractResponseText(payload);
    if (!text) {
      return json({ error: "The AI service returned no text." }, { status: 502 });
    }

    return json({
      text,
      model,
      responseId: payload?.id || null,
      toolsAvailable: tools.map((tool) => tool.name),
    });
  },
};
