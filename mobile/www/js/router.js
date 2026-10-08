import { icon } from "./icons.js";

const screens = new Map();
const stack = [];
let screenEl;
let navEl;
let onEmptyStack = null;

export function registerScreen(name, render) {
  screens.set(name, render);
}

export function initRouter({ screenElement, navElement, emptyStackHandler }) {
  screenEl = screenElement;
  navEl = navElement;
  onEmptyStack = emptyStackHandler;
}

async function render(entry, { isRoot = false } = {}) {
  const definition = screens.get(entry.name);
  if (!definition) {
    console.error(`[router] unknown screen: ${entry.name}`);
    return;
  }

  screenEl.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  screenEl.innerHTML = `
    <header class="screen-head ${isRoot ? "screen-head-root" : ""}">
      ${isRoot ? "" : `<button class="icon-btn back-btn" aria-label="رجوع">${icon("chevron-start", { size: 24 })}</button>`}
      <h1>${entry.title || ""}</h1>
      <span class="screen-head-spacer"></span>
    </header>
    <div class="screen-body" id="screenBody"></div>
  `;

  if (!isRoot) {
    screenEl.querySelector(".back-btn")?.addEventListener("click", () => back());
  }

  const bodyEl = screenEl.querySelector("#screenBody");
  const result = await definition({ params: entry.params, bodyEl, setTitle: (t) => (screenEl.querySelector("h1").textContent = t) });
  entry.cleanup = result?.cleanup || null;
  updateNavActive(entry.tab);
}

export async function go(name, params = {}, { title = "", tab = null, root = false } = {}) {
  if (root) {
    stack.forEach((entry) => entry.cleanup?.());
    stack.length = 0;
  } else {
    stack[stack.length - 1]?.cleanup?.();
  }
  const entry = { name, params, title, tab: tab || stack[stack.length - 1]?.tab || null };
  stack.push(entry);
  await render(entry, { isRoot: stack.length === 1 });
}

export async function replace(name, params = {}, { title = "", tab = null } = {}) {
  const prev = stack.pop();
  prev?.cleanup?.();
  const entry = { name, params, title, tab: tab || prev?.tab || null };
  stack.push(entry);
  await render(entry, { isRoot: stack.length === 1 });
}

export async function back() {
  if (stack.length <= 1) {
    onEmptyStack?.();
    return;
  }
  const popped = stack.pop();
  popped.cleanup?.();
  await render(stack[stack.length - 1], { isRoot: stack.length === 1 });
}

export async function goToTab(tabName, rootScreen, { title = "" } = {}) {
  stack.forEach((entry) => entry.cleanup?.());
  stack.length = 0;
  const entry = { name: rootScreen, params: {}, title, tab: tabName };
  stack.push(entry);
  await render(entry, { isRoot: true });
}

export function currentTab() {
  return stack[stack.length - 1]?.tab || null;
}

function updateNavActive(tab) {
  if (!navEl) return;
  navEl.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

export function stackDepth() {
  return stack.length;
}
