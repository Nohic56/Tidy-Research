const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../extension/core.js');
const code = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const event = () => ({ listeners: [], addListener(fn, ...args) { this.listeners.push(fn); this.args = args; } });
function fixture(shared = {}) {
  const local = shared.local || {};
  const session = shared.session || {};
  const tabs = shared.tabs || new Map([[1, { id: 1, url: 'https://example.org/?id=42&utm_source=chatgpt.com' }]]);
  const calls = { navigations: [], created: [], badges: [], menus: [], clipboard: [] };
  const onChanged = event();
  const area = (data, name) => ({
    async get(key) { return key == null ? { ...data } : { [key]: data[key] }; },
    async set(values) { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: data[key], newValue: value }; data[key] = value; } for (const fn of onChanged.listeners) fn(changes, name); },
    async remove(key) { delete data[key]; }
  });
  const browser = {
    storage: { local: area(local, 'local'), session: area(session, 'session'), onChanged },
    runtime: { id: '@test', getURL: p => 'moz-extension://test/' + p, onInstalled: event(), onMessage: event() },
    webRequest: { onBeforeRequest: event() },
    tabs: { onUpdated: event(), onRemoved: event(), async get(id) { return { ...tabs.get(id) }; }, async update(id, value) { if (typeof id === 'object') { value = id; id = 1; } calls.navigations.push(value.url); Object.assign(tabs.get(id), value); }, async create(value) { calls.created.push(value); } },
    action: { async setBadgeText(value) { calls.badges.push(value); }, async setBadgeBackgroundColor() {} },
    contextMenus: { create(value) { calls.menus.push(value); }, async removeAll() { calls.menus = []; }, onClicked: event() },
    omnibox: { setDefaultSuggestion() {}, onInputChanged: event(), onInputEntered: event() },
    scripting: { async executeScript(value) {
      const tab = tabs.get(value.target.tabId);
      let href = tab.url;
      const state = { form: 'keep me' };
      const history = { state, replaceState(nextState, title, url) { assert.equal(nextState, state); href = url; } };
      const ctx = vm.createContext({ location: { get href() { return href; } }, history });
      const fn = vm.runInContext('(' + value.func.toString() + ')', ctx);
      const result = fn(...value.args);
      tab.url = href;
      return [{ result }];
    } }
  };
  vm.runInNewContext(code, { browser, TidyResearch: C, URL, Date, console, navigator: { clipboard: { async writeText(value) { calls.clipboard.push(value); } } } });
  const sender = { id: '@test', url: browser.runtime.getURL('popup.html') };
  const message = (value, origin = sender) => browser.runtime.onMessage.listeners[0](value, origin);
  const intercept = value => browser.webRequest.onBeforeRequest.listeners[0]({ tabId: 1, requestId: 'request1', method: 'GET', url: tabs.get(1).url, ...value });
  return { browser, calls, tabs, local, session, message, intercept };
}
test('registers only main-frame HTTP(S) navigation interception', () => {
  const f = fixture();
  assert.deepEqual([...f.browser.webRequest.onBeforeRequest.args[0].types], ['main_frame']);
  assert.deepEqual([...f.browser.webRequest.onBeforeRequest.args[1]], ['blocking']);
});
test('redirects before navigation and stores an undo record in session memory', async () => {
  const f = fixture();
  const response = await f.intercept();
  assert.equal(response.redirectUrl, 'https://example.org/?id=42');
  assert.equal(f.session['tab:1'].original, f.tabs.get(1).url);
  assert.equal(f.local['tab:1'], undefined);
});
test('does not rewrite POST forms, non-tab requests, or protected links', async () => {
  const f = fixture();
  for (const value of [{ method: 'POST' }, { tabId: -1 }, { url: 'https://e.org/?token=x&utm_source=y' }]) assert.equal(Object.keys(await f.intercept(value)).length, 0);
});
test('automatic cleaning respects saved off switch and site exceptions', async () => {
  const f = fixture({ local: { settings: { autoClean: false } } });
  assert.equal(Object.keys(await f.intercept()).length, 0);
  await f.message({ type: 'setSettings', patch: { autoClean: true, excludedHosts: ['example.org'] } });
  assert.equal(Object.keys(await f.intercept()).length, 0);
});
test('settings reload after the event page is suspended and recreated', async () => {
  const first = fixture();
  await first.message({ type: 'setSettings', patch: { autoClean: false } });
  const second = fixture({ local: first.local, session: first.session, tabs: first.tabs });
  assert.equal(Object.keys(await second.intercept()).length, 0);
});
test('clean current address preserves history state without a navigation', async () => {
  const f = fixture();
  const result = await f.message({ type: 'cleanCurrent', tabId: 1 });
  assert.equal(result.url, 'https://example.org/?id=42');
  assert.equal(f.tabs.get(1).url, result.url);
  assert.equal(f.calls.navigations.length, 0);
});
test('undo opens original once and bypass survives an event-page restart', async () => {
  const f = fixture();
  await f.message({ type: 'cleanCurrent', tabId: 1 });
  assert((await f.message({ type: 'restore', tabId: 1 })).restored);
  const restarted = fixture({ local: f.local, session: f.session, tabs: f.tabs });
  assert.equal(Object.keys(await restarted.intercept()).length, 0);
  f.session['tab:1'].bypassUntil = 0;
  assert((await restarted.intercept()).redirectUrl);
});
test('cannot restore a stale original on another page', async () => {
  const f = fixture();
  await f.message({ type: 'cleanCurrent', tabId: 1 });
  f.tabs.get(1).url = 'https://another.org/';
  assert((await f.message({ type: 'restore', tabId: 1 })).error);
});
test('content scripts and outside senders cannot invoke privileged actions', () => {
  const f = fixture();
  for (const sender of [{ id: '@test', url: 'https://duckduckgo.com/', tab: { id: 1 } }, { id: '@other', url: 'moz-extension://test/popup.html' }, { id: '@test', url: 'moz-extension://test/evil.html' }]) assert.equal(f.message({ type: 'cleanCurrent', tabId: 1 }, sender), undefined);
});
test('full-tab options page can save settings', async () => {
  const f = fixture();
  const result = await f.message({ type: 'setSettings', patch: { searchLinks: false } }, { id: '@test', url: 'moz-extension://test/options.html', tab: { id: 2 } });
  assert.equal(result.config.searchLinks, false);
});
test('loop protection stops sites repeatedly adding the same tracker', async () => {
  const f = fixture();
  for (let count = 0; count < 3; count++) assert((await f.intercept()).redirectUrl);
  assert.equal(Object.keys(await f.intercept()).length, 0);
});
test('closing a tab removes its undo data', async () => {
  const f = fixture();
  await f.intercept();
  f.browser.tabs.onRemoved.listeners[0](1);
  await Promise.resolve();
  assert.equal(f.session['tab:1'], undefined);
});
test('omnibox navigation is explicit, encoded and respects new background tabs', async () => {
  const f = fixture();
  await f.browser.omnibox.onInputEntered.listeners[0]('P04637', 'currentTab');
  assert.equal(f.calls.navigations[0], 'https://www.uniprot.org/uniprotkb/P04637/entry');
  await f.browser.omnibox.onInputEntered.listeners[0]('pubmed APC/C', 'newBackgroundTab');
  assert.equal(f.calls.created[0].active, false);
  assert.equal(f.calls.created[0].url, 'https://pubmed.ncbi.nlm.nih.gov/?term=APC%2FC');
});
