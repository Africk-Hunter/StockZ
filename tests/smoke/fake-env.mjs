// A deliberately small fake browser + Firebase for smoke-running the page
// modules under Node. It only implements the APIs the app uses; anything else
// is undefined, so a new DOM call in the app fails loudly here and the fake
// gets extended on purpose.

export class FakeElement {
  constructor(tag = "div", id = null) {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._classes = new Set();
    this.className = "";
    this._text = "";
    this._innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.title = "";
    this.href = "";
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._classes.add(x)),
      remove: (...c) => c.forEach((x) => self._classes.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !self._classes.has(c) : force;
        on ? self._classes.add(c) : self._classes.delete(c);
        return on;
      },
      contains: (c) => self._classes.has(c) || self.className.split(/\s+/).includes(c),
    };
  }
  get innerHTML() { return this._innerHTML; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this._innerHTML = this._text; this.children.forEach((c) => (c.parent = null)); this.children = []; }
  set innerHTML(v) { this._innerHTML = v; this._text = String(v).replace(/<[^>]*>/g, ""); this.children.forEach((c) => (c.parent = null)); this.children = []; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  replaceWith(other) {
    if (!this.parent) return;
    const siblings = this.parent.children;
    siblings[siblings.indexOf(this)] = other;
    other.parent = this.parent;
    this.parent = null;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
  setAttribute(k, v) { this.attributes[k] = v; }
  focus() {}
  select() {}
  click() { globalThis.__onElementClick?.(this); return this.fire("click"); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const out = [];
    const matches = matcher(sel);
    (function walk(node) { node.children.forEach((c) => { if (matches(c)) out.push(c); walk(c); }); })(this);
    return out;
  }
  // Test helper: fire an event at this element's listeners (and bubble to document).
  async fire(type, extra = {}) {
    const event = { type, target: this, button: 0, preventDefault() {}, stopPropagation() { this.stopped = true; }, ...extra };
    for (const fn of this.listeners[type] ?? []) await fn.call(this, event);
    if (!event.stopped) await document.fire(type, event);
  }
  hasClass(name) { return this.classList.contains(name); }
  // All descendants (depth-first), for assertions.
  descendants() { return this.querySelectorAll("*"); }
}

// Supports "tag", ".class", "#id", "[data-ticker=\"X\"]" and a descendant
// combinator ("#a [data-x]") — all the app's selectors.
function matcher(sel) {
  const parts = sel.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const test = (el) => {
    if (last === "*") return true;
    if (last.startsWith("#")) return el.id === last.slice(1);
    if (last.startsWith(".")) return el.classList.contains(last.slice(1));
    const attr = last.match(/^\[data-(\w+)="(.*)"\]$/);
    if (attr) return el.dataset[attr[1]] === attr[2];
    const tagAttr = last.match(/^(\w+)\[type="(\w+)"\]$/);
    if (tagAttr) return el.tagName === tagAttr[1].toUpperCase() && el.type === tagAttr[2];
    return el.tagName === last.toUpperCase();
  };
  return test;
}

// Node defines some browser-ish globals (navigator, fetch...) as getters.
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
}

export function createFakeBrowser({ ids = [], url = "http://localhost/", localStorageData = {}, xhr = () => null } = {}) {
  const store = new Map(Object.entries(localStorageData));
  const elementsById = new Map(ids.map((id) => [id, new FakeElement("div", id)]));
  const root = new FakeElement("body");
  elementsById.forEach((el) => root.appendChild(el));
  const mainEl = new FakeElement("main");
  root.appendChild(mainEl);

  const documentListeners = {};
  globalThis.document = {
    getElementById: (id) => elementsById.get(id) ?? null,
    createElement: (tag) => new FakeElement(tag),
    // Both selectors the app uses on document: by class/tag, or "#a [data-x]".
    querySelector: (sel) => (sel === "main" ? mainEl : (matcherFromRoot(root, sel)[0] ?? null)),
    querySelectorAll: (sel) => matcherFromRoot(root, sel),
    addEventListener: (type, fn) => (documentListeners[type] ||= []).push(fn),
    dispatchEvent: (event) => { (documentListeners[event.type] ?? []).forEach((fn) => fn(event)); return true; },
    fire: async (type, event) => { for (const fn of documentListeners[type] ?? []) await fn(event); },
    body: root,
    URL: url,
  };
  globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  globalThis.CSS = { escape: (s) => String(s) };
  const location = new URL(url);
  const nav = { assigned: [], reloads: 0 };
  globalThis.window = {
    location: Object.assign(location, {}),
    addEventListener() {},
    open: (u) => nav.assigned.push(["open", u]),
    innerWidth: 1280,
  };
  // Track href assignments instead of really navigating.
  Object.defineProperty(globalThis.window, "location", {
    value: {
      pathname: location.pathname,
      get href() { return nav.assigned.filter((a) => a[0] === "href").at(-1)?.[1] ?? url; },
      set href(v) { nav.assigned.push(["href", v]); },
      reload() { nav.reloads++; },
      replace(v) { nav.assigned.push(["replace", v]); },
    },
  });
  globalThis.location = globalThis.window.location;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  // lib/storage.mjs reads window.localStorage (so it can catch a sandboxed
  // iframe's SecurityError), so the fake window needs it too.
  globalThis.window.localStorage = globalThis.localStorage;
  setGlobal("navigator", { userAgent: "smoke-test" });
  globalThis.alert = (msg) => { nav.alerts = [...(nav.alerts ?? []), msg]; };
  globalThis.confirm = () => true;
  globalThis.Blob = class { constructor(parts, options = {}) { this.parts = parts; this.type = options.type ?? ""; } };
  // File downloads (blob URL + <a download>.click()) land in nav.downloads.
  const blobs = new Map();
  nav.downloads = [];
  URL.createObjectURL = (blob) => { const href = `blob:fake/${blobs.size + 1}`; blobs.set(href, blob); return href; };
  URL.revokeObjectURL = (href) => void blobs.delete(href);
  globalThis.__onElementClick = (el) => {
    if (el.tagName !== "A" || !el.download) return;
    const blob = blobs.get(el.href);
    nav.downloads.push({ filename: el.download, type: blob?.type, text: blob?.parts.join("") });
  };
  globalThis.fetch = async () => ({ ok: true });

  // XMLHttpRequest backed by the scenario's `xhr(path, params)` function, which
  // returns a JSON-able body (200), or { __status: N } for an HTTP failure.
  globalThis.XMLHttpRequest = class {
    open(method, url) { this.url = url; }
    send() {
      queueMicrotask(() => {
        const [path, query = ""] = this.url.split("?");
        const result = xhr(path, Object.fromEntries(new URLSearchParams(query)));
        this.readyState = 4;
        if (result && result.__status) {
          this.status = result.__status;
          this.responseText = "{}";
        } else {
          this.status = 200;
          this.responseText = JSON.stringify(result ?? {});
        }
        this.onreadystatechange?.();
      });
    }
  };

  return { elements: elementsById, main: mainEl, store, nav, root };
}

function matcherFromRoot(root, sel) {
  // "#container [data-ticker=...]" → search inside the container only.
  const parts = sel.trim().split(/\s+/);
  if (parts.length === 2 && parts[0].startsWith("#")) {
    const container = root.querySelectorAll(parts[0])[0];
    return container ? container.querySelectorAll(parts[1]) : [];
  }
  return root.querySelectorAll(sel);
}

export function installFakeFirebase({ signedInUser = null, watchlistDocs = [], folderDocs = [] } = {}) {
  const calls = [];
  const authListeners = [];
  const auth = {
    currentUser: signedInUser,
    onAuthStateChanged: (fn) => authListeners.push(fn),
  };
  const snapshot = (docs) => ({
    forEach: (fn) => docs.forEach(([id, data]) => fn({ id, data: () => data, ref: { id } })),
  });
  let autoId = 0;
  globalThis.__firebase = {
    calls,
    auth,
    initializeApp: () => ({}),
    getAuth: () => auth,
    getFirestore: () => ({ fake: "db" }),
    signInWithEmailAndPassword: async (_a, email, pw) => {
      calls.push(["signIn", email]);
      if (pw !== "right") throw new Error("auth/invalid-credential");
      return { user: { uid: "u1" } };
    },
    signOut: async () => { calls.push(["signOut"]); auth.currentUser = null; },
    collection: (_db, path) => ({ path, kind: "collection" }),
    doc: (parent, ...segments) => {
      if (parent.kind === "collection") {
        const id = segments[0] ?? `auto${++autoId}`;
        return { path: `${parent.path}/${id}`, id };
      }
      const path = segments.join("/");
      return { path, id: segments.at(-1) };
    },
    getDocs: async (ref) => snapshot(ref.path.endsWith("/watchlist") ? watchlistDocs : folderDocs),
    setDoc: async (ref, data) => void calls.push(["setDoc", ref.path, data]),
    updateDoc: async (ref, data) => void calls.push(["updateDoc", ref.path ?? ref.id, data]),
    deleteDoc: async (ref) => void calls.push(["deleteDoc", ref.path]),
    arrayRemove: (v) => ({ arrayRemove: v }),
    writeBatch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(["set", ref.path, data]),
        update: (ref, data) => ops.push(["update", ref.path, data]),
        commit: async () => void calls.push(["batch", ops]),
      };
    },
  };
  return {
    calls,
    auth,
    // Simulate Firebase announcing the signed-in user to the app.
    async signIn(user) { auth.currentUser = user; for (const fn of authListeners) await fn(user); },
  };
}

export async function flush(times = 6) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}
