const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

async function resolveSecret(binding) {
  if (!binding) return null;
  if (typeof binding === "string") return binding;
  if (typeof binding.get === "function") {
    return await binding.get();
  }
  return null;
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
    if (auth.configured && !(await verifyOwnerSession(request, auth.sessionSecret))) {
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

    let upstream;
    try {
      upstream = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions,
          input: messages,
          max_output_tokens: 3000,
        }),
      });
    } catch {
      return json({ error: "Could not reach the AI service." }, { status: 502 });
    }

    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      const upstreamMessage =
        payload?.error?.message || "The AI service returned an error.";
      return json({ error: upstreamMessage }, { status: upstream.status });
    }

    const text = extractResponseText(payload);
    if (!text) {
      return json({ error: "The AI service returned no text." }, { status: 502 });
    }

    return json({
      text,
      model,
      responseId: payload?.id || null,
    });
  },
};
