# HireHelper Comprehensive Optimization Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This extension has no automated test runner — verify with the manual checklist in the design spec.

**Goal:** Ship code-quality extractions AI helpers, faster/cheaper scan+generate path, narrower content-script permissions, and streaming/abort UX fixes without introducing a bundler.

**Architecture:** Keep MV3 plain JS. Refactor inside `ai-service.js` (`buildPromptMessages`, `chatRequest`, `parseJsonLoose`). Update `popup.js` scan/generate flows, `manifest.json` matches, settings UI for resume toggle + password key field, add `ai-config.example.js`.

**Tech Stack:** Chrome Extension MV3, vanilla JS, OpenAI-compatible Chat Completions + SSE

**Spec:** `docs/superpowers/specs/2026-08-28-comprehensive-optimization-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `ai-service.js` | Shared prompt/request/JSON; resume optional; AbortSignal |
| `popup.js` | Fast scan, conditional extract, stream count, refresh race, cache invalidate |
| `popup.html` | Password API key; includeResume checkbox |
| `manifest.json` | Narrow content_scripts; drop http host if present |
| `content.js` | BOSS selector refresh |
| `ai-config.example.js` | Safe template without secrets |
| `README.md` | Document resume toggle + permission rationale |

---

### Task 1: Shared helpers in ai-service.js

**Files:**
- Modify: `ai-service.js`

- [ ] **Step 1: Add `parseJsonLoose`**

Extract from `analyzeImage` / `extractInfoFromText`:

```js
function parseJsonLoose(content) {
  if (!content) return null;
  try {
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 2: Add `chatRequest`**

Unify URL, headers, error handling; support `stream`, `signal`, `maxTokens`, `temperature`, and optional multimodal `messages` already built by caller.

```js
async function chatRequest(config, { messages, stream = false, signal, maxTokens, temperature }) {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: temperature ?? config.temperature,
      max_tokens: maxTokens ?? config.maxTokens,
      stream,
      messages
    }),
    signal
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const err = new Error(`AI API 请求失败 (${response.status}): ${errorBody.substring(0, 200)}`);
    err.status = response.status;
    err.body = errorBody;
    throw err;
  }
  return response;
}
```

- [ ] **Step 3: Add `buildPromptMessages`**

Options: `{ count, includeResume, resumeMaxChars = 2500 }`. Load context via `loadContextFiles()`. Only append resume when `includeResume` is true (truncate). Return `{ messages }` for chat completions. Used by `generate` and `generateStream`.

- [ ] **Step 4: Wire `generate` / `generateStream` / callers through helpers**

Replace duplicated prompt blocks and raw `fetch` with the helpers. Keep stream SSE parsing in `generateStream`. Pass `signal` into `chatRequest`.

- [ ] **Step 5: Commit**

```bash
git add ai-service.js
git commit -m "refactor: extract shared AI prompt and request helpers"
```

---

### Task 2: Resume toggle + AbortSignal on extract/vision

**Files:**
- Modify: `ai-service.js`
- Modify: `popup.html`
- Modify: `popup.js`

- [ ] **Step 1: Settings UI**

In AI settings section of `popup.html`:

- API Key: `type="password"` `autocomplete="off"`
- Checkbox: `id="includeResume"` — label「生成时注入完整简历（更准，更耗 token）」

- [ ] **Step 2: Persist `includeResume`**

Load/save with `aiConfig` or separate `chrome.storage.local` key `includeResume` (boolean, default false). Pass into `generateStream` / `generate` / `analyzeImage` options.

- [ ] **Step 3: AbortSignal on `extractInfoFromText` and `analyzeImage`**

Accept `options.signal`; pass to `chatRequest`.

- [ ] **Step 4: On save settings call `AIService.invalidateContextCache()`**

- [ ] **Step 5: Commit**

```bash
git add ai-service.js popup.html popup.js
git commit -m "feat: optional resume injection and abortable AI calls"
```

---

### Task 3: Faster scan + conditional extract + streaming UX

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Replace scan delay**

After `executeScript`, immediately `sendMessage`; on failure retry up to 3 times with `100ms` delay. Remove initial `500ms` wait and `400ms` loop.

- [ ] **Step 2: Conditional `extractInfoFromText`**

Call only when AI enabled AND `!(info.companyName && info.jobTitle)` (or both empty). Otherwise skip toast「AI 正在分析页面」.

- [ ] **Step 3: Stream count**

Use `let streamedCount = 0` in `generateAndDisplay`; increment in `onGreeting`; display that count. Remove `children.length - 1`.

- [ ] **Step 4: Refresh race**

On refresh: abort; in `finally` of previous run clear flags; start new generation. Ensure `isAiGenerating` does not block legitimate refresh — e.g. abort first then `await` microtask/`finally` before restart, or force-reset flags before calling `generateAndDisplay`.

- [ ] **Step 5: Remove paste `setTimeout(500)`** — call `handleExtractedInfo` immediately.

- [ ] **Step 6: Commit**

```bash
git add popup.js
git commit -m "perf: speed up scan and fix streaming count/refresh"
```

---

### Task 4: Permissions + content selectors + example config

**Files:**
- Modify: `manifest.json`
- Modify: `content.js`
- Create: `ai-config.example.js`
- Modify: `README.md`

- [ ] **Step 1: Narrow content_scripts**

```json
"matches": [
  "*://*.zhipin.com/*",
  "*://*.lagou.com/*",
  "*://*.liepin.com/*",
  "*://*.zhaopin.com/*",
  "*://*.51job.com/*",
  "*://*.michaung.com/*"
]
```

Keep `host_permissions` as `https://*/*` for arbitrary AI bases; remove `http://*/*` if present. Bump version to `1.1.0`.

- [ ] **Step 2: BOSS selectors**

Prepend selectors commonly used on current BOSS job detail pages for name/title/desc (keep existing fallbacks).

- [ ] **Step 3: Add `ai-config.example.js`**

Copy structure from README sample with placeholder `apiKey: "sk-xxx"`.

- [ ] **Step 4: README**

Document resume toggle, content_scripts narrowing, why host_permissions stay broad, point to example config file.

- [ ] **Step 5: Commit**

```bash
git add manifest.json content.js ai-config.example.js README.md
git commit -m "chore: tighten content scripts and add config example"
```

---

### Task 5: Manual verification

- [ ] Reload extension in `chrome://extensions`
- [ ] Run design-spec manual checklist
- [ ] Fix any regressions found

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| buildPromptMessages / chatRequest / parseJsonLoose | 1 |
| Fast scan / conditional extract / paste delay | 3 |
| Resume optional | 2 |
| Narrow content_scripts / example config / password key | 2, 4 |
| Stream count / refresh / abort / invalidate cache / BOSS | 2, 3, 4 |
