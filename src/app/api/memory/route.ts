import { connection } from "next/server";
import {
  DEFAULT_CHAPTER_TITLE,
  extractMemoriesFromText,
  getActiveChapter,
  getSupabaseConfig,
  isValidMemoryCategory,
  loadNovelMemoryState,
  resetNovelMemoryState,
  saveNovelMemoryState,
  stripHtmlToText,
  upsertChapterInState,
  upsertMemoryItem,
} from "@/lib/novel-memory";

const noStoreHeaders = { "Cache-Control": "no-store" };

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
    { headers: noStoreHeaders },
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Request body must be a JSON object." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (
    body.category !== undefined &&
    !isValidMemoryCategory(body.category)
  ) {
    return Response.json(
      {
        error:
          "Invalid category. Expected one of: character, world, plot, timeline, styleRule.",
      },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const state = await loadNovelMemoryState();

  const chapterTitle =
    typeof body.chapterTitle === "string" && body.chapterTitle.trim()
      ? body.chapterTitle.trim()
      : state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;

  if (
    typeof body.canvasHtml === "string" ||
    typeof body.canvasText === "string" ||
    typeof body.chapterTitle === "string"
  ) {
    const canvasHtml =
      typeof body.canvasHtml === "string" ? body.canvasHtml : undefined;
    const canvasText =
      typeof body.canvasText === "string"
        ? body.canvasText
        : canvasHtml !== undefined
          ? stripHtmlToText(canvasHtml)
          : undefined;

    upsertChapterInState(state, {
      title: chapterTitle,
      contentHtml: canvasHtml,
      contentText: canvasText,
    });

    if (canvasText) {
      extractMemoriesFromText(state, canvasText, "canvas", chapterTitle);
    }
  }

  if (typeof body.text === "string" && body.text.trim()) {
    extractMemoriesFromText(state, body.text, "user_prompt", chapterTitle);
  }

  if (
    isValidMemoryCategory(body.category) &&
    typeof body.name === "string" &&
    typeof body.details === "string"
  ) {
    upsertMemoryItem(state, {
      category: body.category,
      name: body.name,
      details: body.details,
      chapterTitle,
      importance:
        typeof body.importance === "number" ? body.importance : undefined,
    });
  }

  if (body.memory && typeof body.memory === "object") {
    const mem = body.memory as Record<string, unknown>;
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
        importance:
          typeof mem.importance === "number" ? mem.importance : undefined,
      });
    }
  }

  if (Array.isArray(body.memories)) {
    for (const item of body.memories) {
      if (item && typeof item === "object") {
        const mem = item as Record<string, unknown>;
        if (
          isValidMemoryCategory(mem.category) &&
          typeof mem.name === "string" &&
          typeof mem.details === "string"
        ) {
          upsertMemoryItem(state, {
            category: mem.category,
            name: mem.name,
            details: mem.details,
            chapterTitle:
              typeof mem.chapterTitle === "string" && mem.chapterTitle.trim()
                ? mem.chapterTitle.trim()
                : chapterTitle,
            importance:
              typeof mem.importance === "number" ? mem.importance : undefined,
          });
        }
      }
    }
  }

  await saveNovelMemoryState(state);

  return Response.json(
    {
      ok: true,
      activeChapterTitle: state.activeChapterTitle,
      activeChapter: getActiveChapter(state),
      memories: state.memories,
      chapters: Object.values(state.chapters),
    },
    { headers: noStoreHeaders },
  );
}

export async function PUT(req: Request) {
  return POST(req);
}

export async function DELETE() {
  const fresh = await resetNovelMemoryState();
  return Response.json(
    { ok: true, reset: true, state: fresh },
    { headers: noStoreHeaders },
  );
}

