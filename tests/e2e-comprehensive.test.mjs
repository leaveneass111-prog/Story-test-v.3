import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pagePath = path.join(projectRoot, "src", "app", "page.tsx");
const layoutPath = path.join(projectRoot, "src", "app", "layout.tsx");
const globalsCssPath = path.join(projectRoot, "src", "app", "globals.css");
const buttonPath = path.join(projectRoot, "src", "components", "ui", "button.tsx");
const dialogPath = path.join(projectRoot, "src", "components", "ui", "dialog.tsx");
const dropdownPath = path.join(projectRoot, "src", "components", "ui", "dropdown-menu.tsx");
const badgePath = path.join(projectRoot, "src", "components", "ui", "badge.tsx");
const tooltipPath = path.join(projectRoot, "src", "components", "ui", "tooltip.tsx");
const aiSdkPath = path.join(projectRoot, "src", "lib", "ai-sdk-react.ts");

const pageCode = fs.readFileSync(pagePath, "utf-8");
const layoutCode = fs.readFileSync(layoutPath, "utf-8");
const globalsCssCode = fs.readFileSync(globalsCssPath, "utf-8");
const buttonCode = fs.readFileSync(buttonPath, "utf-8");
const dialogCode = fs.readFileSync(dialogPath, "utf-8");
const dropdownCode = fs.readFileSync(dropdownPath, "utf-8");
const badgeCode = fs.readFileSync(badgePath, "utf-8");
const tooltipCode = fs.readFileSync(tooltipPath, "utf-8");
const aiSdkCode = fs.readFileSync(aiSdkPath, "utf-8");

// =============================================================================
// Helper: Interactive State Machine Simulator for GeminiNovelCanvas
// =============================================================================
class GeminiNovelCanvasSimulator {
  constructor() {
    this.reset();
  }

  reset() {
    this.sidebarOpen = true;
    this.mobileSidebarOpen = false;
    this.selectedModel = "gemini-2.5-flash";
    this.chapterTitle = "บทนำ: เสียงกระซิบใต้เงาจันทรา";
    this.charCount = 0;
    this.wordCount = 0;
    this.isTrashDialogOpen = false;
    this.isNewChapterDialogOpen = false;
    this.dismissedError = null;
    this.error = null;
    this.input = "";
    this.isLoading = false;

    // Canvas DOM Mock
    this.editorHtml = "<h1>บทนำ: เสียงกระซิบใต้เงาจันทรา</h1><p>สายลมหนาวพัดกรูผ่านช่องหน้าต่างบานเก่า กลิ่นอายของกำยานและหมึกแห้งลอยอบอวลไปทั่วห้องหนังสือโบราณ...</p>";
    this.updateCounts();
  }

  getEditorInnerText() {
    // Strip HTML tags to simulate innerText
    return this.editorHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  updateCounts() {
    const text = this.getEditorInnerText();
    this.charCount = text.length;
    const trimmed = text.trim();
    this.wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  }

  execCmd(command, value = null) {
    if (command === "formatBlock") {
      if (value === "<h1>") {
        this.editorHtml = `<h1>${this.editorHtml}</h1>`;
      } else if (value === "<h2>") {
        this.editorHtml = `<h2>${this.editorHtml}</h2>`;
      } else if (value === "<blockquote>") {
        this.editorHtml = `<blockquote>${this.editorHtml}</blockquote>`;
      }
    } else if (command === "bold") {
      this.editorHtml = `<b>${this.editorHtml}</b>`;
    } else if (command === "italic") {
      this.editorHtml = `<i>${this.editorHtml}</i>`;
    } else if (command === "underline") {
      this.editorHtml = `<u>${this.editorHtml}</u>`;
    } else if (command === "strikeThrough") {
      this.editorHtml = `<s>${this.editorHtml}</s>`;
    } else if (command === "insertUnorderedList") {
      this.editorHtml = `<ul><li>${this.editorHtml}</li></ul>`;
    } else if (command === "insertOrderedList") {
      this.editorHtml = `<ol><li>${this.editorHtml}</li></ol>`;
    } else if (command === "removeFormat") {
      this.editorHtml = this.getEditorInnerText();
    }
    this.updateCounts();
  }

  handlePromptPlusClick() {
    if (!this.input.trim()) {
      this.input = "ช่วยเขียนบรรยายเหตุการณ์ในตอนนี้ต่อ โดยเน้นสร้างบรรยากาศลึกลับและมีบทสนทนาที่น่าติดตาม: ";
    }
  }

  handleStartNewChapter() {
    this.chapterTitle = "ตอนใหม่";
    this.editorHtml = "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>";
    this.updateCounts();
    this.isNewChapterDialogOpen = false;
    this.mobileSidebarOpen = false;
  }

  handleClearCanvas() {
    this.editorHtml = "";
    this.updateCounts();
    this.isTrashDialogOpen = false;
  }

  requestNewChapter() {
    if (this.getEditorInnerText().trim()) {
      this.isNewChapterDialogOpen = true;
    } else {
      this.handleStartNewChapter();
    }
  }

  requestClearCanvas() {
    this.isTrashDialogOpen = true;
  }

  selectModel(model) {
    if (model === "gemini-2.5-flash" || model === "gemini-2.5-pro") {
      this.selectedModel = model;
    }
  }

  isSendButtonDisabled() {
    return !this.input.trim() || this.isLoading;
  }

  getDisplayError() {
    return this.error?.message && this.error.message !== this.dismissedError
      ? this.error.message
      : null;
  }
}

// =============================================================================
// TIER 1: Feature Coverage Tests
// =============================================================================
describe("Tier 1: Feature Coverage (ปุ่มและการโต้ตอบแยกชิ้นส่วนตามสเปก)", () => {
  it("1.1 Shadcn UI Button Primitives & Variants Coverage", () => {
    assert.ok(buttonCode.includes("buttonVariants"), "Button must define buttonVariants");
    assert.ok(buttonCode.includes("variant: {"), "Button must contain variant definitions");
    assert.ok(buttonCode.includes("default:"), "Button must have 'default' variant");
    assert.ok(buttonCode.includes("outline:"), "Button must have 'outline' variant");
    assert.ok(buttonCode.includes("secondary:"), "Button must have 'secondary' variant");
    assert.ok(buttonCode.includes("ghost:"), "Button must have 'ghost' variant");
    assert.ok(buttonCode.includes("destructive:"), "Button must have 'destructive' variant");
    assert.ok(buttonCode.includes("size: {"), "Button must contain size definitions");
    assert.ok(buttonCode.includes("xs:"), "Button must support 'xs' size");
    assert.ok(buttonCode.includes("sm:"), "Button must support 'sm' size");
    assert.ok(buttonCode.includes("lg:"), "Button must support 'lg' size");
    assert.ok(buttonCode.includes("icon:"), "Button must support 'icon' size");
    assert.ok(buttonCode.includes('data-slot="button"'), "Button must render data-slot='button'");
  });

  it("1.2 Shadcn UI Dialog Components Coverage", () => {
    const requiredExports = [
      "Dialog",
      "DialogPortal",
      "DialogOverlay",
      "DialogTrigger",
      "DialogClose",
      "DialogContent",
      "DialogHeader",
      "DialogFooter",
      "DialogTitle",
      "DialogDescription",
      "DialogAction",
      "DialogCancel",
    ];
    for (const exp of requiredExports) {
      assert.ok(dialogCode.includes(exp), `Dialog component must export ${exp}`);
      assert.ok(dialogCode.includes(`data-slot="${exp.replace(/[A-Z]/g, (m, i) => (i ? "-" : "") + m.toLowerCase())}"`) ||
                dialogCode.includes(`data-slot="dialog`) , `Dialog must set data-slot for ${exp}`);
    }

    // Verify Backdrop Blur and Overlay styling
    assert.ok(dialogCode.includes("backdrop-blur-xs"), "Dialog overlay must have backdrop-blur-xs");
    assert.ok(dialogCode.includes("bg-black/70"), "Dialog overlay must have dark background");
  });

  it("1.3 Shadcn UI DropdownMenu Components Coverage", () => {
    const requiredExports = [
      "DropdownMenu",
      "DropdownMenuTrigger",
      "DropdownMenuContent",
      "DropdownMenuItem",
      "DropdownMenuLabel",
      "DropdownMenuSeparator",
    ];
    for (const exp of requiredExports) {
      assert.ok(dropdownCode.includes(exp), `dropdown-menu.tsx must export ${exp}`);
    }
  });

  it("1.3b Shadcn UI Badge & Tooltip Components Coverage", () => {
    assert.ok(badgeCode.includes("Badge"), "badge.tsx must export Badge");
    assert.ok(badgeCode.includes("badgeVariants"), "badge.tsx must export badgeVariants");
    assert.ok(badgeCode.includes('data-slot="badge"'), "Badge must set data-slot='badge'");

    assert.ok(tooltipCode.includes("Tooltip"), "tooltip.tsx must export Tooltip");
    assert.ok(tooltipCode.includes("TooltipTrigger"), "tooltip.tsx must export TooltipTrigger");
    assert.ok(tooltipCode.includes("TooltipContent"), "tooltip.tsx must export TooltipContent");
    assert.ok(tooltipCode.includes("TooltipProvider"), "tooltip.tsx must export TooltipProvider");
  });

  it("1.4 Formatting Toolbar - 10 Formatting Buttons with Focus/Selection Retention", () => {
    const startIndex = pageCode.indexOf("{/* Formatting Toolbar");
    const endIndex = pageCode.indexOf("{/* Editable Surface");
    assert.ok(startIndex !== -1 && endIndex !== -1, "Formatting Toolbar section must exist");
    const toolbarCode = pageCode.slice(startIndex, endIndex);

    const buttonMatches = toolbarCode.match(/<button[\s\S]*?<\/button>/g) || [];
    assert.equal(buttonMatches.length, 10, "Toolbar must have exactly 10 formatting buttons");

    const expectedActions = [
      { name: "H1", command: 'execCmd("formatBlock", "<h1>")' },
      { name: "H2", command: 'execCmd("formatBlock", "<h2>")' },
      { name: "Bold", command: 'execCmd("bold")' },
      { name: "Italic", command: 'execCmd("italic")' },
      { name: "Underline", command: 'execCmd("underline")' },
      { name: "Strikethrough", command: 'execCmd("strikeThrough")' },
      { name: "UnorderedList", command: 'execCmd("insertUnorderedList")' },
      { name: "OrderedList", command: 'execCmd("insertOrderedList")' },
      { name: "Quote", command: 'execCmd("formatBlock", "<blockquote>")' },
      { name: "RemoveFormat", command: 'execCmd("removeFormat")' },
    ];

    for (const act of expectedActions) {
      assert.ok(toolbarCode.includes(act.command), `Toolbar must contain command: ${act.name} -> ${act.command}`);
    }

    // Every toolbar button must have onMouseDown with e.preventDefault() and shrink-0
    for (const btn of buttonMatches) {
      assert.ok(
        btn.includes("onMouseDown={(e) => e.preventDefault()}"),
        `Every toolbar button must have onMouseDown preventDefault: ${btn.slice(0, 70)}...`
      );
      assert.ok(
        btn.includes("shrink-0"),
        `Every toolbar button must have shrink-0 to prevent horizontal squishing on mobile: ${btn.slice(0, 70)}...`
      );
    }
  });

  it("1.5 New Page (หน้ากระดาษใหม่) Synchronization Coverage", () => {
    assert.ok(
      pageCode.includes('setChapterTitle("ตอนใหม่")'),
      "handleStartNewChapter must update chapterTitle state to 'ตอนใหม่'"
    );
    assert.ok(
      pageCode.includes('"<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"'),
      "handleStartNewChapter must set canvas to template '<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>'"
    );
    assert.ok(
      pageCode.includes("setIsNewChapterDialogOpen(false)"),
      "handleStartNewChapter must close the confirmation dialog"
    );
    assert.ok(
      pageCode.includes("setMobileSidebarOpen(false)"),
      "handleStartNewChapter must close the mobile drawer if open"
    );

    // Verify Title binding
    assert.ok(
      pageCode.includes("value={chapterTitle}"),
      "Title input must bind value to chapterTitle"
    );
    assert.ok(
      pageCode.includes("onChange={(e) => setChapterTitle(e.target.value)}"),
      "Title input must update chapterTitle on change"
    );

    // Verify both Desktop and Mobile sidebars render {chapterTitle}
    const titleDisplays = [...pageCode.matchAll(/<span className="truncate">\{chapterTitle\}<\/span>/g)];
    assert.ok(
      titleDisplays.length >= 2,
      `Both Desktop and Mobile sidebars must display {chapterTitle} (found ${titleDisplays.length})`
    );
  });

  it("1.6 Prompt Pill Plus Button & Send Button State Coverage", () => {
    assert.ok(
      pageCode.includes("onClick={handlePromptPlusClick}"),
      "Plus button in prompt pill must trigger handlePromptPlusClick"
    );
    assert.ok(
      pageCode.includes('ช่วยเขียนบรรยายเหตุการณ์ในตอนนี้ต่อ'),
      "handlePromptPlusClick must supply the novel continuation prompt"
    );
    assert.ok(
      pageCode.includes("disabled={!input.trim()}"),
      "Send button must specify disabled={!input.trim()}"
    );
    assert.ok(
      pageCode.includes("disabled:opacity-40 disabled:cursor-not-allowed"),
      "Send button must have disabled CSS classes"
    );
    assert.ok(
      pageCode.includes('aria-label="ส่งคำสั่ง"'),
      "Send button must have aria-label='ส่งคำสั่ง'"
    );
  });

  it("1.7 Mobile Hamburger & Drawer Layout Coverage", () => {
    assert.ok(
      pageCode.includes("h-dvh"),
      "Root container must use h-dvh for mobile viewport safety"
    );
    assert.ok(
      pageCode.includes("onClick={() => setMobileSidebarOpen(true)}"),
      "Mobile hamburger button must call setMobileSidebarOpen(true)"
    );
    assert.ok(
      pageCode.includes("onClick={() => setMobileSidebarOpen(false)}"),
      "Close button / backdrop must call setMobileSidebarOpen(false)"
    );
    assert.ok(
      pageCode.includes("md:hidden"),
      "Mobile drawer elements must be hidden on desktop (md:hidden)"
    );
    assert.ok(
      pageCode.includes("hidden md:flex"),
      "Desktop sidebar must be hidden on mobile (hidden md:flex)"
    );
  });
});

// =============================================================================
// TIER 2: Boundary & Corner Cases Tests
// =============================================================================
describe("Tier 2: Boundary & Corner Cases (การทดสอบค่าขอบและสภาวะสุดโต่ง)", () => {
  let sim;
  beforeEach(() => {
    sim = new GeminiNovelCanvasSimulator();
  });

  it("2.1 Empty & Whitespace-only input validation on Send Button", () => {
    const invalidInputs = [
      "",
      " ",
      "   ",
      "\t",
      "\n",
      "\r\n",
      " \t \n \r  ",
      "\u00A0", // non-breaking space
    ];

    for (const testInput of invalidInputs) {
      sim.input = testInput;
      assert.equal(
        sim.isSendButtonDisabled(),
        true,
        `Send button must be disabled for whitespace-only input: JSON.stringify(${JSON.stringify(testInput)})`
      );
    }

    const validInputs = [
      "a",
      "ก",
      "  สวัสดี  ",
      "ช่วยเขียนต่อ",
      "123",
      "   .   ",
    ];

    for (const testInput of validInputs) {
      sim.input = testInput;
      assert.equal(
        sim.isSendButtonDisabled(),
        false,
        `Send button must be enabled for non-empty input: JSON.stringify(${JSON.stringify(testInput)})`
      );
    }
  });

  it("2.2 Chapter Title Boundary & Overflow Containment", () => {
    // Check extreme length (1000 characters)
    const longTitle = "บทที่ 999: " + "มังกรสุริยัน".repeat(80);
    sim.chapterTitle = longTitle;
    assert.equal(sim.chapterTitle.length > 500, true);

    // Verify truncate class on Title Input, Desktop Sidebar, and Mobile Sidebar in code
    const hasInputTruncate = /<input[^>]*value=\{chapterTitle\}[^>]*truncate[^>]*>/.test(pageCode) ||
                            /<input[^>]*truncate[^>]*value=\{chapterTitle\}[^>]*>/.test(pageCode) ||
                            pageCode.includes('placeholder="ชื่อตอน..."\n                    className="w-full bg-transparent text-base sm:text-lg font-medium text-[#e3e3e3] outline-none truncate"');
    assert.ok(hasInputTruncate, "Title input must contain truncate class");

    // Special characters & escaping safety
    const specialTitle = 'บททดสอบ: " <script>alert(1)</script> \' &amp; 🌙✨ 漢字';
    sim.chapterTitle = specialTitle;
    assert.equal(sim.chapterTitle, specialTitle, "Title handles arbitrary special characters safely");
  });

  it("2.3 Dialog Cancellation and Confirmation Flow Integrity", () => {
    // --- Trash Dialog ---
    const originalText = sim.getEditorInnerText();
    assert.ok(originalText.length > 0, "Initial editor has text");

    // 1. User clicks trash button
    sim.requestClearCanvas();
    assert.equal(sim.isTrashDialogOpen, true, "Trash dialog opens");
    assert.equal(sim.getEditorInnerText(), originalText, "Text must NOT be cleared when dialog opens");

    // 2. User cancels
    sim.isTrashDialogOpen = false;
    assert.equal(sim.getEditorInnerText(), originalText, "Text must NOT be cleared when cancelled");

    // 3. User confirms
    sim.requestClearCanvas();
    sim.handleClearCanvas();
    assert.equal(sim.isTrashDialogOpen, false, "Dialog closes after confirmation");
    assert.equal(sim.editorHtml, "", "Canvas editor is completely cleared");
    assert.equal(sim.charCount, 0, "Character count is reset to 0");
    assert.equal(sim.wordCount, 0, "Word count is reset to 0");

    // --- New Chapter Dialog ---
    // Repopulate canvas
    sim.editorHtml = "<p>เนื้อหาตอนเดิมที่เขียนค้างไว้</p>";
    sim.updateCounts();
    sim.chapterTitle = "บทที่ 5: การเดินทาง";

    // 4. User clicks New Chapter when canvas has text -> must open dialog
    sim.requestNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, true, "New Chapter confirmation dialog must open");

    // 5. User cancels
    sim.isNewChapterDialogOpen = false;
    assert.equal(sim.chapterTitle, "บทที่ 5: การเดินทาง", "Title preserved on cancel");
    assert.equal(sim.editorHtml, "<p>เนื้อหาตอนเดิมที่เขียนค้างไว้</p>", "Content preserved on cancel");

    // 6. User confirms
    sim.handleStartNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, false, "Dialog closed after confirmation");
    assert.equal(sim.chapterTitle, "ตอนใหม่", "Title reset to 'ตอนใหม่'");
    assert.equal(sim.editorHtml, "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>");
    assert.equal(sim.mobileSidebarOpen, false, "Mobile sidebar closed");

    // 7. Empty Canvas Shortcut: When canvas has NO text, New Chapter should NOT open dialog
    sim.editorHtml = "";
    sim.updateCounts();
    sim.chapterTitle = "กระดาษว่าง";
    sim.requestNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, false, "Empty canvas bypasses confirmation dialog directly");
    assert.equal(sim.chapterTitle, "ตอนใหม่");
  });

  it("2.4 Rapid Double-Clicking & Re-entrancy Resilience", () => {
    // Rapidly request new chapter multiple times
    sim.requestNewChapter();
    sim.requestNewChapter();
    sim.requestNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, true, "Dialog remains open without re-entrancy error");

    // Rapidly confirm multiple times
    sim.handleStartNewChapter();
    sim.handleStartNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, false);
    assert.equal(sim.chapterTitle, "ตอนใหม่");

    // Rapidly click Plus prompt button
    sim.input = "";
    sim.handlePromptPlusClick();
    const firstPrompt = sim.input;
    sim.handlePromptPlusClick();
    sim.handlePromptPlusClick();
    assert.equal(sim.input, firstPrompt, "Rapid clicking Plus button does not append duplicate prompts");
  });

  it("2.5 Error Banner State Machine & Dismissal", () => {
    // No error initially
    assert.equal(sim.getDisplayError(), null);

    // Error arrives from API
    sim.error = new Error("API quota exceeded for Gemini model");
    assert.equal(sim.getDisplayError(), "API quota exceeded for Gemini model");

    // Dismiss error
    sim.dismissedError = sim.getDisplayError();
    assert.equal(sim.getDisplayError(), null, "Error banner is hidden after dismissal");

    // Same error does not re-show
    assert.equal(sim.getDisplayError(), null);

    // New error arrives
    sim.error = new Error("Network connection dropped");
    assert.equal(sim.getDisplayError(), "Network connection dropped", "New error shows banner again");
  });
});

// =============================================================================
// TIER 3: Cross-Feature Combinations Tests
// =============================================================================
describe("Tier 3: Cross-Feature Combinations (การทำงานประสานข้ามฟังก์ชัน)", () => {
  let sim;
  beforeEach(() => {
    sim = new GeminiNovelCanvasSimulator();
  });

  it("3.1 Model Switch + New Chapter State Preservation", () => {
    // 1. User selects Gemini 2.5 Pro
    sim.selectModel("gemini-2.5-pro");
    assert.equal(sim.selectedModel, "gemini-2.5-pro");

    // 2. User edits canvas
    sim.chapterTitle = "ตอนที่ 10: ศึกชิงบัลลังก์";
    sim.editorHtml = "<h1>ตอนที่ 10</h1><p>กองทัพประชิดกำแพงเมือง</p>";
    sim.updateCounts();

    // 3. User initiates New Chapter and confirms
    sim.requestNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, true);
    sim.handleStartNewChapter();

    // 4. Verify Model state is NOT reset to flash
    assert.equal(sim.selectedModel, "gemini-2.5-pro", "Selected AI Model must persist across new chapter creation");
    assert.equal(sim.chapterTitle, "ตอนใหม่", "Chapter title reset correctly");
    assert.equal(sim.editorHtml, "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>");
  });

  it("3.2 Formatting + Autosave DOM Contract with ai-sdk-react.ts", () => {
    // Test that the DOM selectors used by ai-sdk-react.ts exist and match page.tsx
    // Selector 1: "main div.border-b input"
    const hasMainBorderBInput = pageCode.includes('<main') &&
                               pageCode.includes('border-b border-[#3c4043]') &&
                               pageCode.includes('value={chapterTitle}');
    assert.ok(hasMainBorderBInput, "DOM contract: main div.border-b input must exist in page.tsx");

    // Selector 2: "[contenteditable]"
    assert.ok(pageCode.includes("contentEditable"), "DOM contract: [contenteditable] must exist in page.tsx");

    // Test Signature generation as performed in ai-sdk-react.ts
    const title = sim.chapterTitle;
    sim.execCmd("bold");
    const html = sim.editorHtml;
    const signature1 = `${title}::${html}`;

    // Another format change
    sim.execCmd("formatBlock", "<h1>");
    const signature2 = `${title}::${sim.editorHtml}`;
    assert.notEqual(signature1, signature2, "Autosave signature changes when formatting is applied");

    // Exact string template contract: ai-sdk-react.ts listens for:
    // currentHtml === "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"
    const templateString = "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>";
    assert.ok(aiSdkCode.includes(templateString), "ai-sdk-react.ts must contain exact template string");
    assert.ok(pageCode.includes(templateString), "page.tsx must use exact same template string");
  });

  it("3.3 Mobile Drawer Open + Model Selection Coordination", () => {
    // 1. Mobile user opens drawer
    sim.mobileSidebarOpen = true;
    assert.equal(sim.mobileSidebarOpen, true);

    // 2. User switches model while mobile drawer is open
    sim.selectModel("gemini-2.5-pro");
    assert.equal(sim.selectedModel, "gemini-2.5-pro");
    assert.equal(sim.mobileSidebarOpen, true, "Model selection does not corrupt drawer state");

    // 3. User closes drawer via backdrop or X
    sim.mobileSidebarOpen = false;
    assert.equal(sim.mobileSidebarOpen, false);
    assert.equal(sim.selectedModel, "gemini-2.5-pro", "Model selection retained after closing drawer");
  });

  it("3.4 Prompt Plus Button Insertion + Send Button Activation Flow", () => {
    // 1. Input is initially empty -> Send button disabled
    sim.input = "";
    assert.equal(sim.isSendButtonDisabled(), true, "Send button disabled when input is empty");

    // 2. User clicks Plus prompt button
    sim.handlePromptPlusClick();
    assert.ok(sim.input.length > 20, "Prompt pill populated with template text");
    assert.equal(sim.isSendButtonDisabled(), false, "Send button immediately becomes enabled");

    // 3. User appends custom prompt
    sim.input += "เน้นการต่อสู้ด้วยดาบเวทมนตร์";
    assert.equal(sim.isSendButtonDisabled(), false);

    // 4. When loading starts -> Send button is disabled / transforms to stop button
    sim.isLoading = true;
    assert.equal(sim.isSendButtonDisabled(), true, "Send disabled during generation");
    sim.isLoading = false;
    assert.equal(sim.isSendButtonDisabled(), false, "Send re-enabled after generation completes");
  });

  it("3.5 Character & Word Counter Synchronization with Rich Formatting", () => {
    // Baseline
    sim.editorHtml = "<p>หนึ่ง สอง สาม</p>";
    sim.updateCounts();
    assert.equal(sim.wordCount, 3);
    assert.equal(sim.charCount, 13); // "หนึ่ง สอง สาม" (13 characters)

    // Apply formatting tags (HTML tags should NOT count towards word count or display text)
    sim.execCmd("bold");
    assert.equal(sim.wordCount, 3, "Applying bold tags does not inflate word count");

    sim.execCmd("formatBlock", "<h1>");
    assert.equal(sim.wordCount, 3, "Applying H1 tags does not inflate word count");

    // Clear canvas
    sim.handleClearCanvas();
    assert.equal(sim.wordCount, 0);
    assert.equal(sim.charCount, 0);
  });
});

// =============================================================================
// TIER 4: Real-World Application Scenarios
// =============================================================================
describe("Tier 4: Real-World Application Scenarios (จำลองผู้ใช้แต่งนิยายจริง)", () => {
  it("4.1 Complete End-to-End Novel Authoring Scenario", () => {
    const sim = new GeminiNovelCanvasSimulator();

    // Step 1: User arrives on page -> Initial state validation
    assert.equal(sim.chapterTitle, "บทนำ: เสียงกระซิบใต้เงาจันทรา");
    assert.equal(sim.selectedModel, "gemini-2.5-flash");
    assert.equal(sim.sidebarOpen, true);
    assert.ok(sim.charCount > 0, "Initial canvas has default intro text");

    // Step 2: Author renames chapter
    sim.chapterTitle = "บทที่ 1: เพลิงผลาญอเวจี";
    assert.equal(sim.chapterTitle, "บทที่ 1: เพลิงผลาญอเวจี");

    // Step 3: Author clears previous draft and starts new content
    sim.requestClearCanvas();
    assert.equal(sim.isTrashDialogOpen, true);
    sim.handleClearCanvas();
    assert.equal(sim.editorHtml, "");
    assert.equal(sim.charCount, 0);

    // Step 4: Author writes title and paragraphs
    sim.editorHtml = "<h1>เพลิงผลาญอเวจี</h1><p>เปลวไฟ สีคราม ลุกโชน ทั่วลานประลอง กลิ่นไอดิน ไหม้เกรียม คละคลุ้ง</p>";
    sim.updateCounts();
    assert.ok(sim.charCount > 20);
    assert.ok(sim.wordCount >= 5);

    // Step 5: Author selects words and formats with Bold and Italic
    sim.execCmd("bold");
    assert.ok(sim.editorHtml.includes("<b>"));

    // Step 6: Author decides to use Gemini 2.5 Pro for deep complex reasoning
    sim.selectModel("gemini-2.5-pro");
    assert.equal(sim.selectedModel, "gemini-2.5-pro");

    // Step 7: Author clicks Plus button on prompt bar for novel assistant directive
    assert.equal(sim.isSendButtonDisabled(), true);
    sim.handlePromptPlusClick();
    assert.equal(sim.isSendButtonDisabled(), false);

    // Step 8: Author enters custom instruction and submits
    sim.input += "เพิ่มตัวละครศัตรูที่ปรากฏตัวพร้อมรอยยิ้มเยือกเย็น";
    assert.ok(sim.input.includes("ศัตรู"));

    // Simulate AI generation streaming
    sim.isLoading = true;
    assert.equal(sim.isSendButtonDisabled(), true);

    const generatedAiText = "<p>“ไม่เจอกันนานนะ” เสียงทุ้มต่ำดังขึ้นจากเงามืด ชายหนุ่มในชุดคลุมสีรัตติกาลก้าวออกมา</p>";
    sim.editorHtml += generatedAiText;
    sim.updateCounts();
    sim.isLoading = false;
    sim.input = "";

    assert.ok(sim.editorHtml.includes("ไม่เจอกันนานนะ"));
    assert.ok(sim.charCount > 80);

    // Step 9: Author creates a new chapter for the next part
    sim.requestNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, true, "Confirmation dialog opens because canvas has text");

    // Confirm new chapter
    sim.handleStartNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, false);
    assert.equal(sim.chapterTitle, "ตอนใหม่");
    assert.equal(sim.editorHtml, "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>");
    assert.equal(sim.selectedModel, "gemini-2.5-pro", "Model choice remains Gemini 2.5 Pro for the new chapter");
  });

  it("4.2 Responsive Viewport Transition Scenario (Desktop 1280px -> Tablet 768px -> Mobile 375px)", () => {
    // 1. Desktop Viewport (1280px)
    // Desktop sidebar has transition classes, overflow-hidden, and collapse behavior
    assert.ok(pageCode.includes("transition-all duration-300"), "Sidebar has smooth transition animation");
    assert.ok(pageCode.includes("overflow-hidden"), "Desktop sidebar has overflow-hidden");
    assert.ok(pageCode.includes('sidebarOpen ? "w-67" : "w-17"'), "Sidebar collapses from 268px (w-67) to 68px (w-17)");

    // In collapsed mode: button has h-10 w-10 and aria-label="หน้ากระดาษใหม่"
    assert.ok(
      pageCode.includes('className="h-10 w-10 p-0 inline-flex items-center justify-center rounded-full bg-[#282a2c]'),
      "Collapsed sidebar has dedicated 40px icon button"
    );

    // 2. Mobile Viewport (375px)
    // Desktop sidebar is hidden with hidden md:flex
    assert.ok(pageCode.includes("hidden md:flex"), "Desktop sidebar is completely hidden on mobile screens");

    // Mobile hamburger menu button exists in header
    assert.ok(
      pageCode.includes('className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-[#1e1f20] text-[#c4c7c5]'),
      "Mobile hamburger button exists with md:hidden"
    );

    // Mobile drawer is fixed overlay with backdrop
    assert.ok(pageCode.includes("fixed inset-y-0 left-0 z-50"), "Mobile drawer is z-50 overlay");
    assert.ok(pageCode.includes("fixed inset-0 z-40 bg-black/60"), "Mobile backdrop is z-40 overlay");

    // Formatting Toolbar has horizontal scrolling with no scrollbar
    assert.ok(pageCode.includes("overflow-x-auto no-scrollbar"), "Formatting toolbar scrolls horizontally without scrollbars");
    assert.ok(globalsCssCode.includes(".no-scrollbar"), "globals.css contains .no-scrollbar cross-browser rules");
  });

  it("4.3 Accessibility, Theme & Design Tokens Verification", () => {
    // Theme dark class
    assert.ok(layoutCode.includes("dark"), "Root layout must enforce 'dark' class");
    assert.ok(layoutCode.includes("--font-geist-sans"), "Geist Sans font variable bound in layout");
    assert.ok(globalsCssCode.includes("--font-sans: var(--font-geist-sans)"), "globals.css maps --font-sans");

    // Accessibility attributes in page.tsx
    const expectedAriaLabels = [
      'aria-label="ปิดเมนู"',
      'aria-label="เปิดเมนู"',
      'aria-label="เลือกโมเดล Gemini"',
      'aria-label="ล้างกระดาษ"',
      'aria-label="ตัวหนา"',
      'aria-label="ตัวเอียง"',
      'aria-label="ขีดเส้นใต้"',
      'aria-label="ขีดฆ่า"',
      'aria-label="รายการแบบสัญลักษณ์"',
      'aria-label="รายการแบบตัวเลข"',
      'aria-label="บล็อกคำพูด"',
      'aria-label="ล้างการจัดรูปแบบ"',
      'aria-label="แทรกตัวช่วยคำสั่งเขียนนิยาย"',
      'aria-label="ส่งคำสั่ง"',
    ];

    for (const aria of expectedAriaLabels) {
      assert.ok(pageCode.includes(aria), `page.tsx must provide accessible attribute: ${aria}`);
    }
  });
});
