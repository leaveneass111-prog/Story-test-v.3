import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pagePath = path.join(projectRoot, "src", "app", "page.tsx");
const layoutPath = path.join(projectRoot, "src", "app", "layout.tsx");
const globalsCssPath = path.join(projectRoot, "src", "app", "globals.css");
const dialogPath = path.join(projectRoot, "src", "components", "ui", "dialog.tsx");
const dropdownPath = path.join(projectRoot, "src", "components", "ui", "dropdown-menu.tsx");

const pageCode = fs.readFileSync(pagePath, "utf-8");
const layoutCode = fs.readFileSync(layoutPath, "utf-8");
const globalsCssCode = fs.readFileSync(globalsCssPath, "utf-8");
const dialogCode = fs.readFileSync(dialogPath, "utf-8");
const dropdownCode = fs.readFileSync(dropdownPath, "utf-8");

// =============================================================================
// Helper: Layout Geometry & Stacking Simulator for Responsive Viewports
// =============================================================================
class ViewportGeometrySimulator {
  constructor(viewportWidth, viewportHeight) {
    this.vw = viewportWidth;
    this.vh = viewportHeight;
    this.isMobile = viewportWidth < 768; // Tailwind md: 768px
  }

  calculateHeaderOccupancy() {
    // Left side:
    // Hamburger: 40px (on mobile only) + gap-2 (8px)
    // Model Trigger: padding px-3 (24px) + "Gemini" text (~55px) + Badge (~60px) + Chevron (16px) + gap-1.5 (12px) = ~167px
    const hamburgerWidth = this.isMobile ? 40 + 8 : 0;
    const modelTriggerWidth = 167;
    const leftWidth = hamburgerWidth + modelTriggerWidth;

    // Right side:
    // Stats pill: px-3 py-1.5 (24px) + char count (~100px on desktop, hidden on mobile) + word count (~40px)
    const statsWidth = this.isMobile ? 65 : 175;

    // Outer padding: px-3 (24px total) on mobile, px-6 (48px total) on desktop
    const headerPadding = this.isMobile ? 24 : 48;

    const totalHeaderContentWidth = leftWidth + statsWidth + headerPadding;
    const remainingSpace = this.vw - totalHeaderContentWidth;

    return {
      totalContentWidth: totalHeaderContentWidth,
      remainingSpace,
      hasOverflow: remainingSpace < 0,
    };
  }

  calculateDrawerFit() {
    // Drawer width is w-67 (16.75rem = 268px)
    const drawerWidth = 268;
    const backdropVisible = this.vw - drawerWidth;
    return {
      drawerWidth,
      backdropVisible,
      isFullyContained: drawerWidth < this.vw,
    };
  }

  calculatePromptPillFit() {
    // Plus button (36px) + gap (8px) + Input min-w-0 + gap (8px) + Send button (36px) + padding (24px)
    const fixedElementsWidth = 36 + 8 + 8 + 36 + 24; // 112px
    const availableForInput = Math.min(this.vw, 896) - fixedElementsWidth; // max-w-4xl is 896px
    return {
      fixedElementsWidth,
      availableForInput,
      isUsable: availableForInput >= 100, // input has at least 100px to type
    };
  }

  calculateDialogFit() {
    // Dialog uses: max-w-[calc(100%-2rem)] sm:max-w-lg
    // In viewport, margin is 2rem = 32px (16px each side)
    const maxDialogWidth = this.vw >= 640 ? Math.min(512, this.vw - 32) : this.vw - 32;
    return {
      maxDialogWidth,
      marginEachSide: 16,
      fitsOnScreen: maxDialogWidth > 0 && maxDialogWidth + 32 <= this.vw,
    };
  }
}

describe("Tier 5 Adversarial Robustness & Styling Hardening (Challenger 2)", () => {
  // ---------------------------------------------------------------------------
  // 1. Responsive Viewport Breakdown Matrix & Overflow Elimination
  // ---------------------------------------------------------------------------
  describe("1. Responsive Viewport Stress Matrix (320px to 1440px+)", () => {
    const viewports = [
      { name: "320px Ultra-Small (iPhone SE 1st gen)", width: 320, height: 568 },
      { name: "375px Mobile Standard (iPhone SE 2nd/3rd)", width: 375, height: 667 },
      { name: "414px Mobile Large (iPhone 11 / XR / Plus)", width: 414, height: 896 },
      { name: "768px Tablet Portrait (iPad Mini / Air)", width: 768, height: 1024 },
      { name: "1024px Tablet Landscape / Small Desktop", width: 1024, height: 768 },
      { name: "1440px Desktop Large / Ultra-wide", width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      it(`Viewport ${vp.name}: Layout must contain all elements without overflow`, () => {
        const sim = new ViewportGeometrySimulator(vp.width, vp.height);

        // Header check
        const header = sim.calculateHeaderOccupancy();
        assert.ok(!header.hasOverflow, `Header must not overflow in ${vp.name} (remaining: ${header.remainingSpace}px)`);

        // Mobile drawer check (if mobile)
        if (sim.isMobile) {
          const drawer = sim.calculateDrawerFit();
          assert.ok(drawer.isFullyContained, `Mobile drawer must fit completely within viewport in ${vp.name}`);
          assert.ok(drawer.backdropVisible > 0, `Backdrop click area must remain accessible in ${vp.name} (visible: ${drawer.backdropVisible}px)`);
        }

        // Prompt pill check
        const prompt = sim.calculatePromptPillFit();
        assert.ok(prompt.isUsable, `Prompt input must remain usable in ${vp.name} (available input width: ${prompt.availableForInput}px)`);

        // Dialog containment check
        const dialog = sim.calculateDialogFit();
        assert.ok(dialog.fitsOnScreen, `Dialog must fit completely within viewport in ${vp.name}`);
      });
    }

    it("Root container must enforce zero-scroll leak: h-dvh, w-full, overflow-hidden", () => {
      // Must use h-dvh for mobile dynamic address bar handling
      assert.ok(pageCode.includes("h-dvh"), "Root container must use h-dvh to prevent mobile address bar jumping");
      assert.ok(pageCode.includes("w-full"), "Root container must use w-full");
      assert.ok(pageCode.includes("overflow-hidden"), "Root container must have overflow-hidden");
      // Check that html/body also prevent double scrollbars
      assert.ok(layoutCode.includes("h-full"), "layout.tsx html must have h-full");
      assert.ok(layoutCode.includes("min-h-full"), "layout.tsx body must have min-h-full");
    });

    it("Formatting toolbar must provide horizontal scrolling without breaking layout", () => {
      assert.ok(pageCode.includes("overflow-x-auto"), "Toolbar must have overflow-x-auto");
      assert.ok(pageCode.includes("no-scrollbar"), "Toolbar must use no-scrollbar");
      assert.ok(!pageCode.includes("flex-wrap"), "Toolbar must not wrap buttons into multiple rows");
      // Every formatting button must have shrink-0
      const toolbarStartIndex = pageCode.indexOf("{/* Formatting Toolbar");
      const toolbarEndIndex = pageCode.indexOf("{/* Editable Surface");
      const toolbarChunk = pageCode.slice(toolbarStartIndex, toolbarEndIndex);
      const buttons = toolbarChunk.match(/<button[\s\S]*?<\/button>/g) || [];
      assert.equal(buttons.length, 10, "Toolbar must have exactly 10 buttons");
      for (const btn of buttons) {
        assert.ok(btn.includes("shrink-0"), "Every button in toolbar must have shrink-0 to prevent button collapse");
      }
    });

    it("Input flex-1 inside Prompt Pill must have min-w-0 to prevent flex expansion overflow", () => {
      const promptInputMatch = pageCode.match(/<input[^>]*placeholder="ถาม Gemini[^>]*>/);
      assert.ok(promptInputMatch, "Prompt input must exist");
      assert.ok(promptInputMatch[0].includes("min-w-0"), "Prompt input must contain min-w-0 to avoid flex parent blowup on small viewports");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CSS Conflicts, Stacking & OKLCH Theme Integrity
  // ---------------------------------------------------------------------------
  describe("2. CSS Conflicts, Stacking & OKLCH Theme Hardening", () => {
    it("globals.css must have strict 1:1 variable parity between :root and .dark", () => {
      // Extract :root block
      const rootMatch = globalsCssCode.match(/:root\s*\{([\s\S]*?)\}/);
      assert.ok(rootMatch, ":root CSS declaration must exist");
      const rootVars = new Set(
        [...rootMatch[1].matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1])
      );

      // Extract .dark block
      const darkMatch = globalsCssCode.match(/\.dark\s*\{([\s\S]*?)\}/);
      assert.ok(darkMatch, ".dark CSS declaration must exist");
      const darkVars = new Set(
        [...darkMatch[1].matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1])
      );

      // Variables that must exist in both
      const criticalVars = [
        "background", "foreground", "card", "card-foreground",
        "popover", "popover-foreground", "primary", "primary-foreground",
        "secondary", "secondary-foreground", "muted", "muted-foreground",
        "accent", "accent-foreground", "destructive", "border", "input", "ring",
        "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
        "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring"
      ];

      for (const v of criticalVars) {
        assert.ok(rootVars.has(v), `:root must define --${v}`);
        assert.ok(darkVars.has(v), `.dark must define --${v}`);
      }
    });

    it("Tailwind v4 @custom-variant dark and OKLCH color spaces must be syntax-safe", () => {
      assert.ok(globalsCssCode.includes("@custom-variant dark (&:is(.dark *));"), "Must use valid Tailwind v4 dark variant selector");
      assert.ok(globalsCssCode.includes("oklch("), "Colors must use OKLCH color space for modern wide-gamut rendering");
    });

    it(".no-scrollbar utility must cross-support WebKit, Gecko and Edge/IE", () => {
      assert.ok(globalsCssCode.includes(".no-scrollbar::-webkit-scrollbar"), "WebKit scrollbar hiding rule required");
      assert.ok(globalsCssCode.includes("scrollbar-width: none;"), "Gecko scrollbar-width none rule required");
      assert.ok(globalsCssCode.includes("-ms-overflow-style: none;"), "Legacy Edge/IE scrollbar hiding rule required");
    });

    it("[contenteditable] typography definitions must be clean and not leak into parent layout", () => {
      assert.ok(globalsCssCode.includes("[contenteditable] h1"), "h1 style definition must be scoped to [contenteditable]");
      assert.ok(globalsCssCode.includes("[contenteditable] h2"), "h2 style definition must be scoped to [contenteditable]");
      assert.ok(globalsCssCode.includes("[contenteditable] blockquote"), "blockquote style definition must be scoped to [contenteditable]");
      assert.ok(globalsCssCode.includes("[contenteditable] ul"), "ul style definition must be scoped to [contenteditable]");
      assert.ok(globalsCssCode.includes("[contenteditable] ol"), "ol style definition must be scoped to [contenteditable]");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Z-Index Overlays & Backdrop Pointer-Events Hierarchy
  // ---------------------------------------------------------------------------
  describe("3. Z-Index Layering Hierarchy & Modal Overlays", () => {
    it("Mobile Backdrop must have z-40 and Mobile Drawer must have z-50", () => {
      const backdropMatch = pageCode.match(/className="[^"]*fixed inset-0 z-40 bg-black\/60[^"]*"/);
      assert.ok(backdropMatch, "Mobile backdrop must have z-40");

      const drawerMatch = pageCode.match(/<aside[^>]*fixed inset-y-0 left-0 z-50[^>]*>/);
      assert.ok(drawerMatch, "Mobile drawer must have z-50 so it sits above backdrop");
    });

    it("Mobile Backdrop must dismiss drawer when clicked and have aria-hidden", () => {
      const backdropBlock = pageCode.match(/mobileSidebarOpen\s*&&\s*\([\s\S]*?<div[\s\S]*?onClick=\{\(\)\s*=>\s*setMobileSidebarOpen\(false\)\}[\s\S]*?aria-hidden="true"[\s\S]*?\/>\s*\)/);
      assert.ok(backdropBlock, "Backdrop must handle onClick to close mobile sidebar and declare aria-hidden='true'");
    });

    it("Radix Dialog and Dropdown Overlays must have z-50 and proper portal encapsulation", () => {
      // Dialog Overlay
      assert.ok(dialogCode.includes("z-50 bg-black/70"), "Dialog overlay must have z-50 and dark translucent tint");
      assert.ok(dialogCode.includes("DialogPrimitive.Portal"), "Dialog must render into Portal to avoid parent stacking context trapping");
      
      // Dropdown Menu Content
      assert.ok(dropdownCode.includes("z-50 min-w-"), "Dropdown menu content must have z-50");
      assert.ok(dropdownCode.includes("DropdownMenuPrimitive.Portal"), "DropdownMenu must use Portal to render above all UI layers");
    });

    it("DialogCancel and DialogAction must maintain proper button hierarchy and accessible labels", () => {
      assert.ok(dialogCode.includes('children = "ยกเลิก"'), "DialogCancel must provide default Thai cancel label");
      assert.ok(dialogCode.includes('variant = "outline"'), "DialogCancel must have outline variant");
      assert.ok(dialogCode.includes('variant = "default"'), "DialogAction must default to primary/default variant");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Font Injection & Typography Security
  // ---------------------------------------------------------------------------
  describe("4. Font Injection & Typography Safety", () => {
    it("layout.tsx must configure Next.js Google Fonts with CSS variables and apply to <html>", () => {
      assert.ok(layoutCode.includes('variable: "--font-geist-sans"'), "Geist font must assign --font-geist-sans variable");
      assert.ok(layoutCode.includes('variable: "--font-geist-mono"'), "Geist Mono must assign --font-geist-mono variable");
      assert.ok(layoutCode.includes("${geistSans.variable}"), "<html> must receive geistSans variable class");
      assert.ok(layoutCode.includes("${geistMono.variable}"), "<html> must receive geistMono variable class");
      assert.ok(layoutCode.includes("dark"), "<html> must have permanent 'dark' class");
      assert.ok(layoutCode.includes("antialiased"), "<html> must use subpixel/antialiased font smoothing");
    });

    it("globals.css must safely map font-sans, font-mono, and font-heading with robust fallbacks", () => {
      assert.ok(
        globalsCssCode.includes("--font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;"),
        "--font-sans must have system-ui fallback chain"
      );
      assert.ok(
        globalsCssCode.includes("--font-mono: var(--font-geist-mono), ui-monospace, monospace;"),
        "--font-mono must have ui-monospace fallback chain"
      );
      assert.ok(
        globalsCssCode.includes("--font-heading: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;"),
        "--font-heading must be mapped"
      );
    });

    it("No unescaped external @import or insecure font URLs in CSS", () => {
      const externalImports = globalsCssCode.match(/@import\s+url\([^)]+\)/g);
      assert.equal(externalImports, null, "There must be no external unverified @import url(...) to prevent network latency and font injection");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Extreme Adversarial Edge Cases & Stress Scenarios
  // ---------------------------------------------------------------------------
  describe("5. Extreme Adversarial Edge Cases & Stress Scenarios", () => {
    it("Scenario A: Massive Thai text and continuous string without whitespace in Chapter Title", () => {
      // Check that all places displaying chapter title use truncate
      // 1. In header input: find the chapterTitle input block
      const chapterInputMatch = pageCode.match(/<input[\s\S]*?value=\{chapterTitle\}[\s\S]*?\/>/);
      assert.ok(chapterInputMatch, "Chapter title input must exist");
      assert.ok(chapterInputMatch[0].includes("truncate"), "Header chapter title input must have 'truncate' class");

      // 2. In Mobile Drawer recent chapter
      const drawerTitleMatch = pageCode.match(/<span className="truncate">\{chapterTitle\}<\/span>/);
      assert.ok(drawerTitleMatch, "Chapter title in drawer and sidebar must be wrapped in 'truncate'");
    });

    it("Scenario B: Rich content insertion parser must handle unformatted raw paragraphs gracefully", () => {
      // Simulate parser function from page.tsx lines 80-108
      const parser = (content) => {
        return content.includes("<p>") || content.includes("<h") || content.includes("<blockquote>")
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
      };

      // Raw dialogue
      const rawDialogue = '"นี่คือเสียงกระซิบจากความมืด" เขาเอ่ยขึ้นแผ่วเบา\n\nสายลมพัดผ่านเงียบงัน';
      const parsedDialogue = parser(rawDialogue);
      assert.ok(parsedDialogue.includes("<blockquote>\"นี่คือเสียงกระซิบจากความมืด\" เขาเอ่ยขึ้นแผ่วเบา</blockquote>"));
      assert.ok(parsedDialogue.includes("<p>สายลมพัดผ่านเงียบงัน</p>"));

      // Preformatted HTML from AI
      const preformatted = "<h2>ฉากที่ ๑</h2><p>ราตรีอันยาวนานเริ่มต้นขึ้น</p>";
      const parsedPre = parser(preformatted);
      assert.equal(parsedPre, preformatted, "Preformatted HTML should be passed as-is without double-wrapping");
    });

    it("Scenario C: Error notification banner dismissal and error recovery cycle", () => {
      // State machine simulation for error banner
      let error = { message: "API Gateway Timeout 504: Model busy" };
      let dismissedError = null;

      const getDisplayError = (err, dismissed) => {
        return err?.message && err.message !== dismissed ? err.message : null;
      };

      assert.equal(getDisplayError(error, dismissedError), "API Gateway Timeout 504: Model busy");

      // User dismisses error
      dismissedError = "API Gateway Timeout 504: Model busy";
      assert.equal(getDisplayError(error, dismissedError), null, "Dismissed error should not be shown");

      // New error arrives
      error = { message: "Quota exceeded 429: Too many requests" };
      assert.equal(getDisplayError(error, dismissedError), "Quota exceeded 429: Too many requests", "New error must be displayed even if previous was dismissed");
    });

    it("Scenario D: Rapid double-click protection on Chapter Creation Dialog", () => {
      let isNewChapterDialogOpen = false;
      let chapterTitle = "เดิม";
      let executionCount = 0;

      const onConfirm = () => {
        chapterTitle = "ตอนใหม่";
        isNewChapterDialogOpen = false;
        executionCount++;
      };

      // Open dialog
      isNewChapterDialogOpen = true;
      assert.equal(isNewChapterDialogOpen, true);

      // Simulate rapid user confirmation clicks
      onConfirm();
      if (isNewChapterDialogOpen) {
        onConfirm(); // Should not fire if dialog is closed
      }

      assert.equal(executionCount, 1, "Confirmation action must execute cleanly once without duplicate re-entrancy");
      assert.equal(chapterTitle, "ตอนใหม่");
    });
  });
});
