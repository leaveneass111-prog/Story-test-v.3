import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

export const DEFAULT_SUPABASE_PROJECT_REF = "irfumfhbdzabnhfyafgk";
export const DEFAULT_SUPABASE_URL = `https://${DEFAULT_SUPABASE_PROJECT_REF}.supabase.co`;
export const DEFAULT_PROJECT_UUID = "00000000-0000-4000-8000-000000000001";

export const DEFAULT_CHAPTER_TITLE = "บทนำ: เสียงกระซิบใต้เงาจันทรา";
export const DEFAULT_CHAPTER_HTML =
  "<h1>บทนำ: เสียงกระซิบใต้เงาจันทรา</h1><p>สายลมหนาวพัดกรูผ่านช่องหน้าต่างบานเก่า กลิ่นอายของกำยานและหมึกแห้งลอยอบอวลไปทั่วห้องหนังสือโบราณ...</p>";
export const DEFAULT_CHAPTER_TEXT =
  "บทนำ: เสียงกระซิบใต้เงาจันทรา\nสายลมหนาวพัดกรูผ่านช่องหน้าต่างบานเก่า กลิ่นอายของกำยานและหมึกแห้งลอยอบอวลไปทั่วห้องหนังสือโบราณ...";

export type MemoryCategory =
  | "character"
  | "world"
  | "plot"
  | "timeline"
  | "styleRule";

export type NovelMemoryItem = {
  id: string;
  category: MemoryCategory;
  name: string;
  details: string;
  chapterTitle: string;
  importance: number;
  updatedAt: string;
};

export type NovelChapterRecord = {
  id: string;
  title: string;
  contentHtml: string;
  contentText: string;
  summary: string;
  charCount: number;
  wordCount: number;
  updatedAt: string;
};

export type NovelChatTurn = {
  id: string;
  chapterTitle: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type NovelMemoryState = {
  projectRef: string;
  activeChapterTitle: string;
  chapters: Record<string, NovelChapterRecord>;
  memories: NovelMemoryItem[];
  chatHistory: NovelChatTurn[];
  updatedAt: string;
};

export type SupabaseConfig = {
  url: string;
  apiKey: string;
  projectRef: string;
};

const LOCAL_STORE_DIR = path.join(process.cwd(), ".data");
const LOCAL_STORE_FILE = path.join(LOCAL_STORE_DIR, "novel-memory.json");

const STATE_EPOCH_SYMBOL = Symbol.for("novel.memory.stateEpoch");

type EpochTaggedState = NovelMemoryState & {
  [STATE_EPOCH_SYMBOL]?: number;
};

export const VALID_MEMORY_CATEGORIES: ReadonlySet<MemoryCategory> = new Set<MemoryCategory>([
  "character",
  "world",
  "plot",
  "timeline",
  "styleRule",
]);

export function isValidMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === "string" && VALID_MEMORY_CATEGORIES.has(value as MemoryCategory);
}

let memoryCache: EpochTaggedState | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let stateEpoch = 0;
let lastSupabaseLoadAt = 0;

function tagStateWithEpoch(state: NovelMemoryState, epoch = stateEpoch): EpochTaggedState {
  const tagged = state as EpochTaggedState;
  Object.defineProperty(tagged, STATE_EPOCH_SYMBOL, {
    value: epoch,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return tagged;
}

function getStateEpochTag(state: NovelMemoryState): number | undefined {
  return (state as EpochTaggedState)[STATE_EPOCH_SYMBOL];
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");

  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY ||
    "";

  if (!apiKey.trim()) {
    return null;
  }

  const extractedRef =
    url.match(/^https?:\/\/([^.]+)\.supabase\.co/i)?.[1] ||
    DEFAULT_SUPABASE_PROJECT_REF;

  return {
    url,
    apiKey: apiKey.trim(),
    projectRef: extractedRef,
  };
}

export function makeStableId(prefix: string, rawKey: string): string {
  const normalized = rawKey.trim().toLowerCase().replace(/\s+/g, " ");
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

export function getActiveChapter(
  state: NovelMemoryState,
  chapterTitle?: string,
): NovelChapterRecord | null {
  const targetTitle = (chapterTitle || state.activeChapterTitle || DEFAULT_CHAPTER_TITLE).trim();
  const activeChapterId = makeStableId("chapter", targetTitle);
  return (
    state.chapters[activeChapterId] ??
    Object.values(state.chapters).find((ch) => ch.title === targetTitle) ??
    Object.values(state.chapters)[0] ??
    null
  );
}

export function stripHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|h1|h2|h3|blockquote|li|div)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ldquo;|&#8220;/gi, "“")
    .replace(/&rdquo;|&#8221;/gi, "”")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainTextToRichHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (
    trimmed.includes("<p>") ||
    trimmed.includes("<h") ||
    trimmed.includes("<blockquote>")
  ) {
    return trimmed;
  }
  return trimmed
    .split(/\n\n+/)
    .map((para) => {
      const p = para.trim();
      if (!p) return "";
      if (p.startsWith("“") || p.startsWith('"')) {
        return `<blockquote>${p}</blockquote>`;
      }
      return `<p>${p}</p>`;
    })
    .filter(Boolean)
    .join("");
}

export function computeCounts(text: string): { charCount: number; wordCount: number } {
  const charCount = text.length;
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  return { charCount, wordCount };
}

export function summarizeText(text: string, maxChars = 500): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  const head = cleaned.slice(0, Math.floor(maxChars * 0.45));
  const tail = cleaned.slice(-Math.floor(maxChars * 0.45));
  return `${head} ... ${tail}`;
}

export function createInitialMemoryState(): NovelMemoryState {
  const now = new Date().toISOString();
  const chapterId = makeStableId("chapter", DEFAULT_CHAPTER_TITLE);
  const counts = computeCounts(DEFAULT_CHAPTER_TEXT);

  return tagStateWithEpoch({
    projectRef: getSupabaseConfig()?.projectRef || DEFAULT_SUPABASE_PROJECT_REF,
    activeChapterTitle: DEFAULT_CHAPTER_TITLE,
    chapters: {
      [chapterId]: {
        id: chapterId,
        title: DEFAULT_CHAPTER_TITLE,
        contentHtml: DEFAULT_CHAPTER_HTML,
        contentText: DEFAULT_CHAPTER_TEXT,
        summary: DEFAULT_CHAPTER_TEXT,
        charCount: counts.charCount,
        wordCount: counts.wordCount,
        updatedAt: now,
      },
    },
    memories: [
      {
        id: makeStableId("world", "ห้องหนังสือโบราณ"),
        category: "world",
        name: "ห้องหนังสือโบราณ",
        details:
          "ฉากเริ่มต้นของเรื่อง: ห้องหนังสือโบราณที่มีสายลมหนาวพัดผ่านหน้าต่างบานเก่า อบอวลด้วยกลิ่นกำยานและหมึกแห้งยามค่ำคืนใต้เงาจันทรา",
        chapterTitle: DEFAULT_CHAPTER_TITLE,
        importance: 4,
        updatedAt: now,
      },
      {
        id: makeStableId("timeline", "เหตุการณ์เปิดเรื่อง"),
        category: "timeline",
        name: "เหตุการณ์เปิดเรื่อง: บทนำใต้เงาจันทรา",
        details:
          "ยามค่ำคืนใต้เงาจันทรา สายลมหนาวพัดผ่านช่องหน้าต่างบานเก่าเข้ามาในห้องหนังสือโบราณ",
        chapterTitle: DEFAULT_CHAPTER_TITLE,
        importance: 4,
        updatedAt: now,
      },
    ],
    chatHistory: [],
    updatedAt: now,
  });
}

async function fetchSupabaseRest<T>(
  config: SupabaseConfig,
  endpoint: string,
  init: RequestInit = {},
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const headers: Record<string, string> = {
      apikey: config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };

    const res = await fetch(`${config.url}/rest/v1/${endpoint}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const text = await res.text();
    if (!text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function syncStateToSupabase(
  state: NovelMemoryState,
  config: SupabaseConfig,
): Promise<boolean> {
  try {
    const activeChapter = getActiveChapter(state);
    const characterMemories = state.memories.filter(
      (m) => m.category === "character",
    );
    const styleMemories = state.memories.filter(
      (m) => m.category === "styleRule",
    );

    const projectPayload = {
      id: DEFAULT_PROJECT_UUID,
      name: state.activeChapterTitle || DEFAULT_CHAPTER_TITLE,
      genre: "novel-crafter",
      tone:
        styleMemories.map((s) => s.details).join(" | ").slice(0, 250) ||
        "วรรณกรรมไทย (Show, Don't Tell)",
      characters: characterMemories,
      plot_outline: {
        projectRef: state.projectRef,
        activeChapterTitle: state.activeChapterTitle,
        chapters: state.chapters,
        memories: state.memories,
        chatHistory: state.chatHistory.slice(-50),
        updatedAt: state.updatedAt,
      },
      content:
        activeChapter?.contentHtml ||
        activeChapter?.contentText ||
        DEFAULT_CHAPTER_HTML,
      updated_at: state.updatedAt,
    };

    const rows = await fetchSupabaseRest<Array<{ id: string }>>(
      config,
      "projects?on_conflict=id&select=id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(projectPayload),
      },
    );

    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function loadStateFromSupabase(
  config: SupabaseConfig,
): Promise<Partial<NovelMemoryState> | null> {
  try {
    type DbProjectRow = {
      id: string;
      name: string;
      genre?: string | null;
      tone?: string | null;
      characters?: NovelMemoryItem[] | null;
      plot_outline?: {
        projectRef?: string;
        activeChapterTitle?: string;
        chapters?: Record<string, NovelChapterRecord>;
        memories?: NovelMemoryItem[];
        chatHistory?: NovelChatTurn[];
        updatedAt?: string;
      } | null;
      content?: string | null;
      updated_at?: string;
    };

    const rows = await fetchSupabaseRest<DbProjectRow[]>(
      config,
      `projects?id=eq.${DEFAULT_PROJECT_UUID}&select=*&limit=1`,
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const outline =
      row.plot_outline && typeof row.plot_outline === "object"
        ? row.plot_outline
        : {};

    const chapters: Record<string, NovelChapterRecord> = {};
    if (outline.chapters && typeof outline.chapters === "object") {
      for (const [key, ch] of Object.entries(outline.chapters)) {
        if (ch && typeof ch === "object") {
          const title = (ch.title || key || DEFAULT_CHAPTER_TITLE).trim();
          const stableId = makeStableId("chapter", title);
          chapters[stableId] = {
            ...ch,
            id: stableId,
            title,
          };
        }
      }
    }

    const activeChapterTitle =
      outline.activeChapterTitle || row.name || DEFAULT_CHAPTER_TITLE;

    if (Object.keys(chapters).length === 0 && row.content) {
      const chId = makeStableId("chapter", activeChapterTitle);
      const contentText = stripHtmlToText(row.content);
      const counts = computeCounts(contentText);
      chapters[chId] = {
        id: chId,
        title: activeChapterTitle,
        contentHtml: row.content,
        contentText,
        summary: summarizeText(contentText, 650),
        charCount: counts.charCount,
        wordCount: counts.wordCount,
        updatedAt: row.updated_at || new Date().toISOString(),
      };
    }

    const memoryMap = new Map<string, NovelMemoryItem>();
    if (Array.isArray(outline.memories)) {
      for (const m of outline.memories) {
        if (m && typeof m.name === "string" && m.name.trim() && isValidMemoryCategory(m.category)) {
          const stableId = makeStableId(m.category, m.name);
          memoryMap.set(stableId, {
            ...m,
            id: stableId,
            name: m.name.trim(),
            details: typeof m.details === "string" ? m.details : m.name.trim(),
            chapterTitle: m.chapterTitle || activeChapterTitle,
            importance: typeof m.importance === "number" ? m.importance : 4,
            updatedAt: m.updatedAt || row.updated_at || new Date().toISOString(),
          });
        }
      }
    }
    if (Array.isArray(row.characters)) {
      for (const c of row.characters) {
        if (c && typeof c.name === "string" && c.name.trim()) {
          const category: MemoryCategory = isValidMemoryCategory(c.category)
            ? c.category
            : "character";
          const stableId = makeStableId(category, c.name);
          if (!memoryMap.has(stableId)) {
            memoryMap.set(stableId, {
              ...c,
              id: stableId,
              category,
              name: c.name.trim(),
              details: typeof c.details === "string" ? c.details : c.name.trim(),
              chapterTitle: c.chapterTitle || activeChapterTitle,
              importance: typeof c.importance === "number" ? c.importance : 5,
              updatedAt: c.updatedAt || row.updated_at || new Date().toISOString(),
            });
          }
        }
      }
    }

    const chatHistory: NovelChatTurn[] = Array.isArray(outline.chatHistory)
      ? outline.chatHistory
      : [];

    return {
      projectRef: outline.projectRef || config.projectRef,
      activeChapterTitle,
      chapters,
      memories: Array.from(memoryMap.values()),
      chatHistory,
      updatedAt: outline.updatedAt || row.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function writeLocalStoreSnapshot(snapshot: NovelMemoryState, epoch: number): Promise<void> {
  if (epoch !== stateEpoch) return;
  try {
    await mkdir(LOCAL_STORE_DIR, { recursive: true });
    if (epoch !== stateEpoch) return;
    await writeFile(LOCAL_STORE_FILE, JSON.stringify(snapshot, null, 2), "utf8");
  } catch {
    // Ignore filesystem write errors in read-only environments
  }
}

export async function loadNovelMemoryState(): Promise<NovelMemoryState> {
  const loadEpoch = stateEpoch;
  let state: EpochTaggedState | null = memoryCache;
  const hadWarmCache = Boolean(state);

  if (!state) {
    try {
      const raw = await readFile(LOCAL_STORE_FILE, "utf8");
      const parsed = JSON.parse(raw) as NovelMemoryState;
      if (parsed && typeof parsed === "object" && parsed.chapters && Array.isArray(parsed.memories)) {
        state = tagStateWithEpoch(parsed, loadEpoch);
      }
    } catch {
      state = null;
    }
  }

  const hadLocalOrCache = Boolean(state);
  if (!state) {
    state = tagStateWithEpoch(createInitialMemoryState(), loadEpoch);
  }

  const supabaseConfig = getSupabaseConfig();
  if (supabaseConfig) {
    state.projectRef = supabaseConfig.projectRef;
  }

  const nowMs = Date.now();
  if (supabaseConfig && (!hadWarmCache || nowMs - lastSupabaseLoadAt > 15_000)) {
    lastSupabaseLoadAt = nowMs;
    const remote = await loadStateFromSupabase(supabaseConfig);
    if (loadEpoch !== stateEpoch) {
      return memoryCache ?? createInitialMemoryState();
    }

    if (remote) {
      if (!hadLocalOrCache) {
        // Cold-start recovery: use remote state directly without polluting with initial placeholder items/timestamps
        if (remote.activeChapterTitle) {
          state.activeChapterTitle = remote.activeChapterTitle;
        }
        if (remote.chapters && Object.keys(remote.chapters).length > 0) {
          state.chapters = { ...remote.chapters };
        }
        if (remote.memories && remote.memories.length > 0) {
          state.memories = [...remote.memories];
        }
        if (remote.chatHistory) {
          state.chatHistory = [...remote.chatHistory];
        }
        if (remote.updatedAt) {
          state.updatedAt = remote.updatedAt;
        }
        const recoveredSnapshot = structuredClone(state);
        writeQueue = writeQueue.then(
          () => writeLocalStoreSnapshot(recoveredSnapshot, loadEpoch),
          () => writeLocalStoreSnapshot(recoveredSnapshot, loadEpoch),
        );
      } else {
        const remoteIsNewerOrEqual =
          !remote.updatedAt || !state.updatedAt || remote.updatedAt >= state.updatedAt;

        if (remote.activeChapterTitle && remoteIsNewerOrEqual) {
          state.activeChapterTitle = remote.activeChapterTitle;
        }
        if (remote.chapters && Object.keys(remote.chapters).length > 0) {
          for (const [chId, remoteCh] of Object.entries(remote.chapters)) {
            const localCh = state.chapters[chId];
            if (!localCh || localCh.updatedAt <= remoteCh.updatedAt) {
              state.chapters[chId] = remoteCh;
            }
          }
        }
        if (remote.memories && remote.memories.length > 0) {
          const mergedMap = new Map<string, NovelMemoryItem>();
          for (const item of state.memories) mergedMap.set(item.id, item);
          for (const item of remote.memories) {
            const existing = mergedMap.get(item.id);
            if (!existing || existing.updatedAt <= item.updatedAt) {
              mergedMap.set(item.id, item);
            }
          }
          state.memories = Array.from(mergedMap.values());
        }
        if (remote.chatHistory && remote.chatHistory.length > 0) {
          if (remoteIsNewerOrEqual && remote.chatHistory.length >= state.chatHistory.length) {
            state.chatHistory = [...remote.chatHistory];
          } else {
            const seenTurnIds = new Set(state.chatHistory.map((t) => t.id));
            for (const turn of remote.chatHistory) {
              if (turn?.id && !seenTurnIds.has(turn.id)) {
                state.chatHistory.push(turn);
                seenTurnIds.add(turn.id);
              }
            }
            state.chatHistory.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            if (state.chatHistory.length > 50) {
              state.chatHistory = state.chatHistory.slice(-50);
            }
          }
        }
        if (remote.updatedAt && (!state.updatedAt || remote.updatedAt > state.updatedAt)) {
          state.updatedAt = remote.updatedAt;
        }
      }
    }
  }

  tagStateWithEpoch(state, loadEpoch);
  memoryCache = state;
  return state;
}

export async function saveNovelMemoryState(state: NovelMemoryState): Promise<void> {
  const originEpoch = getStateEpochTag(state);
  if (originEpoch !== undefined && originEpoch !== stateEpoch) {
    return;
  }

  const jobEpoch = stateEpoch;
  state.updatedAt = new Date().toISOString();
  const tagged = tagStateWithEpoch(state, jobEpoch);
  memoryCache = tagged;
  lastSupabaseLoadAt = Date.now();

  const snapshot = structuredClone(state);
  const writeJob = async () => {
    if (jobEpoch !== stateEpoch) return;
    await writeLocalStoreSnapshot(snapshot, jobEpoch);

    if (jobEpoch !== stateEpoch) return;
    const supabaseConfig = getSupabaseConfig();
    if (supabaseConfig) {
      await syncStateToSupabase(snapshot, supabaseConfig);
    }
  };

  writeQueue = writeQueue.then(writeJob, writeJob);
  await writeQueue;
}

export async function resetNovelMemoryState(): Promise<NovelMemoryState> {
  stateEpoch += 1;
  const resetEpoch = stateEpoch;
  const fresh = tagStateWithEpoch(createInitialMemoryState(), resetEpoch);
  memoryCache = fresh;
  lastSupabaseLoadAt = Date.now();

  const snapshot = structuredClone(fresh);
  const resetJob = async () => {
    if (resetEpoch !== stateEpoch) return;
    await writeLocalStoreSnapshot(snapshot, resetEpoch);

    const supabaseConfig = getSupabaseConfig();
    if (supabaseConfig && resetEpoch === stateEpoch) {
      await fetchSupabaseRest(
        supabaseConfig,
        `projects?id=eq.${DEFAULT_PROJECT_UUID}`,
        {
          method: "DELETE",
        },
      );
      if (resetEpoch === stateEpoch) {
        await syncStateToSupabase(snapshot, supabaseConfig);
      }
    }
  };

  writeQueue = writeQueue.then(resetJob, resetJob);
  await writeQueue;
  return fresh;
}

export function upsertMemoryItem(
  state: NovelMemoryState,
  input: {
    category: MemoryCategory;
    name: string;
    details: string;
    chapterTitle?: string;
    importance?: number;
  },
): NovelMemoryItem | null {
  if (!isValidMemoryCategory(input.category)) return null;
  const cleanName = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  const cleanDetails = input.details.trim().replace(/\s+/g, " ").slice(0, 1200);
  if (!cleanName || !cleanDetails) return null;

  const id = makeStableId(input.category, cleanName);
  const now = new Date().toISOString();
  const chapterTitle = input.chapterTitle?.trim() || state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;
  const importance = Math.min(5, Math.max(1, input.importance ?? 3));

  const existingIndex = state.memories.findIndex((m) => m.id === id);
  if (existingIndex >= 0) {
    const existing = state.memories[existingIndex];
    const combinedDetails = existing.details.includes(cleanDetails)
      ? existing.details
      : cleanDetails.includes(existing.details)
        ? cleanDetails
        : `${existing.details} | ${cleanDetails}`.slice(-1200);

    const updated: NovelMemoryItem = {
      ...existing,
      name: cleanName,
      details: combinedDetails,
      chapterTitle,
      importance: Math.max(existing.importance, importance),
      updatedAt: now,
    };
    state.memories[existingIndex] = updated;
    return updated;
  }

  const created: NovelMemoryItem = {
    id,
    category: input.category,
    name: cleanName,
    details: cleanDetails,
    chapterTitle,
    importance,
    updatedAt: now,
  };
  state.memories.push(created);

  if (state.memories.length > 120) {
    state.memories.sort(
      (a, b) =>
        b.importance - a.importance ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
    state.memories = state.memories.slice(0, 120);
  }

  return created;
}

export function upsertChapterInState(
  state: NovelMemoryState,
  input: {
    title?: string;
    contentHtml?: string;
    contentText?: string;
    appendHtml?: string;
    appendText?: string;
  },
): NovelChapterRecord {
  const title = (input.title || state.activeChapterTitle || DEFAULT_CHAPTER_TITLE).trim();
  state.activeChapterTitle = title;

  const id = makeStableId("chapter", title);
  const now = new Date().toISOString();
  const existing = state.chapters[id];

  let contentHtml: string;
  let contentText: string;

  if (input.contentHtml !== undefined && input.contentText !== undefined) {
    contentHtml = input.contentHtml;
    contentText = input.contentText || stripHtmlToText(input.contentHtml);
    if (!contentHtml && contentText) {
      contentHtml = plainTextToRichHtml(contentText);
    }
  } else if (input.contentHtml !== undefined) {
    contentHtml = input.contentHtml;
    contentText = stripHtmlToText(input.contentHtml);
  } else if (input.contentText !== undefined) {
    contentText = input.contentText;
    contentHtml = plainTextToRichHtml(input.contentText);
  } else {
    contentHtml = existing?.contentHtml ?? "";
    contentText = existing?.contentText ?? stripHtmlToText(contentHtml);
  }

  if (input.appendText) {
    const cleanAppend = input.appendText.trim();
    if (cleanAppend) {
      contentText = contentText
        ? `${contentText.trim()}\n\n${cleanAppend}`
        : cleanAppend;
      const richAppend = input.appendHtml || plainTextToRichHtml(cleanAppend);
      contentHtml = contentHtml ? `${contentHtml}${richAppend}` : richAppend;
    }
  }

  const counts = computeCounts(contentText);
  const summary = summarizeText(contentText, 650);

  const record: NovelChapterRecord = {
    id,
    title,
    contentHtml,
    contentText,
    summary,
    charCount: counts.charCount,
    wordCount: counts.wordCount,
    updatedAt: now,
  };

  state.chapters[id] = record;
  return record;
}

export function appendChatMessage(
  state: NovelMemoryState,
  turn: {
    role: "user" | "assistant";
    content: string;
    chapterTitle?: string;
  },
): void {
  const clean = turn.content.trim();
  if (!clean) return;
  const now = new Date().toISOString();
  const chapterTitle = turn.chapterTitle || state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;

  const last = state.chatHistory[state.chatHistory.length - 1];
  if (last && last.role === turn.role && last.content === clean) {
    return;
  }

  state.chatHistory.push({
    id: makeStableId(`msg_${Date.now()}_${state.chatHistory.length}`, clean.slice(0, 80)),
    chapterTitle,
    role: turn.role,
    content: clean.slice(0, 4000),
    createdAt: now,
  });

  if (state.chatHistory.length > 50) {
    state.chatHistory = state.chatHistory.slice(-50);
  }
}

const CHAR_DESC_SUFFIX_RE =
  /^([ก-๙A-Za-z0-9_]{2,25}?)(?=(?:ผู้(?:มี|ถือ|ใช้|ฝึก|ครอง|สืบทอด|เป็น|บรรลุ)|แห่ง|จาก(?:สำนัก|เมือง|ตระกูล|หอ|อาณาจักร)|เป็น|คือ|มี|ใช้|ถือ|สวม|ซึ่ง|ที่(?:มี|ใช้|เป็น|สวม|ถือ)|วัย|อายุ)(?:[ก-๙A-Za-z0-9\s]|$))(.*)$/;

const STOP_CHAR_NAMES = new Set([
  "ว่า",
  "คือ",
  "ของ",
  "ใน",
  "ที่",
  "และ",
  "ตอน",
  "บทนำ",
  "นิยาย",
  "เรื่อง",
  "อะไร",
  "ใคร",
  "ไหน",
  "ใหม่",
]);

const NON_CHARACTER_PREFIX_RE =
  /^(?:เมือง|อาณาจักร|แคว้น|สำนัก|พรรค|หอคอย|หอ|ห้องหนังสือ|ตำหนัก|วิหาร|ป่า|หุบเขา|ยอดเขา|คัมภีร์|ดาบ|กระบี่|ทวน|หอก|พิณ|พัด|หยก|โอสถ|ศาสตรา|ปราณ|เวทมนตร์|เคล็ดวิชา|เพลงดาบ|เพลงกระบี่|วิชา)/;

function splitThaiCharNameAndTrailing(
  rawToken: string,
  rawExtra: string,
): { name: string; extra: string } {
  const cleanedToken = rawToken.trim().replace(/^["“'([{]+|["”')\]}.,;!?]+$/g, "");
  const suffixMatch = cleanedToken.match(CHAR_DESC_SUFFIX_RE);
  if (suffixMatch && suffixMatch[1] && suffixMatch[1].length >= 2) {
    const pureName = suffixMatch[1].trim();
    const attachedDesc = suffixMatch[2]?.trim() || "";
    const combinedExtra = [attachedDesc, rawExtra.trim()].filter(Boolean).join(" ");
    return { name: pureName, extra: combinedExtra };
  }
  return { name: cleanedToken, extra: rawExtra.trim() };
}

export function extractMemoriesFromText(
  state: NovelMemoryState,
  text: string,
  source: "user_prompt" | "canvas" | "assistant_output",
  chapterTitle?: string,
): void {
  const cleaned = text.trim();
  if (!cleaned) return;
  const activeTitle = chapterTitle || state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;

  // 1. Explicit user instructions to remember facts ("จำไว้ว่า...", "กำหนดให้...", "ข้อมูลสำคัญ...")
  const rememberMatches = cleaned.matchAll(
    /(?:จำไว้ว่า|จำว่า|กำหนดให้|ตั้งค่าให้|กฎของเรื่องคือ|ข้อมูลสำคัญ\s*[:]?)\s*([^\n.!?]{4,260})/gi,
  );
  for (const match of rememberMatches) {
    const clause = match[1].trim();
    if (clause) {
      upsertMemoryItem(state, {
        category: "plot",
        name: `ข้อกำหนดสำคัญ: ${clause.slice(0, 45)}`,
        details: clause,
        chapterTitle: activeTitle,
        importance: 5,
      });
    }
  }

  // 2. Character names & profiles (supports multiple characters on the same line & attached Thai descriptors)
  const charIntroRegex =
    /(?:(?:ตัวละคร(?:เอก|หลัก|รอง|ใหม่)?|พระเอก|นางเอก|ตัวเอก|ตัวร้าย|บอส|ชายหนุ่ม|หญิงสาว|เด็กหนุ่ม|เด็กสาว|ปรมาจารย์|อาจารย์|ศิษย์(?:พี่|น้อง|เอก)?|คุณชาย|คุณหนู|แม่ทัพ|องค์ชาย|องค์หญิง|จอมเวท|จอมมาร|นักฆ่า)\s*(?:ชื่อ(?:ว่า)?|นาม(?:ว่า)?|คือ)|(?<!(?:สถานที่(?:สำคัญ)?|อาวุธ(?:คู่กาย|ประจำกาย|ลับ)?|ไอเทม(?:สำคัญ)?|พลัง(?:พิเศษ)?|เมือง|อาณาจักร|แคว้น|สำนัก|พรรค|ตระกูล|หอคอย|หอ|ห้องหนังสือ|ตำหนัก|วิหาร|ป่า|หุบเขา|ยอดเขา|คัมภีร์|ดาบ|กระบี่|ทวน|หอก|พิณ|พัด|หยก|โอสถ|ศาสตรา|ปราณ|เวทมนตร์|เคล็ดวิชา|เพลงดาบ|เพลงกระบี่|วิชา|นิยาย|เรื่อง|ตอน|บท)\s*)(?:ชื่อ(?:ว่า)?|นาม(?:ว่า)?))\s*["“']?([ก-๙A-Za-z0-9_]{2,35})["”']?\s*([^\n,;]{0,160}?)(?=(?:\s*(?:และ|ส่วน|กับ|,|;)\s*(?:(?:ตัวละคร|พระเอก|นางเอก|ตัวเอก|ตัวร้าย|บอส|ชายหนุ่ม|หญิงสาว|เด็กหนุ่ม|เด็กสาว|ปรมาจารย์|อาจารย์|ศิษย์|คุณชาย|คุณหนู|แม่ทัพ|องค์ชาย|องค์หญิง|จอมเวท|จอมมาร|นักฆ่า)|(?:ชื่อ(?:ว่า)?|นาม(?:ว่า)?)))|[\n,;]|$)/gi;

  for (const match of cleaned.matchAll(charIntroRegex)) {
    const rawName = match[1]?.trim() || "";
    const rawExtra = match[2]?.trim() || "";
    const { name: charName, extra } = splitThaiCharNameAndTrailing(rawName, rawExtra);

    if (
      charName &&
      charName.length >= 2 &&
      !STOP_CHAR_NAMES.has(charName) &&
      !NON_CHARACTER_PREFIX_RE.test(charName)
    ) {
      upsertMemoryItem(state, {
        category: "character",
        name: charName,
        details: `${charName} ${extra || match[0].trim()}`.trim(),
        chapterTitle: activeTitle,
        importance: 5,
      });
    }
  }

  // Dialogue speaker detection: “...” ชายหนุ่มนามว่า X / X เอ่ย / X กระซิบ
  const speakerMatches = cleaned.matchAll(
    /[”"]\s*([ก-๙A-Za-z]{2,25})\s*(?:เอ่ย|กล่าว|กระซิบ|พึมพำ|ตะโกน|ถาม|ตอบ|แค่นเสียง|ถอนหายใจ)([^\n.]{0,120})/g,
  );
  for (const match of speakerMatches) {
    const speaker = match[1]?.trim();
    const action = match[2]?.trim() || "";
    if (
      speaker &&
      !NON_CHARACTER_PREFIX_RE.test(speaker) &&
      ![
        "เขา",
        "เธอ",
        "นาง",
        "มัน",
        "ฉัน",
        "ผม",
        "ข้า",
        "เสียง",
        "สายลม",
        "ชายหนุ่ม",
        "หญิงสาว",
      ].includes(speaker)
    ) {
      upsertMemoryItem(state, {
        category: "character",
        name: speaker,
        details: `${speaker} ปรากฏตัวในฉากและสนทนา ${action}`.trim(),
        chapterTitle: activeTitle,
        importance: 4,
      });
    }
  }

  // 3. Worldbuilding: locations, artifacts, powers, sects, cities
  const worldEntityRegex =
    /(?:เมือง|อาณาจักร|แคว้น|สำนัก|พรรค|ตระกูล|หอคอย|หอ|ห้องหนังสือ|ตำหนัก|วิหาร|ป่า|หุบเขา|ยอดเขา|คัมภีร์|ดาบ|กระบี่|ทวน|หอก|พิณ|พัด|หยก|โอสถ|ศาสตรา|ปราณ|เวทมนตร์|เคล็ดวิชา|เพลงดาบ|เพลงกระบี่|วิชา)\s*([ก-๙A-Za-z0-9_]{2,28})/g;

  for (const match of cleaned.matchAll(worldEntityRegex)) {
    const rawEntity = match[0]
      .trim()
      .replace(/(?:และ|ส่วน|กับ|ของ|ใน|ที่|ซึ่ง|โดย|เพื่อ|อัน)$/, "")
      .trim();
    if (rawEntity.length >= 4 && rawEntity.length <= 45) {
      const sentenceContext =
        cleaned
          .split(/[\n]+/)
          .find((line) => line.includes(rawEntity))
          ?.trim()
          .slice(0, 260) || rawEntity;

      upsertMemoryItem(state, {
        category: "world",
        name: rawEntity,
        details: sentenceContext,
        chapterTitle: activeTitle,
        importance: source === "user_prompt" ? 5 : 3,
      });
    }
  }

  const labeledWorldRegex =
    /(?:สถานที่(?:สำคัญ)?|อาวุธ(?:คู่กาย|ประจำกาย|ลับ)?|ไอเทม(?:สำคัญ)?|พลัง(?:พิเศษ)?)\s*(?:คือ|ได้แก่|ชื่อ(?:ว่า)?|:)\s*["“']?([ก-๙A-Za-z0-9_]{2,32})["”']?/g;

  for (const match of cleaned.matchAll(labeledWorldRegex)) {
    const itemName = match[1]?.trim();
    if (itemName && itemName.length >= 2) {
      const sentenceContext =
        cleaned
          .split(/[\n]+/)
          .find((line) => line.includes(itemName))
          ?.trim()
          .slice(0, 260) || match[0].trim();

      upsertMemoryItem(state, {
        category: "world",
        name: itemName,
        details: sentenceContext,
        chapterTitle: activeTitle,
        importance: 5,
      });
    }
  }

  // 4. Plot & Conflict extraction from user prompts
  if (source === "user_prompt" && cleaned.length >= 6) {
    upsertMemoryItem(state, {
      category: "plot",
      name: `แนวทางเนื้อเรื่อง (${activeTitle})`,
      details: cleaned.slice(0, 500),
      chapterTitle: activeTitle,
      importance: 4,
    });

    if (/(?:มุมมอง|บุรุษที่\s*[123]|โทนเรื่อง|สำนวน|ดาร์ก|โรแมนติก|สืบสวน|แฟนตาซี|กำลังภายใน)/.test(cleaned)) {
      upsertMemoryItem(state, {
        category: "styleRule",
        name: "สไตล์และมุมมองการเล่าเรื่อง",
        details: cleaned.slice(0, 400),
        chapterTitle: activeTitle,
        importance: 5,
      });
    }
  }

  // 5. Timeline & recent scene progression
  if (source === "assistant_output" || source === "canvas") {
    const paragraphs = cleaned
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);
    if (paragraphs.length > 0) {
      const latestParagraph = paragraphs[paragraphs.length - 1];
      upsertMemoryItem(state, {
        category: "timeline",
        name: `เหตุการณ์ล่าสุดใน ${activeTitle}`,
        details: summarizeText(latestParagraph, 350),
        chapterTitle: activeTitle,
        importance: 5,
      });
    }
  }
}

export async function extractStructuredMemoriesWithAI(
  _initialState: NovelMemoryState,
  params: {
    chapterTitle: string;
    userPrompt: string;
    assistantResponse: string;
  },
): Promise<void> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return;
  const combinedSample = `คำสั่งผู้ใช้: ${params.userPrompt}\n\nเนื้อหาที่แต่ง:\n${params.assistantResponse.slice(0, 3500)}`;
  if (combinedSample.trim().length < 40) return;

  const startEpoch = stateEpoch;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try {
    const { text } = await generateText({
      model: google(modelName),
      system:
        "คุณคือระบบสกัดความจำนิยาย (Story Bible Extractor) ตอบกลับเป็น JSON เท่านั้น ห้ามใส่ markdown code block",
      prompt: `สกัดข้อมูลสำคัญเพื่อใช้จำในตอนถัดไปจากข้อความนี้ในรูปแบบ JSON:
{
  "characters": [{"name": "ชื่อตัวละคร", "details": "รูปลักษณ์ นิสัย พลัง อาวุธ สถานะ ความสัมพันธ์"}],
  "world": [{"name": "สถานที่/ไอเทม/กฎโลก", "details": "รายละเอียด"}],
  "plot": [{"name": "ปมเรื่อง/เป้าหมาย", "details": "รายละเอียด"}],
  "timeline": [{"name": "เหตุการณ์ตามลำดับเวลา", "details": "สิ่งที่เกิดขึ้น"}],
  "chapterSummary": "สรุปเหตุการณ์สำคัญในตอนนี้สั้นๆ"
}

ข้อความ:
${combinedSample}`,
    });

    if (stateEpoch !== startEpoch) {
      return;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as {
      characters?: Array<{ name?: string; details?: string }>;
      world?: Array<{ name?: string; details?: string }>;
      plot?: Array<{ name?: string; details?: string }>;
      timeline?: Array<{ name?: string; details?: string }>;
      chapterSummary?: string;
    };

    const currentState = await loadNovelMemoryState();
    if (stateEpoch !== startEpoch) {
      return;
    }

    for (const item of parsed.characters ?? []) {
      if (item.name && item.details) {
        upsertMemoryItem(currentState, {
          category: "character",
          name: item.name,
          details: item.details,
          chapterTitle: params.chapterTitle,
          importance: 5,
        });
      }
    }
    for (const item of parsed.world ?? []) {
      if (item.name && item.details) {
        upsertMemoryItem(currentState, {
          category: "world",
          name: item.name,
          details: item.details,
          chapterTitle: params.chapterTitle,
          importance: 4,
        });
      }
    }
    for (const item of parsed.plot ?? []) {
      if (item.name && item.details) {
        upsertMemoryItem(currentState, {
          category: "plot",
          name: item.name,
          details: item.details,
          chapterTitle: params.chapterTitle,
          importance: 4,
        });
      }
    }
    for (const item of parsed.timeline ?? []) {
      if (item.name && item.details) {
        upsertMemoryItem(currentState, {
          category: "timeline",
          name: item.name,
          details: item.details,
          chapterTitle: params.chapterTitle,
          importance: 4,
        });
      }
    }

    if (parsed.chapterSummary) {
      const chId = makeStableId("chapter", params.chapterTitle);
      if (currentState.chapters[chId]) {
        currentState.chapters[chId].summary = parsed.chapterSummary.slice(0, 650);
      }
    }

    await saveNovelMemoryState(currentState);
  } catch {
    // Non-fatal background enrichment
  }
}

export function buildNovelSystemPrompt(
  state: NovelMemoryState,
  currentChapterTitle?: string,
  currentCanvasText?: string,
): string {
  const activeTitle =
    currentChapterTitle?.trim() || state.activeChapterTitle || DEFAULT_CHAPTER_TITLE;
  const activeChapter = getActiveChapter(state, activeTitle);

  const effectiveCanvasText =
    currentCanvasText?.trim() ||
    activeChapter?.contentText ||
    DEFAULT_CHAPTER_TEXT;

  const characters = state.memories.filter((m) => m.category === "character");
  const worldLore = state.memories.filter((m) => m.category === "world");
  const plotPoints = state.memories.filter((m) => m.category === "plot");
  const timelineEvents = state.memories.filter((m) => m.category === "timeline");
  const styleRules = state.memories.filter((m) => m.category === "styleRule");

  const otherChapters = Object.values(state.chapters)
    .filter((ch) => ch.title !== activeTitle && ch.summary)
    .slice(0, 6);

  const memorySections: string[] = [];

  memorySections.push(
    `[ข้อมูลตอนปัจจุบันใน Canvas]\nชื่อตอน: ${activeTitle}\nเนื้อหาในหน้ากระดาษปัจจุบัน (ยึดถือเป็นเนื้อเรื่องหลักเพื่อเขียนต่ออย่างต่อเนื่อง):\n${effectiveCanvasText.slice(-3000)}`,
  );

  if (characters.length > 0) {
    memorySections.push(
      `[ทะเบียนตัวละคร (Characters Memory)]\n${characters
        .slice(0, 20)
        .map((c) => `- ${c.name}: ${c.details}`)
        .join("\n")}`,
    );
  }

  if (worldLore.length > 0) {
    memorySections.push(
      `[ข้อมูลโลก สถานที่ และไอเทม (Worldbuilding & Lore)]\n${worldLore
        .slice(0, 20)
        .map((w) => `- ${w.name}: ${w.details}`)
        .join("\n")}`,
    );
  }

  if (plotPoints.length > 0) {
    memorySections.push(
      `[โครงเรื่อง ปมความขัดแย้ง และข้อกำหนดของผู้ใช้ (Plot & Rules)]\n${plotPoints
        .slice(0, 15)
        .map((p) => `- ${p.name}: ${p.details}`)
        .join("\n")}`,
    );
  }

  if (timelineEvents.length > 0) {
    memorySections.push(
      `[ลำดับเวลาและเหตุการณ์ที่เกิดขึ้นแล้ว (Timeline Continuity)]\n${timelineEvents
        .slice(0, 15)
        .map((t) => `- ${t.name}: ${t.details}`)
        .join("\n")}`,
    );
  }

  if (styleRules.length > 0) {
    memorySections.push(
      `[แนวทางการเขียนและโทนเรื่อง (Style & POV)]\n${styleRules
        .map((s) => `- ${s.name}: ${s.details}`)
        .join("\n")}`,
    );
  }

  if (otherChapters.length > 0) {
    memorySections.push(
      `[สรุปตอนก่อนหน้า]\n${otherChapters
        .map((ch) => `- ${ch.title}: ${ch.summary}`)
        .join("\n")}`,
    );
  }

  if (state.chatHistory.length > 0) {
    const recentTurns = state.chatHistory
      .slice(-8)
      .map(
        (t) =>
          `${t.role === "user" ? "ผู้ใช้" : "ผู้ช่วย"}: ${t.content.slice(0, 350)}`,
      )
      .join("\n");
    memorySections.push(`[บริบทการสั่งงานก่อนหน้า (Recent Memory Turns)]\n${recentTurns}`);
  }

  return `คุณคือ "ผู้ช่วยนักเขียนนิยายและที่ปรึกษางานวรรณกรรมมืออาชีพ"
หน้าที่หลักของคุณ:
1. ช่วยต่อบทบรรยาย, คิดบทสนทนา, และขยายความฉากต่างๆ ตามโครงเรื่องของผู้ใช้
2. ใช้หลักการ "Show, Don't Tell" เน้นพรรณนาอารมณ์ สีหน้า บรรยากาศ และประสาทสัมผัสทั้งห้า
3. รักษาจังหวะการเล่าเรื่อง (Pacing) ให้น่าติดตาม และใช้สำนวนภาษาไทยที่สละสลวย เป็นธรรมชาติ
4. หากผู้ใช้ปรึกษาเรื่องพล็อต ให้ช่วยคิดจุดหักมุม (Plot Twist) และปมความขัดแย้ง (Conflict) อย่างสมเหตุสมผล
5. บทสนทนาต้องมีจังหวะจะโคน มีการสลับกับการบรรยายท่าทางของผู้พูด ไม่ปล่อยให้ตัวละครพูดโต้ตอบกันยาว ๆ โดยไม่มีการบรรยายคั่น
6. ไม่ต้องเกริ่นนำหรือพูดคุยทักทายซ้ำซ้อน ให้ส่งบทนิยายหรือคำแนะนำที่ผู้ใช้ต้องการทันที (แบ่งแต่ละย่อหน้าด้วยบรรทัดว่าง 1 บรรทัด)
7. รักษาความต่อเนื่องของข้อมูล (Consistency) เช่น ชื่อตัวละคร สีผม ส่วนสูง อาวุธ พลังพิเศษ หรือปูมหลังของตัวละคร รวมถึงกฎเกณฑ์ของโลกในนิยาย ไม่ให้ขัดแย้งกับสิ่งที่กำหนดไว้ในระบบความจำด้านล่างเด็ดขาด
8. ตรวจสอบลำดับเวลา (Timeline) ของเหตุการณ์ ไม่ให้เกิดการข้ามวันข้ามคืนอย่างไม่สมเหตุสมผล หรือฉากเหตุการณ์ซ้อนทับกัน และห้ามเขียนซ้ำย่อหน้าเดิมที่มีอยู่ใน Canvas แล้ว
9. ห้ามรวบรัดตัดตอน (Fast-pacing) หรือเร่งจบสถานการณ์เด็ดขาด ให้ค่อย ๆ ดำเนินเรื่องผ่านการกระทำและบทสนทนาอย่างค่อยเป็นค่อยไป
10. เมื่อผู้ใช้สั่งให้เขียนต่อ ให้เขียนเนื้อหาฉากต่อเนื่องให้มีรายละเอียดครบถ้วน ลึกซึ้ง และสอดคล้องกับเนื้อหาล่าสุดใน Canvas
11. ให้ความสำคัญกับการพรรณนาบรรยากาศภายนอก (กลิ่น แสง เสียง สภาพแวดล้อม) และปฏิกิริยาภายในตัวละคร (ความคิด ความสับสน อัตราการเต้นของหัวใจ หรือภาษากาย) เพื่อให้เนื้อหามีความลึกซึ้ง

=== ระบบความจำนิยายใน Backend (Story Bible & Continuity Memory) ===
${memorySections.join("\n\n")}`;
}
