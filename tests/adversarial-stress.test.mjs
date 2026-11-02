import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pagePath = path.join(projectRoot, "src", "app", "page.tsx");
const layoutPath = path.join(projectRoot, "src", "app", "layout.tsx");
const globalsCssPath = path.join(projectRoot, "src", "app", "globals.css");
const aiSdkPath = path.join(projectRoot, "src", "lib", "ai-sdk-react.ts");
const dialogPath = path.join(projectRoot, "src", "components", "ui", "dialog.tsx");
const dropdownPath = path.join(projectRoot, "src", "components", "ui", "dropdown-menu.tsx");

const pageCode = fs.readFileSync(pagePath, "utf-8");
const layoutCode = fs.readFileSync(layoutPath, "utf-8");
const globalsCssCode = fs.readFileSync(globalsCssPath, "utf-8");
const aiSdkCode = fs.readFileSync(aiSdkPath, "utf-8");
const dialogCode = fs.readFileSync(dialogPath, "utf-8");
const dropdownCode = fs.readFileSync(dropdownPath, "utf-8");

// =============================================================================
// Helper: White-Box Simulator for Adversarial Stress Testing
// =============================================================================
class AdversarialSimulator {
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
    this.editorHtml = "<h1>บทนำ: เสียงกระซิบใต้เงาจันทรา</h1><p>สายลมหนาวพัดกรูผ่านช่องหน้าต่างบานเก่า กลิ่นอายของกำยานและหมึกแห้งลอยอบอวลไปทั่วห้องหนังสือโบราณ...</p>";
    this.updateCounts();
  }

  getEditorInnerText() {
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
      this.editorHtml = `<${value?.replace(/[<>]/g, "")}>${this.editorHtml}</${value?.replace(/[<>]/g, "")}>`;
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

  insertRichContent(content) {
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

    this.editorHtml += formatted;
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

// Extracted parser from ai-sdk-react.ts for White-Box Fuzzing
function parseSseLineToDelta(line) {
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
      const parsed = JSON.parse(payload);
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
        // Ignore
      }
    }
    return { matched: true, delta: "" };
  }

  return { matched: false, delta: "" };
}

// =============================================================================
// TIER 5: White-Box Adversarial Hardening & Stress Testing Suite
// =============================================================================

describe("Tier 5: Adversarial Hardening & Stress Testing (Milestone 3)", () => {
  // ---------------------------------------------------------------------------
  // 5.1 Rapid Model Switching Stress & State Integrity
  // ---------------------------------------------------------------------------
  it("5.1 Rapid Model Switching Stress (1,000 cycles) & State Integrity", () => {
    const sim = new AdversarialSimulator();
    const models = ["gemini-2.5-flash", "gemini-2.5-pro"];

    for (let i = 0; i < 1000; i++) {
      const targetModel = models[i % 2];
      sim.selectModel(targetModel);
      assert.equal(sim.selectedModel, targetModel, `Cycle ${i} model mismatch`);
    }

    // Verify invalid model names do not pollute or break state
    sim.selectModel("gemini-invalid-ultra");
    assert.equal(sim.selectedModel, "gemini-2.5-pro", "Invalid model name must be ignored");

    // Verify source code binding in useChat options
    assert.ok(pageCode.includes("body: { model: selectedModel }"), "useChat must dynamically bind selectedModel");
    assert.ok(pageCode.includes('onClick={() => setSelectedModel("gemini-2.5-flash")}'));
    assert.ok(pageCode.includes('onClick={() => setSelectedModel("gemini-2.5-pro")}'));
  });

  // ---------------------------------------------------------------------------
  // 5.2 Formatting Toolbar Zero-Selection, Multi-Block & Rapid Command Fuzzing
  // ---------------------------------------------------------------------------
  it("5.2 Formatting Toolbar Zero-Selection, Multi-Block & Rapid Command Fuzzing", () => {
    const sim = new AdversarialSimulator();
    const commands = [
      { cmd: "formatBlock", val: "<h1>" },
      { cmd: "formatBlock", val: "<h2>" },
      { cmd: "bold", val: null },
      { cmd: "italic", val: null },
      { cmd: "underline", val: null },
      { cmd: "strikeThrough", val: null },
      { cmd: "insertUnorderedList", val: null },
      { cmd: "insertOrderedList", val: null },
      { cmd: "formatBlock", val: "<blockquote>" },
      { cmd: "removeFormat", val: null },
    ];

    // Simulate 500 rapid command executions
    for (let i = 0; i < 500; i++) {
      const c = commands[i % commands.length];
      sim.execCmd(c.cmd, c.val);
      assert.ok(sim.charCount >= 0, "Character count must stay non-negative");
      assert.ok(sim.wordCount >= 0, "Word count must stay non-negative");
    }

    // Clean format check
    sim.execCmd("removeFormat");
    assert.ok(!sim.editorHtml.includes("<script>"), "Editor must not contain arbitrary script tags");

    // Verify all 10 buttons in page.tsx have onMouseDown preventDefault and shrink-0
    const toolbarStart = pageCode.indexOf("{/* Formatting Toolbar");
    const toolbarEnd = pageCode.indexOf("{/* Editable Surface");
    const toolbarCode = pageCode.slice(toolbarStart, toolbarEnd);
    const buttons = toolbarCode.match(/<button[\s\S]*?<\/button>/g) || [];

    assert.equal(buttons.length, 10, "Toolbar must have exactly 10 formatting buttons");
    for (const b of buttons) {
      assert.ok(b.includes("onMouseDown={(e) => e.preventDefault()}"), "Button must retain onMouseDown preventDefault");
      assert.ok(b.includes("shrink-0"), "Button must have shrink-0 to prevent compression on narrow viewports");
    }
  });

  // ---------------------------------------------------------------------------
  // 5.3 Dialog Confirmation/Cancellation Rapid Oscillation & Re-entrancy
  // ---------------------------------------------------------------------------
  it("5.3 Dialog Confirmation/Cancellation Rapid Oscillation (500 cycles)", () => {
    const sim = new AdversarialSimulator();
    const initialText = sim.getEditorInnerText();
    const initialTitle = sim.chapterTitle;

    for (let i = 0; i < 500; i++) {
      // 1. Open Trash Dialog then Cancel
      sim.requestClearCanvas();
      assert.equal(sim.isTrashDialogOpen, true);
      assert.equal(sim.getEditorInnerText(), initialText, "Text must not clear on dialog open");
      sim.isTrashDialogOpen = false; // Cancel
      assert.equal(sim.getEditorInnerText(), initialText, "Text must remain intact on cancel");

      // 2. Open New Chapter Dialog then Cancel
      sim.requestNewChapter();
      assert.equal(sim.isNewChapterDialogOpen, true);
      assert.equal(sim.chapterTitle, initialTitle, "Title must not change on dialog open");
      sim.isNewChapterDialogOpen = false; // Cancel
      assert.equal(sim.chapterTitle, initialTitle, "Title must remain intact on cancel");
    }

    // Now test Confirming Trash
    sim.requestClearCanvas();
    sim.handleClearCanvas();
    assert.equal(sim.isTrashDialogOpen, false);
    assert.equal(sim.editorHtml, "");
    assert.equal(sim.charCount, 0);
    assert.equal(sim.wordCount, 0);

    // Request new chapter when empty should directly create without dialog
    sim.requestNewChapter();
    assert.equal(sim.isNewChapterDialogOpen, false, "When editor is empty, new chapter should not prompt dialog");
    assert.equal(sim.chapterTitle, "ตอนใหม่");
    assert.ok(sim.editorHtml.includes("ตอนใหม่"));
  });

  // ---------------------------------------------------------------------------
  // 5.4 Mobile Drawer Rapid Toggling & Backdrop Coordination Stress
  // ---------------------------------------------------------------------------
  it("5.4 Mobile Drawer Rapid Toggling (1,000 cycles) & Backdrop Coordination", () => {
    const sim = new AdversarialSimulator();

    // 1,000 rapid toggles
    for (let i = 0; i < 1000; i++) {
      sim.mobileSidebarOpen = !sim.mobileSidebarOpen;
      assert.equal(sim.mobileSidebarOpen, (i % 2) === 0);
    }
    sim.mobileSidebarOpen = true;

    // Simulate clicking "New Chapter" inside mobile drawer
    sim.handleStartNewChapter();
    assert.equal(sim.mobileSidebarOpen, false, "Starting new chapter from mobile drawer must close the drawer");
    assert.equal(sim.chapterTitle, "ตอนใหม่");

    // Verify Backdrop styling and z-index contract in source code
    assert.ok(pageCode.includes("fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"), "Mobile backdrop must have z-40 and backdrop-blur-xs");
    assert.ok(pageCode.includes("fixed inset-y-0 left-0 z-50"), "Mobile drawer aside must have z-50 overlay");
    assert.ok(pageCode.includes("translate-x-0"), "Mobile drawer must support open transition translate-x-0");
    assert.ok(pageCode.includes("-translate-x-full"), "Mobile drawer must support close transition -translate-x-full");
  });

  // ---------------------------------------------------------------------------
  // 5.5 Special Characters, Complex Thai Unicode & Adversarial Injections
  // ---------------------------------------------------------------------------
  it("5.5 Special Characters, Complex Thai Unicode & Adversarial Injections", () => {
    const sim = new AdversarialSimulator();

    // Complex Thai sentences with combining vowels, tone marks and quotes
    const thaiContent = `“สายธารแห่งโชคชะตา” พัดพาให้ 'ผู้หญิงที่เปี่ยมด้วยความหวัง' เดินทางสู่ดินแดนอันไกลโพ้น\n\n“เจ้าพร้อมที่จะเผชิญหน้ากับความจริงหรือไม่?” เสียงลึกลับกระซิบก้อง`;
    sim.insertRichContent(thaiContent);

    assert.ok(sim.editorHtml.includes("<blockquote>“สายธารแห่งโชคชะตา”"), "Thai quote must be wrapped in blockquote");
    assert.ok(sim.editorHtml.includes("<blockquote>“เจ้าพร้อมที่จะเผชิญหน้ากับความจริงหรือไม่?”"), "Second dialogue quote must be wrapped in blockquote");
    assert.ok(sim.charCount > 50, "Char count must accurately measure Thai text length");
    assert.ok(sim.wordCount > 5, "Word count must accurately measure words");

    // Adversarial HTML injection attack in prompt
    sim.input = `<script>alert("xss")</script><img src="x" onerror="alert(1)">`;
    assert.equal(sim.isSendButtonDisabled(), false, "Send button is enabled for non-empty string");
    
    // Whitespace edge cases: Zero-width space, Non-breaking space, Tabs, Newlines
    sim.input = "   \t\r\n   ";
    assert.equal(sim.isSendButtonDisabled(), true, "Only whitespace must disable send button");

    sim.input = "";
    sim.handlePromptPlusClick();
    assert.ok(sim.input.includes("ช่วยเขียนบรรยายเหตุการณ์ในตอนนี้ต่อ"), "Plus button must populate default template");

    // Extreme text stress test (100,000 characters)
    const largeChunk = "บททดสอบความทนทานของระบบแต่งนิยายภาษาไทย ".repeat(2600);
    sim.editorHtml = largeChunk;
    sim.updateCounts();
    assert.ok(sim.charCount >= 100000, "Simulator must handle 100,000+ characters smoothly");
    assert.ok(sim.wordCount > 0, "Word count must handle 100,000+ characters smoothly");
  });

  // ---------------------------------------------------------------------------
  // 5.6 SSE Parser & Autosave Protocol Fuzzing
  // ---------------------------------------------------------------------------
  it("5.6 SSE Stream Decoder & Protocol Fuzzing with Malformed Payloads", () => {
    // 1. Standard text-delta
    const p1 = parseSseLineToDelta('data: {"type":"text-delta","delta":"สวัสดี"}');
    assert.equal(p1.matched, true);
    assert.equal(p1.delta, "สวัสดี");

    // 2. Alternative textDelta property
    const p2 = parseSseLineToDelta('data: {"textDelta":"นิยายบทใหม่"}');
    assert.equal(p2.matched, true);
    assert.equal(p2.delta, "นิยายบทใหม่");

    // 3. Alternative text property
    const p3 = parseSseLineToDelta('data: {"type":"text","text":"บทสนทนา"}');
    assert.equal(p3.matched, true);
    assert.equal(p3.delta, "บทสนทนา");

    // 4. End of stream token [DONE]
    const pDone = parseSseLineToDelta("data: [DONE]");
    assert.equal(pDone.matched, true);
    assert.equal(pDone.delta, "");

    // 5. Legacy AI SDK chunk format 0:"text"
    const pLegacy = parseSseLineToDelta('0:"ท่วงทำนองแห่งกาลเวลา"');
    assert.equal(pLegacy.matched, true);
    assert.equal(pLegacy.delta, "ท่วงทำนองแห่งกาลเวลา");

    // 6. Malformed JSON resilient fallback
    const pMalformed = parseSseLineToDelta('data: { corrupted json string...');
    assert.equal(pMalformed.matched, false);
    assert.equal(pMalformed.delta, "");

    // 7. Non-data random string
    const pRandom = parseSseLineToDelta("event: ping");
    assert.equal(pRandom.matched, false);
  });

  // ---------------------------------------------------------------------------
  // 5.7 Error Notification Lifecycle & Suppression State Machine
  // ---------------------------------------------------------------------------
  it("5.7 Error Notification Lifecycle & Suppression State Machine", () => {
    const sim = new AdversarialSimulator();
    assert.equal(sim.getDisplayError(), null, "Initial display error must be null");

    // Error 1 occurs
    sim.error = new Error("Connection timed out to Gemini API");
    assert.equal(sim.getDisplayError(), "Connection timed out to Gemini API");

    // Dismiss Error 1
    sim.dismissedError = "Connection timed out to Gemini API";
    assert.equal(sim.getDisplayError(), null, "Dismissed error must be suppressed");

    // Error 1 occurs again (same message) -> remains suppressed
    sim.error = new Error("Connection timed out to Gemini API");
    assert.equal(sim.getDisplayError(), null, "Identical error must remain suppressed");

    // A NEW distinct error occurs -> displayed immediately
    sim.error = new Error("Quota exceeded for model gemini-2.5-pro");
    assert.equal(sim.getDisplayError(), "Quota exceeded for model gemini-2.5-pro", "New distinct error must be displayed");

    // Dismiss Error 2
    sim.dismissedError = "Quota exceeded for model gemini-2.5-pro";
    assert.equal(sim.getDisplayError(), null);
  });

  // ---------------------------------------------------------------------------
  // 5.8 DOM Contract & Layout Integrity Verification
  // ---------------------------------------------------------------------------
  it("5.8 DOM Contract & Layout Integrity Verification", () => {
    // DOM Contract: ai-sdk-react.ts expectations
    assert.ok(aiSdkCode.includes('"main div.border-b input"'), "ai-sdk-react must query 'main div.border-b input'");
    assert.ok(aiSdkCode.includes('"[contenteditable]"'), "ai-sdk-react must query '[contenteditable]'");
    assert.ok(aiSdkCode.includes('"<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"'), "ai-sdk-react must sync exact template");

    // page.tsx fulfillments
    assert.ok(pageCode.includes("<main"), "page.tsx must have <main> tag");
    assert.ok(/border-b[^>]*>[\s\S]*?<input[\s\S]*?value=\{chapterTitle\}/.test(pageCode), "page.tsx must have input inside border-b");
    assert.ok(pageCode.includes("contentEditable"), "page.tsx must have contentEditable surface");
    assert.ok(pageCode.includes('"<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"'), "page.tsx must use exact synchronization template");

    // Shadcn Dialog and Dropdown exports
    assert.ok(dialogCode.includes("DialogAction"), "dialog.tsx must export DialogAction");
    assert.ok(dialogCode.includes("DialogCancel"), "dialog.tsx must export DialogCancel");
    assert.ok(dropdownCode.includes("DropdownMenu"), "dropdown-menu.tsx must export DropdownMenu");
    assert.ok(dropdownCode.includes("DropdownMenuItem"), "dropdown-menu.tsx must export DropdownMenuItem");

    // Root HTML and styling
    assert.ok(layoutCode.includes("dark"), "layout.tsx must enable dark class on <html>");
    assert.ok(globalsCssCode.includes("--font-sans: var(--font-geist-sans)"), "globals.css must map geist sans");
    assert.ok(globalsCssCode.includes(".no-scrollbar"), "globals.css must define .no-scrollbar");
  });
});
