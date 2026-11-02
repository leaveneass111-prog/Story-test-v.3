import { google } from "@ai-sdk/google";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import { connection } from "next/server";
import {
  appendChatMessage,
  buildNovelSystemPrompt,
  DEFAULT_CHAPTER_TITLE,
  extractMemoriesFromText,
  extractStructuredMemoriesWithAI,
  getActiveChapter,
  getSupabaseConfig,
  isValidMemoryCategory,
  loadNovelMemoryState,
  type MemoryCategory,
  saveNovelMemoryState,
  stripHtmlToText,
  upsertChapterInState,
  upsertMemoryItem,
} from "@/lib/novel-memory";

export const maxDuration = 60;

type IncomingMessagePart = {
  type?: string;
  text?: string;
};

type IncomingMessage = {
  role?: string;
  content?: string | IncomingMessagePart[];
  parts?: IncomingMessagePart[];
};

function extractMessageText(msg: IncomingMessage): string {
  if (typeof msg.content === "string") {
    return msg.content.trim();
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function buildValidModelMessages(
  priorTurns: Array<{ role: "user" | "assistant"; content: string }>,
  currentMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const combined = [...priorTurns, ...currentMessages];
  const merged: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

  for (const msg of combined) {
    const clean = msg.content.trim();
    if (!clean) continue;
    if (merged.length === 0 && msg.role === "assistant") {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      if (prev.content === clean) {
        continue;
      }
      prev.content = `${prev.content}\n\n${clean}`;
    } else {
      merged.push({ role: msg.role, content: clean });
    }
  }

  return merged.length > 0 ? merged : currentMessages;
}

export async function GET() {
  await connection();
  const state = await loadNovelMemoryState();
  const activeChapter = getActiveChapter(state);

  return Response.json(
    {
      ok: true,
      projectRef: state.projectRef,
      supabaseConfigured: Boolean(getSupabaseConfig()),
      activeChapterTitle: state.activeChapterTitle,
      activeChapter,
      chapters: Object.values(state.chapters),
      memories: state.memories,
      chatHistory: state.chatHistory,
      updatedAt: state.updatedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Request body must be a JSON object." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const state = await loadNovelMemoryState();

  const chapterTitle =
    typeof body.chapterTitle === "string" && body.chapterTitle.trim()
      ? body.chapterTitle.trim()
      : state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;

  const canvasHtml =
    typeof body.canvasHtml === "string" ? body.canvasHtml : undefined;
  const canvasText =
    typeof body.canvasText === "string"
      ? body.canvasText
      : canvasHtml !== undefined
        ? stripHtmlToText(canvasHtml)
        : undefined;

  const chapter = upsertChapterInState(state, {
    title: chapterTitle,
    contentHtml: canvasHtml,
    contentText: canvasText,
  });

  if (canvasText) {
    extractMemoriesFromText(state, canvasText, "canvas", chapterTitle);
  }

  if (body.memory && typeof body.memory === "object") {
    const mem = body.memory as {
      category?: MemoryCategory;
      name?: string;
      details?: string;
      importance?: number;
    };
    if (
      isValidMemoryCategory(mem.category) &&
      typeof mem.name === "string" &&
      typeof mem.details === "string"
    ) {
      upsertMemoryItem(state, {
        category: mem.category,
        name: mem.name,
        details: mem.details,
        chapterTitle,
        importance: mem.importance,
      });
    }
  }

  await saveNovelMemoryState(state);

  return Response.json(
    {
      ok: true,
      activeChapterTitle: state.activeChapterTitle,
      activeChapter: chapter,
      memoriesCount: state.memories.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Request body must be a JSON object." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rawMessages = Array.isArray(body.messages)
    ? (body.messages as IncomingMessage[])
    : typeof body.prompt === "string" && body.prompt.trim()
      ? [{ role: "user", content: body.prompt.trim() }]
      : [];

  const normalizedMessages = rawMessages
    .map((msg) => {
      const role: "user" | "assistant" | "system" =
        msg.role === "assistant"
          ? "assistant"
          : msg.role === "system"
            ? "system"
            : "user";
      const content = extractMessageText(msg);
      return { role, content };
    })
    .filter((msg) => msg.content.length > 0);

  if (normalizedMessages.length === 0) {
    return Response.json(
      { error: "At least one non-empty message is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const state = await loadNovelMemoryState();

  const chapterTitle =
    typeof body.chapterTitle === "string" && body.chapterTitle.trim()
      ? body.chapterTitle.trim()
      : state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;

  const canvasHtml =
    typeof body.canvasHtml === "string" ? body.canvasHtml : undefined;
  const canvasText =
    typeof body.canvasText === "string"
      ? body.canvasText
      : canvasHtml !== undefined
        ? stripHtmlToText(canvasHtml)
        : undefined;

  if (canvasHtml !== undefined || canvasText !== undefined || body.chapterTitle) {
    upsertChapterInState(state, {
      title: chapterTitle,
      contentHtml: canvasHtml,
      contentText: canvasText,
    });
    if (canvasText) {
      extractMemoriesFromText(state, canvasText, "canvas", chapterTitle);
    }
  }

  const latestUserMsg = [...normalizedMessages]
    .reverse()
    .find((m) => m.role === "user");
  const latestUserText = latestUserMsg?.content ?? "";

  // Build conversation messages with backend history if caller only sent the latest turn
  const priorStoredMessages =
    normalizedMessages.length === 1 && state.chatHistory.length > 0
      ? state.chatHistory.slice(-6).map((turn) => ({
          role: turn.role as "user" | "assistant",
          content: turn.content,
        }))
      : [];

  if (normalizedMessages.length > 1 && state.chatHistory.length === 0) {
    for (const msg of normalizedMessages.slice(0, -1)) {
      if (msg.role === "user" || msg.role === "assistant") {
        appendChatMessage(state, {
          role: msg.role,
          content: msg.content,
          chapterTitle,
        });
      }
    }
  }

  if (latestUserText) {
    extractMemoriesFromText(state, latestUserText, "user_prompt", chapterTitle);
    appendChatMessage(state, {
      role: "user",
      content: latestUserText,
      chapterTitle,
    });
  }

  await saveNovelMemoryState(state);

  const activeChapter = getActiveChapter(state, chapterTitle);
  const effectiveCanvasText =
    canvasText ?? activeChapter?.contentText ?? "";

  const systemPrompt = buildNovelSystemPrompt(
    state,
    chapterTitle,
    effectiveCanvasText,
  );

  const modelMessages = buildValidModelMessages(
    priorStoredMessages,
    normalizedMessages,
  );
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const result = streamText({
    model: google(modelName),
    system: systemPrompt,
    messages: modelMessages,
  });

  const baseUiStream = toUIMessageStream({ stream: result.stream });
  let assistantFullText = "";

  const memoryTrackingStream = baseUiStream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (
          chunk &&
          typeof chunk === "object" &&
          chunk.type === "text-delta" &&
          typeof chunk.delta === "string"
        ) {
          assistantFullText += chunk.delta;
        }
        controller.enqueue(chunk);
      },
      async flush() {
        const cleanOutput = assistantFullText.trim();
        if (!cleanOutput) return;

        try {
          const latestState = await loadNovelMemoryState();
          appendChatMessage(latestState, {
            role: "assistant",
            content: cleanOutput,
            chapterTitle,
          });
          upsertChapterInState(latestState, {
            title: chapterTitle,
            appendText: cleanOutput,
          });
          extractMemoriesFromText(
            latestState,
            cleanOutput,
            "assistant_output",
            chapterTitle,
          );
          await saveNovelMemoryState(latestState);

          void extractStructuredMemoriesWithAI(latestState, {
            chapterTitle,
            userPrompt: latestUserText,
            assistantResponse: cleanOutput,
          });
        } catch {
          // Avoid failing stream termination if background save errors
        }
      },
    }),
  );

  return createUIMessageStreamResponse({
    stream: memoryTrackingStream,
  });
}
