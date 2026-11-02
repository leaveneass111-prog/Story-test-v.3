"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Menu,
  Plus,
  FileText,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  SendHorizontal,
  Sparkles,
  Trash2,
  ChevronDown,
  Square,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogAction,
  DialogCancel,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function GeminiNovelCanvas() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<
    "gemini-2.5-flash" | "gemini-2.5-pro"
  >("gemini-2.5-flash");
  const [chapterTitle, setChapterTitle] = useState(
    "บทนำ: เสียงกระซิบใต้เงาจันทรา",
  );
  const [charCount, setCharCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  // Dialog States
  const [isTrashDialogOpen, setIsTrashDialogOpen] = useState(false);
  const [isNewChapterDialogOpen, setIsNewChapterDialogOpen] = useState(false);

  // Error Alert State
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);

  const updateCounts = useCallback(() => {
    const text = editorRef.current?.innerText || "";
    setCharCount(text.length);
    const trimmed = text.trim();
    setWordCount(trimmed ? trimmed.split(/\s+/).length : 0);
  }, []);

  const insertRichContentToEditor = useCallback(
    (content: string) => {
      if (!editorRef.current) return;
      const formatted =
        content.includes("<p>") ||
        content.includes("<h") ||
        content.includes("<blockquote>")
          ? content
          : content
              .split(/\n\n+/)
              .map((para) => {
                const p = para.trim();
                if (p.startsWith("“") || p.startsWith('"')) {
                  return `<blockquote>${p}</blockquote>`;
                }
                return `<p>${p}</p>`;
              })
              .join("");

      const wrapper = document.createElement("div");
      wrapper.innerHTML = formatted;
      while (wrapper.firstChild) {
        editorRef.current.appendChild(wrapper.firstChild);
      }
      editorRef.current.scrollTop = editorRef.current.scrollHeight;
      updateCounts();
    },
    [updateCounts],
  );

  const {
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    error,
  } = useChat({
    api: "/api/chat",
    body: { model: selectedModel },
    onFinish: (message) => {
      if (message.content) {
        insertRichContentToEditor(message.content);
      }
    },
  });

  const displayError =
    error?.message && error.message !== dismissedError ? error.message : null;

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = `<h1>บทนำ: เสียงกระซิบใต้เงาจันทรา</h1><p>สายลมหนาวพัดกรูผ่านช่องหน้าต่างบานเก่า กลิ่นอายของกำยานและหมึกแห้งลอยอบอวลไปทั่วห้องหนังสือโบราณ...</p>`;
      updateCounts();
    }
  }, [updateCounts]);

  const execCmd = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateCounts();
  };

  const handleStartNewChapter = () => {
    setChapterTitle("ตอนใหม่");
    if (editorRef.current) {
      editorRef.current.innerHTML =
        "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>";
      updateCounts();
    }
    setIsNewChapterDialogOpen(false);
    setMobileSidebarOpen(false);
  };

  const handleClearCanvas = () => {
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
      updateCounts();
    }
    setIsTrashDialogOpen(false);
  };

  const handlePromptPlusClick = () => {
    if (!input.trim()) {
      setInput(
        "ช่วยเขียนบรรยายเหตุการณ์ในตอนนี้ต่อ โดยเน้นสร้างบรรยากาศลึกลับและมีบทสนทนาที่น่าติดตาม: ",
      );
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh w-full bg-[#131314] text-[#e3e3e3] overflow-hidden font-sans">
        {/* Mobile Sidebar Overlay Drawer */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex flex-col justify-between bg-[#1e1f20] p-3 w-67 shadow-2xl transition-transform duration-300 md:hidden overflow-hidden ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#c4c7c5] px-2">
                Novel Crafter
              </span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-[#333537] text-[#c4c7c5]"
                aria-label="ปิดเมนู"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (editorRef.current?.innerText.trim()) {
                  setIsNewChapterDialogOpen(true);
                } else {
                  handleStartNewChapter();
                }
              }}
              className="inline-flex items-center gap-3 h-11 px-4 rounded-full bg-[#282a2c] hover:bg-[#333537] text-sm font-medium text-[#c4c7c5] w-full"
            >
              <Plus className="h-5 w-5 shrink-0" />
              <span>หน้ากระดาษใหม่</span>
            </button>

            <div className="flex flex-col gap-1">
              <span className="px-3 py-1.5 text-xs font-medium text-[#c4c7c5]">
                ล่าสุด
              </span>
              <div className="flex items-center gap-3 px-3 py-2 rounded-full bg-[#004a77]/40 text-[#c2e7ff] text-sm font-medium truncate">
                <FileText className="h-4 w-4 shrink-0 text-[#a8c7fa]" />
                <span className="truncate">{chapterTitle}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Desktop Gemini Left Sidebar */}
        <aside
          className={`hidden md:flex flex-col justify-between bg-[#1e1f20] py-3 px-3 transition-all duration-300 shrink-0 overflow-hidden ${
            sidebarOpen ? "w-67" : "w-17"
          }`}
        >
          <div className="flex flex-col gap-5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-[#333537] text-[#c4c7c5] transition-colors"
                  aria-label={sidebarOpen ? "พับแถบข้าง" : "ขยายแถบข้าง"}
                >
                  <Menu className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {sidebarOpen ? "พับแถบข้าง" : "ขยายแถบข้าง"}
              </TooltipContent>
            </Tooltip>

            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => {
                  if (editorRef.current?.innerText.trim()) {
                    setIsNewChapterDialogOpen(true);
                  } else {
                    handleStartNewChapter();
                  }
                }}
                className="inline-flex items-center gap-3 h-11 px-4 rounded-full bg-[#282a2c] hover:bg-[#333537] text-sm font-medium text-[#c4c7c5] w-fit transition-colors"
              >
                <Plus className="h-5 w-5 shrink-0" />
                <span>หน้ากระดาษใหม่</span>
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (editorRef.current?.innerText.trim()) {
                        setIsNewChapterDialogOpen(true);
                      } else {
                        handleStartNewChapter();
                      }
                    }}
                    className="h-10 w-10 p-0 inline-flex items-center justify-center rounded-full bg-[#282a2c] hover:bg-[#333537] text-[#c4c7c5] transition-colors"
                    aria-label="หน้ากระดาษใหม่"
                  >
                    <Plus className="h-5 w-5 shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">หน้ากระดาษใหม่</TooltipContent>
              </Tooltip>
            )}

            {sidebarOpen && (
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="px-3 py-1.5 text-xs font-medium text-[#c4c7c5]">
                  ล่าสุด
                </span>
                <div className="flex items-center gap-3 px-3 py-2 rounded-full bg-[#004a77]/40 text-[#c2e7ff] text-sm font-medium truncate">
                  <FileText className="h-4 w-4 shrink-0 text-[#a8c7fa]" />
                  <span className="truncate">{chapterTitle}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Gemini Canvas Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          {/* Top Bar */}
          <header className="h-14 shrink-0 flex items-center justify-between px-3 sm:px-6 border-b border-[#282a2c]/60">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-[#1e1f20] text-[#c4c7c5] transition-colors"
                aria-label="เปิดเมนู"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Gemini Model Selector Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#1e1f20] cursor-pointer transition-colors text-left outline-none"
                    aria-label="เลือกโมเดล Gemini"
                  >
                    <span className="text-base sm:text-lg font-medium text-[#c4c7c5]">
                      Gemini
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-[#1e1f20] text-[#a8c7fa] border-0 text-xs px-2 py-0.5"
                    >
                      {selectedModel === "gemini-2.5-flash"
                        ? "2.5 Flash"
                        : "2.5 Pro"}
                    </Badge>
                    <ChevronDown className="h-4 w-4 text-[#c4c7c5]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="bg-[#1e1f20] border-[#3c4043] text-[#e3e3e3] w-56"
                >
                  <DropdownMenuLabel>โมเดลปัญญาประดิษฐ์</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#3c4043]" />
                  <DropdownMenuItem
                    onClick={() => setSelectedModel("gemini-2.5-flash")}
                    className="flex items-center justify-between cursor-pointer focus:bg-[#282a2c] focus:text-[#e3e3e3]"
                  >
                    <div>
                      <div className="font-medium">Gemini 2.5 Flash</div>
                      <div className="text-xs text-[#8e918f]">
                        ตอบสนองรวดเร็ว เหมาะกับงานเขียนลื่นไหล
                      </div>
                    </div>
                    {selectedModel === "gemini-2.5-flash" && (
                      <span className="size-2 rounded-full bg-[#a8c7fa]" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSelectedModel("gemini-2.5-pro")}
                    className="flex items-center justify-between cursor-pointer focus:bg-[#282a2c] focus:text-[#e3e3e3]"
                  >
                    <div>
                      <div className="font-medium">Gemini 2.5 Pro</div>
                      <div className="text-xs text-[#8e918f]">
                        วิเคราะห์ลึกซึ้ง เหมาะกับพล็อตซับซ้อน
                      </div>
                    </div>
                    {selectedModel === "gemini-2.5-pro" && (
                      <span className="size-2 rounded-full bg-[#a8c7fa]" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#c4c7c5]">
              <div className="px-3 py-1.5 rounded-full bg-[#1e1f20] whitespace-nowrap">
                <span className="hidden sm:inline">
                  {charCount.toLocaleString()} ตัวอักษร •{" "}
                </span>
                {wordCount.toLocaleString()} คำ
              </div>
            </div>
          </header>

          {/* Center Canvas + Bottom Prompt Pill */}
          <main className="flex-1 flex flex-col overflow-hidden px-2 sm:px-6 md:px-10 pb-2 max-w-5xl w-full mx-auto min-h-0">
            {/* Error Notification Banner */}
            {displayError && (
              <div className="my-2 p-3 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-sm flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{displayError}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setDismissedError(displayError)}
                  className="text-xs hover:bg-destructive/20 text-destructive h-6 px-2"
                >
                  ปิด
                </Button>
              </div>
            )}

            <div className="flex-1 flex flex-col rounded-[24px] border border-[#3c4043] bg-[#1e1f20] overflow-hidden min-h-0 shadow-xl">
              {/* Canvas Header (DOM CONTRACT: main div.border-b input) */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#3c4043]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Sparkles className="h-5 w-5 text-[#a8c7fa] shrink-0" />
                  <input
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="ชื่อตอน..."
                    className="w-full bg-transparent text-base sm:text-lg font-medium text-[#e3e3e3] outline-none truncate"
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setIsTrashDialogOpen(true)}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-[#333537] text-[#c4c7c5] hover:text-[#f28b82] transition-colors shrink-0 ml-2"
                      aria-label="ล้างกระดาษ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ล้างเนื้อหาในกระดาษ</TooltipContent>
                </Tooltip>
              </div>

              {/* Formatting Toolbar (Horizontal scroll on mobile, preventDefault to retain selection) */}
              <div className="flex items-center gap-1 px-3 sm:px-4 py-2 border-b border-[#3c4043] overflow-x-auto no-scrollbar shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("formatBlock", "<h1>")}
                      className="px-2.5 py-1 rounded-full hover:bg-[#333537] text-xs font-semibold text-[#c4c7c5] shrink-0 transition-colors"
                    >
                      H1
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>หัวข้อ 1</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("formatBlock", "<h2>")}
                      className="px-2.5 py-1 rounded-full hover:bg-[#333537] text-xs font-semibold text-[#c4c7c5] shrink-0 transition-colors"
                    >
                      H2
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>หัวข้อ 2</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("bold")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="ตัวหนา"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ตัวหนา</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("italic")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="ตัวเอียง"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ตัวเอียง</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("underline")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="ขีดเส้นใต้"
                    >
                      <Underline className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ขีดเส้นใต้</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("strikeThrough")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="ขีดฆ่า"
                    >
                      <Strikethrough className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ขีดฆ่า</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("insertUnorderedList")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="รายการแบบสัญลักษณ์"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>รายการแบบจุด</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("insertOrderedList")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="รายการแบบตัวเลข"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>รายการลำดับเลข</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("formatBlock", "<blockquote>")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="บล็อกคำพูด"
                    >
                      <Quote className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>บล็อกคำพูด / บทสนทนา</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => execCmd("removeFormat")}
                      className="p-2 rounded-full hover:bg-[#333537] text-[#c4c7c5] shrink-0 transition-colors"
                      aria-label="ล้างการจัดรูปแบบ"
                    >
                      <RemoveFormatting className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>ล้างการจัดรูปแบบ</TooltipContent>
                </Tooltip>
              </div>

              {/* Editable Surface (DOM CONTRACT: [contenteditable]) */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={updateCounts}
                className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 text-sm sm:text-base leading-relaxed text-[#e3e3e3] outline-none max-w-3xl mx-auto w-full space-y-3"
              />
            </div>

            {/* Authentic Gemini Bottom Prompt Pill */}
            <form
              onSubmit={handleSubmit}
              className="mt-3 mb-1 max-w-4xl w-full mx-auto"
            >
              <div className="flex items-center gap-2 rounded-[32px] bg-[#1e1f20] focus-within:bg-[#282a2c] px-3 sm:px-4 py-2 sm:py-2.5 shadow-lg border border-[#3c4043]/50">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handlePromptPlusClick}
                      className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full bg-[#282a2c] hover:bg-[#333537] text-[#c4c7c5] hover:text-[#e3e3e3] transition-colors cursor-pointer"
                      aria-label="แทรกตัวช่วยคำสั่งเขียนนิยาย"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    แทรกตัวช่วยสร้างคำสั่งเขียนนิยาย
                  </TooltipContent>
                </Tooltip>

                <input
                  value={input}
                  onChange={handleInputChange}
                  placeholder="ถาม Gemini หรือสั่งให้เขียนนิยายต่อลงใน Canvas..."
                  className="flex-1 bg-transparent text-sm sm:text-base text-[#e3e3e3] placeholder-[#8e918f] outline-none px-2 min-w-0"
                />

                {isLoading ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => stop()}
                        className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full bg-[#f28b82] hover:bg-[#ea4335] text-[#601410] transition-colors cursor-pointer"
                        aria-label="หยุดสร้างเนื้อหา"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>หยุดการสร้างเนื้อหา</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="submit"
                        disabled={!input.trim()}
                        className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full bg-[#a8c7fa] text-[#062e6f] hover:bg-[#a8c7fa]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="ส่งคำสั่ง"
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>ส่งคำสั่ง (Enter)</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </form>
          </main>
        </div>

        {/* Confirmation Dialog: Clear Canvas (Trash) */}
        <Dialog open={isTrashDialogOpen} onOpenChange={setIsTrashDialogOpen}>
          <DialogContent className="bg-[#1e1f20] border-[#3c4043] text-[#e3e3e3]">
            <DialogHeader>
              <DialogTitle className="text-[#f1f3f4]">
                ยืนยันการล้างกระดาษ
              </DialogTitle>
              <DialogDescription className="text-[#c4c7c5]">
                คุณแน่ใจหรือไม่ว่าต้องการล้างเนื้อหาทั้งหมดในหน้านี้?
                ข้อมูลที่เขียนไว้จะหายไปและไม่สามารถย้อนกลับได้
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogCancel className="border-[#3c4043] text-[#c4c7c5] hover:bg-[#282a2c]">
                ยกเลิก
              </DialogCancel>
              <DialogAction
                variant="destructive"
                onClick={handleClearCanvas}
                className="bg-[#d93025] hover:bg-[#c5221f] text-white"
              >
                ล้างเนื้อหา
              </DialogAction>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog: New Chapter */}
        <Dialog
          open={isNewChapterDialogOpen}
          onOpenChange={setIsNewChapterDialogOpen}
        >
          <DialogContent className="bg-[#1e1f20] border-[#3c4043] text-[#e3e3e3]">
            <DialogHeader>
              <DialogTitle className="text-[#f1f3f4]">
                สร้างหน้ากระดาษใหม่
              </DialogTitle>
              <DialogDescription className="text-[#c4c7c5]">
                ต้องการเริ่มเขียนตอนใหม่หรือไม่?
                เนื้อหาปัจจุบันในกระดาษจะถูกบันทึกและแทนที่ด้วยโครงสร้างตอนใหม่
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogCancel className="border-[#3c4043] text-[#c4c7c5] hover:bg-[#282a2c]">
                ยกเลิก
              </DialogCancel>
              <DialogAction
                onClick={handleStartNewChapter}
                className="bg-[#0b57d0] hover:bg-[#0842a0] text-white"
              >
                สร้างตอนใหม่
              </DialogAction>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
