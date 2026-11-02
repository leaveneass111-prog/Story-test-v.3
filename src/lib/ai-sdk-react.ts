"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: Array<{ type: "text"; text: string }>;
};

export type UseChatOptions = {
  api?: string;
  id?: string;
  initialInput?: string;
  initialMessages?: ChatMessage[];
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  onFinish?: (message: ChatMessage) => void | Promise<void>;
  onError?: (error: Error) => void;
};

export type UseChatHelpers = {
  id: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleInputChange: (
    event:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (
    event?: { preventDefault?: () => void },
    options?: { body?: Record<string, unknown> },
  ) => Promise<void>;
  append: (message: Omit<ChatMessage, "id"> & { id?: string }) => Promise<string | null | undefined>;
  isLoading: boolean;
  status: "ready" | "submitted" | "streaming" | "error";
  stop: () => void;
  error: Error | undefined;
};

function readCanvasSnapshotFromDom(): {
  chapterTitle: string;
  canvasHtml: string;
  canvasText: string;
} {
  if (typeof document === "undefined") {
    return { chapterTitle: "", canvasHtml: "", canvasText: "" };
  }

  const titleInput = document.querySelector(
    "main div.border-b input",
  ) as HTMLInputElement | null;
  const editorEl = document.querySelector(
    "[contenteditable]",
  ) as HTMLElement | null;

  return {
    chapterTitle: titleInput?.value?.trim() || "",
    canvasHtml: editorEl?.innerHTML || "",
    canvasText: editorEl?.innerText || "",
  };
}

function parseSseLineToDelta(line: string): { matched: boolean; delta: string } {
  const trimmed = line.trim();
  if (!trimmed) {
    return { matched: true, delta: "" };
  }

  if (trimmed.startsWith("data:")) {
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      return { matched: true, delta: "" };
    }
    try {
      const parsed = JSON.parse(payload) as {
        type?: string;
        delta?: string;
        textDelta?: string;
        text?: string;
      };
      if (parsed.type === "text-delta" && typeof parsed.delta === "string") {
        return { matched: true, delta: parsed.delta };
      }
      if (typeof parsed.textDelta === "string") {
        return { matched: true, delta: parsed.textDelta };
      }
      if (parsed.type === "text" && typeof parsed.text === "string") {
        return { matched: true, delta: parsed.text };
      }
      return { matched: true, delta: "" };
    } catch {
      return { matched: false, delta: "" };
    }
  }

  // Legacy AI SDK data stream format: 0:"text chunk"
  if (/^\d+:/.test(trimmed)) {
    const prefixEnd = trimmed.indexOf(":");
    const code = trimmed.slice(0, prefixEnd);
    const rawValue = trimmed.slice(prefixEnd + 1);
    if (code === "0") {
      try {
        const decoded = JSON.parse(rawValue);
        if (typeof decoded === "string") {
          return { matched: true, delta: decoded };
        }
      } catch {
        // Ignore malformed frame
      }
    }
    return { matched: true, delta: "" };
  }

  return { matched: false, delta: "" };
}

function setReactInputValue(inputEl: HTMLInputElement, nextValue: string): void {
  const prevValue = inputEl.value;
  if (prevValue === nextValue) return;
  const tracker = (
    inputEl as HTMLInputElement & {
      _valueTracker?: { setValue: (v: string) => void };
    }
  )._valueTracker;
  tracker?.setValue(prevValue);
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(inputEl, nextValue);
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
}

export function useChat(options: UseChatOptions = {}): UseChatHelpers {
  const api = options.api || "/api/chat";
  const [messages, setMessages] = useState<ChatMessage[]>(
    options.initialMessages ?? [],
  );
  const [input, setInput] = useState<string>(options.initialInput ?? "");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<
    "ready" | "submitted" | "streaming" | "error"
  >("ready");
  const [error, setError] = useState<Error | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);
  const optionsRef = useRef<UseChatOptions>(options);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const isHydratedRef = useRef<boolean>(false);
  const isApplyingRemoteRef = useRef<boolean>(false);
  const lastSyncedSignatureRef = useRef<string>("");
  const observerRef = useRef<MutationObserver | null>(null);
  const lastObservedHtmlRef = useRef<string>("");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const syncDomToBackend = useCallback(async () => {
    if (!isHydratedRef.current || isApplyingRemoteRef.current) return;
    try {
      const snapshot = readCanvasSnapshotFromDom();
      if (!snapshot.chapterTitle && !snapshot.canvasText && !snapshot.canvasHtml) {
        return;
      }
      const signature = `${snapshot.chapterTitle}::${snapshot.canvasHtml}`;
      if (signature === lastSyncedSignatureRef.current) {
        return;
      }
      lastSyncedSignatureRef.current = signature;

      await fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // Non-blocking background sync
    }
  }, [api]);

  // Hydrate Canvas editor, chapter title, and chat history from Backend on mount
  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;

    const hydrateFromBackend = async () => {
      try {
        const res = await fetch(api, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok || cancelled) {
          isHydratedRef.current = true;
          return;
        }

        const data = (await res.json()) as {
          activeChapterTitle?: string;
          activeChapter?: {
            title?: string;
            contentHtml?: string;
            contentText?: string;
          } | null;
          chatHistory?: Array<{
            id?: string;
            role?: "user" | "assistant";
            content?: string;
          }>;
        };
        if (cancelled) return;

        if (
          Array.isArray(data.chatHistory) &&
          data.chatHistory.length > 0 &&
          messagesRef.current.length === 0
        ) {
          const restored: ChatMessage[] = data.chatHistory
            .filter((t) => Boolean(t?.content))
            .map((t, idx) => {
              const text = t.content ?? "";
              return {
                id: t.id || `restored_${idx}`,
                role: t.role === "assistant" ? "assistant" : "user",
                content: text,
                parts: [{ type: "text", text }],
              };
            });
          setMessages(restored);
          messagesRef.current = restored;
        }

        if (data.activeChapter) {
          const titleInput = document.querySelector(
            "main div.border-b input",
          ) as HTMLInputElement | null;
          const editorEl = document.querySelector(
            "[contenteditable]",
          ) as HTMLElement | null;

          isApplyingRemoteRef.current = true;
          try {
            const targetTitle =
              data.activeChapter.title?.trim() ||
              data.activeChapterTitle?.trim() ||
              "";
            if (titleInput && targetTitle && titleInput.value !== targetTitle) {
              setReactInputValue(titleInput, targetTitle);
            }

            if (
              editorEl &&
              typeof data.activeChapter.contentHtml === "string"
            ) {
              if (editorEl.innerHTML !== data.activeChapter.contentHtml) {
                editorEl.innerHTML = data.activeChapter.contentHtml;
              }
              lastObservedHtmlRef.current = editorEl.innerHTML.trim();
              editorEl.dispatchEvent(new Event("input", { bubbles: true }));
            }

            observerRef.current?.takeRecords();
            const snap = readCanvasSnapshotFromDom();
            lastSyncedSignatureRef.current = `${snap.chapterTitle}::${snap.canvasHtml}`;
          } finally {
            queueMicrotask(() => {
              isApplyingRemoteRef.current = false;
            });
          }
        }
      } catch {
        // Ignore hydration errors and fall back to current DOM
      } finally {
        if (!cancelled) {
          queueMicrotask(() => {
            isHydratedRef.current = true;
          });
        }
      }
    };

    void hydrateFromBackend();

    return () => {
      cancelled = true;
    };
  }, [api]);

  // Attach debounced auto-save listeners & MutationObserver to the Canvas editor & title input
  useEffect(() => {
    if (typeof document === "undefined") return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleSync = () => {
      if (!isHydratedRef.current || isApplyingRemoteRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void syncDomToBackend();
      }, 650);
    };

    const editorEl = document.querySelector(
      "[contenteditable]",
    ) as HTMLElement | null;
    const titleInput = document.querySelector(
      "main div.border-b input",
    ) as HTMLInputElement | null;

    if (editorEl) {
      lastObservedHtmlRef.current = editorEl.innerHTML.trim();
    }

    editorEl?.addEventListener("input", scheduleSync);
    titleInput?.addEventListener("input", scheduleSync);

    let observer: MutationObserver | null = null;
    if (editorEl && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        if (isApplyingRemoteRef.current) return;
        const currentHtml = editorEl.innerHTML.trim();
        const prevHtml = lastObservedHtmlRef.current;
        lastObservedHtmlRef.current = currentHtml;

        // Detect "หน้ากระดาษใหม่" click which transitions editor HTML to <h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>
        if (
          currentHtml === "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>" &&
          currentHtml !== prevHtml &&
          titleInput &&
          titleInput.value !== "ตอนใหม่"
        ) {
          isApplyingRemoteRef.current = true;
          try {
            setReactInputValue(titleInput, "ตอนใหม่");
          } finally {
            queueMicrotask(() => {
              isApplyingRemoteRef.current = false;
            });
          }
        }
        scheduleSync();
      });
      observer.observe(editorEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      observerRef.current = observer;
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observer?.disconnect();
      observerRef.current = null;
      editorEl?.removeEventListener("input", scheduleSync);
      titleInput?.removeEventListener("input", scheduleSync);
    };
  }, [syncDomToBackend]);

  const stop = useCallback(() => {
    try {
      abortControllerRef.current?.abort();
    } catch {
      // Ignore abort errors
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      setStatus("ready");
    }
  }, []);

  const handleInputChange = useCallback(
    (
      event:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
      setInput(event.target.value);
    },
    [],
  );

  const sendUserPrompt = useCallback(
    async (
      promptText: string,
      extraBody?: Record<string, unknown>,
    ): Promise<string | null | undefined> => {
      const trimmed = promptText.trim();
      if (!trimmed) return null;

      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: trimmed,
        parts: [{ type: "text", text: trimmed }],
      };

      const nextMessages = [...messagesRef.current, userMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setIsLoading(true);
      setStatus("submitted");
      setError(undefined);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const domSnapshot = readCanvasSnapshotFromDom();
      let accumulatedText = "";

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(optionsRef.current.headers ?? {}),
          },
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            chapterTitle: domSnapshot.chapterTitle,
            canvasHtml: domSnapshot.canvasHtml,
            canvasText: domSnapshot.canvasText,
            ...(optionsRef.current.body ?? {}),
            ...(extraBody ?? {}),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          throw new Error(
            errText || `Chat request failed with status ${response.status}`,
          );
        }

        setStatus("streaming");

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const parsed = parseSseLineToDelta(line);
              if (parsed.matched) {
                accumulatedText += parsed.delta;
              } else {
                accumulatedText += `${line}\n`;
              }
            }
          }

          buffer += decoder.decode();
          if (buffer.trim()) {
            const parsed = parseSseLineToDelta(buffer);
            if (parsed.matched) {
              accumulatedText += parsed.delta;
            } else {
              accumulatedText += buffer;
            }
          }
        } else {
          const rawText = await response.text();
          for (const line of rawText.split("\n")) {
            const parsed = parseSseLineToDelta(line);
            if (parsed.matched) {
              accumulatedText += parsed.delta;
            } else {
              accumulatedText += `${line}\n`;
            }
          }
        }

        const finalContent = accumulatedText.trim();
        const assistantMessage: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: finalContent,
          parts: [{ type: "text", text: finalContent }],
        };

        setMessages((prev) => {
          const updated = [...prev, assistantMessage];
          messagesRef.current = updated;
          return updated;
        });
        setIsLoading(false);
        setStatus("ready");
        abortControllerRef.current = null;

        if (finalContent && optionsRef.current.onFinish) {
          await optionsRef.current.onFinish(assistantMessage);
        }

        setTimeout(() => {
          void syncDomToBackend();
        }, 80);

        return finalContent;
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          const partialContent = accumulatedText.trim();
          if (partialContent && optionsRef.current.onFinish) {
            const partialMsg: ChatMessage = {
              id: `assistant_${Date.now()}`,
              role: "assistant",
              content: partialContent,
              parts: [{ type: "text", text: partialContent }],
            };
            setMessages((prev) => {
              const updated = [...prev, partialMsg];
              messagesRef.current = updated;
              return updated;
            });
            await optionsRef.current.onFinish(partialMsg);
            setTimeout(() => {
              void syncDomToBackend();
            }, 80);
          }
          setIsLoading(false);
          setStatus("ready");
          return partialContent;
        }

        const normalizedError =
          err instanceof Error ? err : new Error(String(err));
        setError(normalizedError);
        setIsLoading(false);
        setStatus("error");
        abortControllerRef.current = null;
        optionsRef.current.onError?.(normalizedError);
        return null;
      }
    },
    [api, syncDomToBackend],
  );

  const handleSubmit = useCallback(
    async (
      event?: { preventDefault?: () => void },
      submitOptions?: { body?: Record<string, unknown> },
    ) => {
      event?.preventDefault?.();
      const currentInput = input.trim();
      if (!currentInput || isLoading) return;
      setInput("");
      await sendUserPrompt(currentInput, submitOptions?.body);
    },
    [input, isLoading, sendUserPrompt],
  );

  const append = useCallback(
    async (message: Omit<ChatMessage, "id"> & { id?: string }) => {
      return sendUserPrompt(message.content);
    },
    [sendUserPrompt],
  );

  return {
    id: options.id ?? "novel-crafter-chat",
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    status,
    stop,
    error,
  };
}
