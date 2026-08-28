# HireHelper 综合优化设计

**日期：** 2026-08-28  
**状态：** 已批准（方案 2：抽公共层 + 全量优化）  
**范围：** 代码质量 · 速度/成本 · 安全/权限 · 功能体验

## 目标

在不引入构建工具/TypeScript 的前提下，降低维护成本、减少多余 AI 调用与 token、收窄扩展注入面、修流式与取消相关体验问题。

## 非目标

- 不上 Vite / bundler / TypeScript
- 不大改 popup 视觉样式
- 不改动用户私有 `skills/`、`rules/` 正文内容

## 架构

保持现有 MV3 直加载结构：`popup.html` → `ai-config.js` + `ai-service.js` + `generator.js` + `popup.js`；`content.js` 按需注入；`background.js` 截图。

优化集中在 `ai-service.js`（抽取 prompt/请求/JSON 解析）与 `popup.js`（扫描、条件 AI 提取、流式计数、abort），以及 `manifest.json` 权限收窄。

## 1. 代码质量

在 `ai-service.js` 内抽取（不拆多文件构建）：

| 单元 | 职责 |
|------|------|
| `buildPromptMessages(companyInfo, userProfile, options)` | 统一 system/user 消息；`generate` 与 `generateStream` 共用 |
| `chatRequest({ messages, stream, signal, maxTokens, temperature })` | 统一 baseUrl、鉴权、错误正文截断 |
| `parseJsonLoose(content)` | Vision / 文本提取共用的宽松 JSON 解析 |

`analyzeImage` 仍保留多模态 content 结构，但文本部分与错误处理尽量复用上述单元。

## 2. 速度与成本

1. **扫描等待**：去掉固定 500ms；注入后立即 `EXTRACT_INFO`，失败再短重试（约 100ms × 3）。
2. **条件 AI 提取**：仅当 `companyName` 与 `jobTitle` 均缺失（或等价「严重不完整」）时调用 `extractInfoFromText`；否则直接用 CSS 抓取结果生成话术。
3. **简历注入**：默认不注入完整 `RESUME.md`；设置页增加「注入完整简历」开关（`includeResume`，默认 `false`）；开启时截断到约 2500 字符。
4. **粘贴流程**：去掉无意义的 `setTimeout(500)`。

## 3. 安全与权限

1. **content_scripts.matches**：从 `<all_urls>` 改为招聘站域名列表（boss/zhipin、lagou、liepin、zhaopin、51job、michaung 等）。扫描时仍可通过 `scripting.executeScript` 注入当前页。
2. **host_permissions**：保留较宽的 `https://*/*`（自定义 OpenAI 兼容 API 域名不可枚举）；在 README 说明原因。不引入 `http://*/*`（若现有有则去掉）。
3. **配置示例**：新增 `ai-config.example.js`（无真实 Key）；`ai-config.js` 继续 gitignore。
4. **设置页**：API Key 输入使用 `type="password"`。

## 4. 功能体验

1. 流式结果计数使用独立变量 `streamedCount`，不依赖 `children.length - 1`。
2. 刷新：abort 后可靠重新生成（保证 `finally` 清理后再启，或刷新路径显式重置 `isAiGenerating`）。
3. `analyzeImage` / `extractInfoFromText` / `chatRequest` 支持 `AbortSignal`。
4. BOSS 选择器在现有列表前增加常见新版选择器，保留兜底。
5. 保存 AI/档案设置后调用 `AIService.invalidateContextCache()`。

## 5. 数据流（优化后扫描）

```
点击识别 → executeScript(content.js) → EXTRACT_INFO（短重试）
  → 若字段严重缺失且 AI 开 → extractInfoFromText（可 abort）
  → generateStream / 本地 generate
```

## 6. 测试计划（手动）

- [ ] 在 BOSS 职位页：识别 → 有公司/职位时不触发「AI 正在分析页面」
- [ ] 字段为空的页面：仍可 AI 提取后生成
- [ ] 流式逐条出现，计数正确；刷新可中断并重生成
- [ ] 关闭/开启「注入完整简历」后话术上下文行为符合预期
- [ ] 非招聘站打开 popup 仍可粘贴/截图；扫描注入不依赖静态 content_scripts
- [ ] 设置页 Key 为密文显示；保存后重新加载扩展配置仍可用

## 决策记录

- 选方案 2 而非原地补丁或 TS 重写。
- RESUME 默认关闭以省 token；需要深度匹配时手动开启。
- content script 静态匹配收窄；activeTab + scripting 覆盖临时页。
