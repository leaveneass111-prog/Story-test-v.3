import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

console.log('=== เริ่มการทดสอบเชิงประจักษ์ (Empirical Verification): Styling, Animations & Responsive ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    if (details) console.error(`       รายละเอียด: ${details}`);
    failCount++;
  }
}

// 1. ตรวจสอบ layout.tsx และ globals.css สำหรับ Dark Mode & Font Variables
console.log('--- 1. ตรวจสอบ Dark Mode และ Font Variables ---');
const layoutPath = path.join(projectRoot, 'src/app/layout.tsx');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(
  /<html[^>]*className=["'][^"']*\bdark\b[^"']*["']/.test(layoutContent) ||
  layoutContent.includes('dark h-full antialiased'),
  'แท็ก <html> ใน layout.tsx มีคลาส "dark"'
);

assert(
  layoutContent.includes('variable: "--font-geist-sans"'),
  'Geist Sans font ถูกกำหนด variable "--font-geist-sans"'
);

assert(
  layoutContent.includes('${geistSans.variable}'),
  'geistSans.variable ถูกเชื่อมโยงเข้ากับ className ของ <html>'
);

const globalsCssPath = path.join(projectRoot, 'src/app/globals.css');
const globalsCssContent = fs.readFileSync(globalsCssPath, 'utf8');

assert(
  globalsCssContent.includes('--font-sans: var(--font-geist-sans)'),
  'globals.css แมป --font-sans เข้ากับ var(--font-geist-sans)'
);

assert(
  globalsCssContent.includes('--font-heading: var(--font-geist-sans)'),
  'globals.css แมป --font-heading เข้ากับ var(--font-geist-sans)'
);

assert(
  globalsCssContent.includes('.dark {') && globalsCssContent.includes('--background: oklch(0.145 0 0)'),
  'globals.css มีตัวแปร Dark mode theme ครบถ้วน'
);

// 2. ตรวจสอบ Sidebar Desktop & Aside Overflow Containment
console.log('\n--- 2. ตรวจสอบ Sidebar Overflow & Button Dimensions ---');
const pagePath = path.join(projectRoot, 'src/app/page.tsx');
const pageContent = fs.readFileSync(pagePath, 'utf8');

// ตรวจสอบ desktop aside
const desktopAsideMatch = pageContent.match(/<aside[^>]*hidden md:flex[^>]*>/);
assert(
  desktopAsideMatch !== null && desktopAsideMatch[0].includes('overflow-hidden'),
  'Desktop <aside> มีคลาส "overflow-hidden" ป้องกันการล้นทะลุขอบ'
);

// ตรวจสอบ collapsed button สำหรับ "หน้ากระดาษใหม่"
const collapsedButtonMatch = pageContent.match(/sidebarOpen\s*\?\s*\([\s\S]*?\)\s*:\s*\([\s\S]*?<button[\s\S]*?aria-label="หน้ากระดาษใหม่"[\s\S]*?>/);
assert(
  collapsedButtonMatch !== null,
  'มีปุ่ม "หน้ากระดาษใหม่" แยกเฉพาะสำหรับโหมดพับเก็บ (!sidebarOpen)'
);

if (collapsedButtonMatch) {
  const btnTag = collapsedButtonMatch[0];
  const hasH10W10 = btnTag.includes('h-10 w-10') || btnTag.includes('size-10');
  assert(
    hasH10W10,
    'ปุ่มหน้ากระดาษใหม่เมื่อพับเก็บถูกจำกัดขนาดเป็น h-10 w-10 (40px) ซึ่ง <= 44px'
  );
  
  // ตรวจสอบว่าไม่มีข้อความยาวข้างในปุ่มที่พับเก็บ (ข้อความต้องอยู่ใน Tooltip แทน)
  const collapsedBlockMatch = pageContent.match(/sidebarOpen\s*\?\s*\([\s\S]*?\)\s*:\s*\(([\s\S]*?)\n\s*\)/);
  if (collapsedBlockMatch) {
    const collapsedMarkup = collapsedBlockMatch[1];
    const buttonInsideMatch = collapsedMarkup.match(/<button[\s\S]*?<\/button>/);
    const hasTextInsideButton = buttonInsideMatch && buttonInsideMatch[0].includes('หน้ากระดาษใหม่</span>');
    assert(
      !hasTextInsideButton,
      'ปุ่มเมื่อพับเก็บไม่มีข้อความ <span>หน้ากระดาษใหม่</span> ค้างอยู่ข้างในปุ่ม (ไม่เกิด text overflow)'
    );
  }
}

// 3. ตรวจสอบ Mobile 375px Responsive Layout
console.log('\n--- 3. ตรวจสอบ Responsive Layout โหมด Mobile 375px ---');

assert(
  pageContent.includes('h-dvh') && pageContent.includes('w-full'),
  'Root container ใช้ h-dvh และ w-full ป้องกันปัญหา Scrollbar ล้น และ Address bar บนมือถือ'
);

// ตรวจสอบว่า desktop sidebar ถูกซ่อนบนมือถือ
assert(
  desktopAsideMatch && desktopAsideMatch[0].includes('hidden md:flex'),
  'Desktop sidebar ถูกซ่อนบน Mobile (hidden md:flex) ไม่เบียด Canvas'
);

// ตรวจสอบ Mobile Drawer
const mobileDrawerMatch = pageContent.match(/<aside[^>]*fixed[^>]*md:hidden[^>]*>/);
assert(
  mobileDrawerMatch !== null && mobileDrawerMatch[0].includes('z-50') && mobileDrawerMatch[0].includes('overflow-hidden'),
  'มี Mobile Drawer (<aside className="fixed ... md:hidden ...">) z-50 แบบ Overlay ไม่ดันพื้นที่ใน document flow'
);

// ตรวจสอบ Mobile Backdrop Overlay
assert(
  pageContent.includes('fixed inset-0 z-40 bg-black/60') && pageContent.includes('md:hidden'),
  'มี Backdrop Overlay เมื่อเปิด Mobile Drawer'
);

// ตรวจสอบปุ่มเปิด Mobile Drawer บน Header
const mobileHeaderMenuBtnMatch = pageContent.match(/<button[^>]*onClick=\{[^}]*setMobileSidebarOpen\(true\)[^}]*\}[^>]*md:hidden[^>]*>/);
assert(
  mobileHeaderMenuBtnMatch !== null,
  'มีปุ่ม Hamburger Menu บน Header (md:hidden) สำหรับเปิด Drawer บนหน้าจอมือถือ'
);

// 4. ตรวจสอบ Formatting Toolbar Horizontal Scroll & No-Scrollbar
console.log('\n--- 4. ตรวจสอบ Formatting Toolbar ---');
const toolbarMatch = pageContent.match(/{\/\* Formatting Toolbar[\s\S]*?<div className="([^"]*)"/);
assert(
  toolbarMatch !== null,
  'พบคอนเทนเนอร์ Formatting Toolbar'
);

if (toolbarMatch) {
  const toolbarClasses = toolbarMatch[1];
  assert(
    toolbarClasses.includes('overflow-x-auto'),
    'Toolbar มีคลาส overflow-x-auto สำหรับการเลื่อนแนวนอนบนหน้าจอแคบ'
  );
  assert(
    toolbarClasses.includes('no-scrollbar'),
    'Toolbar มีคลาส no-scrollbar ซ่อนแถบเลื่อนไม่ให้เกะกะ'
  );
  assert(
    !toolbarClasses.includes('flex-wrap'),
    'Toolbar ไม่มีการใช้ flex-wrap (บังคับแสดงแถวเดียว flex-nowrap)'
  );
  assert(
    toolbarClasses.includes('shrink-0'),
    'Toolbar มีคลาส shrink-0 ไม่ถูกหดตัว'
  );
}

// ตรวจสอบปุ่มใน Toolbar ทั้งหมดว่ามี shrink-0 และ onMouseDown preventDefault
const toolbarStartIndex = pageContent.indexOf('Formatting Toolbar');
const toolbarEndIndex = pageContent.indexOf('Editable Surface');
const toolbarSection = pageContent.slice(toolbarStartIndex, toolbarEndIndex);

// แยกแต่ละบล็อกปุ่มใน Toolbar
const buttonBlocks = toolbarSection.split('<button').slice(1).map(b => b.split('</button>')[0]);

assert(
  buttonBlocks.length === 10,
  `พบปุ่ม Formatting Toolbar ครบทั้ง 10 ปุ่ม (พบ: ${buttonBlocks.length} ปุ่ม: H1, H2, Bold, Italic, Underline, Strikethrough, Unordered List, Ordered List, Quote, Remove Formatting)`
);

const allButtonsShrink0 = buttonBlocks.length > 0 && buttonBlocks.every(block => {
  const classMatch = block.match(/className="([^"]*)"/);
  return classMatch && classMatch[1].includes('shrink-0');
});

assert(
  allButtonsShrink0,
  `ปุ่มทั้ง 10 ปุ่มใน Toolbar มีคลาส "shrink-0" ป้องกันการหดตัวเบียดกันบนหน้าจอมือถือ`
);

const allButtonsPreventDefault = buttonBlocks.length > 0 && buttonBlocks.every(block => {
  return block.includes('onMouseDown={(e) => e.preventDefault()}');
});

assert(
  allButtonsPreventDefault,
  `ปุ่มทั้ง 10 ปุ่มใน Toolbar มี onMouseDown={(e) => e.preventDefault()} ป้องกันการหลุด Text Selection`
);

// ตรวจสอบ CSS .no-scrollbar ใน globals.css
assert(
  globalsCssContent.includes('.no-scrollbar::-webkit-scrollbar') &&
  globalsCssContent.includes('scrollbar-width: none'),
  'CSS class .no-scrollbar มีคำสั่งซ่อน Scrollbar ครบทุกเบราว์เซอร์'
);

console.log(`\n=== สรุปผลการทดสอบ: ผ่าน ${passCount} รายการ, ล้มเหลว ${failCount} รายการ ===`);
process.exit(failCount === 0 ? 0 : 1);
