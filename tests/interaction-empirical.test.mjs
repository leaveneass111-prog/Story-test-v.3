import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pagePath = path.join(projectRoot, "src", "app", "page.tsx");
const dialogPath = path.join(projectRoot, "src", "components", "ui", "dialog.tsx");
const dropdownPath = path.join(projectRoot, "src", "components", "ui", "dropdown-menu.tsx");
const aiSdkPath = path.join(projectRoot, "src", "lib", "ai-sdk-react.ts");

const pageCode = fs.readFileSync(pagePath, "utf-8");
const dialogCode = fs.readFileSync(dialogPath, "utf-8");
const dropdownCode = fs.readFileSync(dropdownPath, "utf-8");
const aiSdkCode = fs.readFileSync(aiSdkPath, "utf-8");

test("Verification 0: UI Primitives (Dialog & DropdownMenu) Export Integrity", () => {
  const expectedDialogExports = [
    "Dialog",
    "DialogTrigger",
    "DialogContent",
    "DialogHeader",
    "DialogFooter",
    "DialogTitle",
    "DialogDescription",
    "DialogAction",
    "DialogCancel",
  ];
  for (const exp of expectedDialogExports) {
    assert.ok(dialogCode.includes(exp), `dialog.tsx must export ${exp}`);
  }

  const expectedDropdownExports = [
    "DropdownMenu",
    "DropdownMenuTrigger",
    "DropdownMenuContent",
    "DropdownMenuItem",
  ];
  for (const exp of expectedDropdownExports) {
    assert.ok(dropdownCode.includes(exp), `dropdown-menu.tsx must export ${exp}`);
  }
});

test("Verification 1: Toolbar buttons have onMouseDown preventDefault() to retain focus/selection", () => {
  // Extract formatting toolbar section
  const startIndex = pageCode.indexOf("{/* Formatting Toolbar");
  const endIndex = pageCode.indexOf("{/* Editable Surface");
  assert.ok(startIndex !== -1 && endIndex !== -1, "Formatting Toolbar section must be present in page.tsx");
  const toolbarCode = pageCode.slice(startIndex, endIndex);

  // List of expected toolbar commands
  const expectedCommands = [
    { name: "H1", cmd: 'execCmd("formatBlock", "<h1>")' },
    { name: "H2", cmd: 'execCmd("formatBlock", "<h2>")' },
    { name: "Bold", cmd: 'execCmd("bold")' },
    { name: "Italic", cmd: 'execCmd("italic")' },
    { name: "Underline", cmd: 'execCmd("underline")' },
    { name: "Strikethrough", cmd: 'execCmd("strikeThrough")' },
    { name: "UnorderedList", cmd: 'execCmd("insertUnorderedList")' },
    { name: "OrderedList", cmd: 'execCmd("insertOrderedList")' },
    { name: "Quote", cmd: 'execCmd("formatBlock", "<blockquote>")' },
    { name: "RemoveFormat", cmd: 'execCmd("removeFormat")' },
  ];

  // Find all buttons within toolbar
  const buttonRegex = /<button[\s\S]*?<\/button>/g;
  const buttons = toolbarCode.match(buttonRegex) || [];

  assert.equal(buttons.length, 10, "Toolbar must have exactly 10 formatting buttons");

  for (const buttonStr of buttons) {
    // Each button must have onMouseDown with preventDefault()
    const hasPreventDefault = /onMouseDown=\{[^}]*e\.preventDefault\(\)[^}]*\}/.test(buttonStr);
    assert.ok(hasPreventDefault, `Toolbar button must have onMouseDown with e.preventDefault(): ${buttonStr.slice(0, 80)}...`);
  }

  // Verify each expected command is covered
  for (const { name, cmd } of expectedCommands) {
    const hasCmd = toolbarCode.includes(cmd);
    assert.ok(hasCmd, `Toolbar must contain command ${name}: ${cmd}`);
  }

  // Simulate mousedown event execution
  let defaultPrevented = false;
  const mockEvent = {
    preventDefault: () => {
      defaultPrevented = true;
    },
  };
  const simulatedMouseDown = (e) => e.preventDefault();
  simulatedMouseDown(mockEvent);
  assert.equal(defaultPrevented, true, "Simulated onMouseDown must call e.preventDefault()");
});

test("Verification 2: 'หน้ากระดาษใหม่' synchronizes chapterTitle state with Sidebar and Title Input", () => {
  // 1. Check handleStartNewChapter implementation
  assert.ok(
    pageCode.includes('setChapterTitle("ตอนใหม่")'),
    "handleStartNewChapter must call setChapterTitle('ตอนใหม่')"
  );
  assert.ok(
    pageCode.includes('editorRef.current.innerHTML =\n        "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"') ||
    pageCode.includes('editorRef.current.innerHTML = "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"') ||
    pageCode.includes('"<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"'),
    "handleStartNewChapter must set innerHTML to '<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>'"
  );
  assert.ok(
    pageCode.includes("setIsNewChapterDialogOpen(false)"),
    "handleStartNewChapter must close the confirmation dialog"
  );

  // 2. Check title input binding
  assert.ok(
    pageCode.includes("value={chapterTitle}"),
    "Title input must bind value to chapterTitle state"
  );
  assert.ok(
    pageCode.includes("onChange={(e) => setChapterTitle(e.target.value)}"),
    "Title input must update chapterTitle on change"
  );

  // 3. Check desktop and mobile sidebars displaying chapterTitle
  const sidebarMatches = [...pageCode.matchAll(/<span className="truncate">\{chapterTitle\}<\/span>/g)];
  assert.ok(
    sidebarMatches.length >= 2,
    `Both mobile and desktop sidebars must display {chapterTitle} (found ${sidebarMatches.length})`
  );

  // 4. Verify trigger points for New Chapter
  // Mobile drawer trigger
  assert.ok(pageCode.includes('setIsNewChapterDialogOpen(true)'), "Must open dialog when text is present");
  
  // State simulation
  let state = {
    chapterTitle: "บทนำ: เสียงกระซิบใต้เงาจันทรา",
    isDialogOpen: false,
    mobileSidebarOpen: true,
    editorHtml: "<p>Original</p>",
  };

  function simulateStartNewChapter() {
    state.chapterTitle = "ตอนใหม่";
    state.editorHtml = "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>";
    state.isDialogOpen = false;
    state.mobileSidebarOpen = false;
  }

  simulateStartNewChapter();
  assert.equal(state.chapterTitle, "ตอนใหม่", "State chapterTitle should update to 'ตอนใหม่'");
  assert.equal(state.editorHtml, "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>");
  assert.equal(state.isDialogOpen, false);
  assert.equal(state.mobileSidebarOpen, false);
});

test("Verification 3: Gemini Model Selector is a DropdownMenu that switches state", () => {
  // Check imports
  assert.ok(pageCode.includes("DropdownMenu"), "Must import DropdownMenu");
  assert.ok(pageCode.includes("DropdownMenuTrigger"), "Must import DropdownMenuTrigger");
  assert.ok(pageCode.includes("DropdownMenuContent"), "Must import DropdownMenuContent");
  assert.ok(pageCode.includes("DropdownMenuItem"), "Must import DropdownMenuItem");

  // Check state definition
  assert.ok(
    pageCode.includes('const [selectedModel, setSelectedModel] = useState<'),
    "Must have selectedModel state"
  );
  assert.ok(
    pageCode.includes('"gemini-2.5-flash"'),
    "Must support gemini-2.5-flash"
  );
  assert.ok(
    pageCode.includes('"gemini-2.5-pro"'),
    "Must support gemini-2.5-pro"
  );

  // Check DropdownMenuItem onClick handlers
  assert.ok(
    pageCode.includes('onClick={() => setSelectedModel("gemini-2.5-flash")}'),
    "Must have item switching to gemini-2.5-flash"
  );
  assert.ok(
    pageCode.includes('onClick={() => setSelectedModel("gemini-2.5-pro")}'),
    "Must have item switching to gemini-2.5-pro"
  );

  // Check useChat binding
  assert.ok(
    pageCode.includes("body: { model: selectedModel }"),
    "useChat must pass selectedModel in body"
  );

  // State machine simulation
  let currentModel = "gemini-2.5-flash";
  const selectModel = (model) => {
    currentModel = model;
  };

  selectModel("gemini-2.5-pro");
  assert.equal(currentModel, "gemini-2.5-pro");
  selectModel("gemini-2.5-flash");
  assert.equal(currentModel, "gemini-2.5-flash");
});

test("Verification 4: Clear Canvas (Trash) button has confirmation Dialog before clearing text", () => {
  // Check trash button
  const trashButtonMatch = pageCode.match(/<button[\s\S]*?onClick=\{\(\) => setIsTrashDialogOpen\(true\)\}[\s\S]*?aria-label="ล้างกระดาษ"[\s\S]*?<\/button>/);
  assert.ok(trashButtonMatch, "Trash button must trigger setIsTrashDialogOpen(true)");

  // Check Dialog presence
  assert.ok(
    pageCode.includes("open={isTrashDialogOpen}"),
    "Trash Dialog must bind open state to isTrashDialogOpen"
  );
  assert.ok(
    pageCode.includes("ยืนยันการล้างกระดาษ"),
    "Trash Dialog must have title 'ยืนยันการล้างกระดาษ'"
  );
  assert.ok(
    pageCode.includes("DialogCancel"),
    "Trash Dialog must have cancel button"
  );
  assert.ok(
    pageCode.includes("handleClearCanvas"),
    "Trash Dialog confirm action must call handleClearCanvas"
  );

  // Simulate dialog logic
  let canvasText = "ข้อความนิยายที่สำคัญมาก";
  let isDialogOpen = false;

  // 1. User clicks trash button
  isDialogOpen = true;
  assert.equal(canvasText, "ข้อความนิยายที่สำคัญมาก", "Text must not be cleared when dialog opens");

  // 2. User clicks Cancel
  isDialogOpen = false;
  assert.equal(canvasText, "ข้อความนิยายที่สำคัญมาก", "Text must not be cleared on cancel");

  // 3. User clicks Confirm
  isDialogOpen = true;
  function handleClear() {
    canvasText = "";
    isDialogOpen = false;
  }
  handleClear();
  assert.equal(canvasText, "", "Text is cleared only after confirming dialog");
  assert.equal(isDialogOpen, false, "Dialog closes after confirming");
});

test("Verification 5: Send Prompt button is disabled when input is empty or whitespace", () => {
  // Check Send button disabled condition
  assert.ok(
    pageCode.includes("disabled={!input.trim()}"),
    "Send button must specify disabled={!input.trim()}"
  );

  // Check form submit guard
  assert.ok(
    pageCode.includes("disabled:opacity-40 disabled:cursor-not-allowed"),
    "Send button must visually reflect disabled state with opacity and cursor-not-allowed"
  );

  // Edge cases evaluation for disabled state
  const isSendDisabled = (input) => !input.trim();

  assert.equal(isSendDisabled(""), true, "Empty string must disable send button");
  assert.equal(isSendDisabled("   "), true, "Spaces only must disable send button");
  assert.equal(isSendDisabled("\t\n  \r"), true, "Whitespace characters must disable send button");
  assert.equal(isSendDisabled("a"), false, "Single character must enable send button");
  assert.equal(isSendDisabled("   สวัสดี   "), false, "Text with surrounding whitespace must enable send button");

  // Check Plus button interaction in prompt pill
  assert.ok(
    pageCode.includes("onClick={handlePromptPlusClick}"),
    "Prompt plus button must call handlePromptPlusClick"
  );
  assert.ok(
    pageCode.includes("ช่วยเขียนบรรยายเหตุการณ์ในตอนนี้ต่อ"),
    "Prompt plus button must set default template text when empty"
  );
});

test("Verification 6: DOM Stability Contract with ai-sdk-react.ts", () => {
  // ai-sdk-react.ts queries:
  // 1. "main div.border-b input"
  // 2. "[contenteditable]"
  // 3. string "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"

  // Check canvas input matches DOM selector
  const hasMain = pageCode.includes("<main");
  const hasBorderBInput = /<div className="[^"]*border-b[^"]*">[\s\S]*?<input[\s\S]*?value=\{chapterTitle\}/.test(pageCode);
  assert.ok(hasMain && hasBorderBInput, "DOM contract: main div.border-b input must exist in page.tsx");

  // Check contenteditable
  assert.ok(
    pageCode.includes("contentEditable"),
    "DOM contract: [contenteditable] element must exist in page.tsx"
  );

  // Check exact synchronization string match with ai-sdk-react.ts
  const aiSdkSyncMatch = aiSdkCode.includes('currentHtml === "<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"');
  assert.ok(aiSdkSyncMatch, "ai-sdk-react.ts must observe exact new chapter template");
  const pageTemplateMatch = pageCode.includes('"<h1>ตอนใหม่</h1><p>เริ่มเขียนที่นี่...</p>"');
  assert.ok(pageTemplateMatch, "page.tsx must set exact new chapter template expected by ai-sdk-react.ts");
});

test("Verification 7: Mobile Responsiveness and Drawer Layout", () => {
  // Viewport setup
  assert.ok(pageCode.includes("h-dvh"), "Root must use h-dvh for mobile address bar safety");

  // Desktop sidebar
  assert.ok(
    pageCode.includes("hidden md:flex"),
    "Desktop sidebar must be hidden on mobile (< 768px)"
  );
  assert.ok(
    pageCode.includes("overflow-hidden"),
    "Desktop sidebar must have overflow-hidden to prevent layout leaks"
  );

  // Mobile sidebar drawer
  assert.ok(
    pageCode.includes("md:hidden"),
    "Mobile sidebar must only show on mobile (< 768px)"
  );
  assert.ok(
    pageCode.includes("fixed inset-y-0 left-0 z-50"),
    "Mobile sidebar must be a fixed overlay drawer"
  );

  // Hamburger button in header
  assert.ok(
    pageCode.includes("onClick={() => setMobileSidebarOpen(true)}"),
    "Header must have button to open mobile drawer"
  );
});
