const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

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

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        aiConfigured: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || "gpt-5.6-luna",
      });
    }

    if (url.pathname !== "/api/chat") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, { status: 405 });
    }

    if (!env.OPENAI_API_KEY) {
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
    const instructions = [
      "You are Viking Aries, an AI software-building assistant inside Erik's private app-builder workspace.",
      `The currently selected project is: ${projectName}.`,
      `The current chat thread is: ${threadTitle}.`,
      "Be practical, concise, and implementation-oriented.",
      "Maintain awareness that Viking Aries is being built to manage multiple related projects while keeping write actions scoped to the selected project.",
      "Do not claim that you changed code, deployed an app, accessed a repository, or called an external service unless the Viking Aries runtime actually supplied a tool result proving that action occurred.",
      "At this stage, chat can advise, plan, debug, and discuss implementation. Tool-backed editing and deployment actions will be added separately.",
    ].join("\n");

    let upstream;
    try {
      upstream = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
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
