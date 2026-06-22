// ========================================
// 招聘助手 - AI 服务模块
// 基于 OpenAI 兼容 API 生成话术
// 每次调用自动携带 skills/ 和 rules/ 文件夹内容
// ========================================

const AIService = (() => {

  // ===== 上下文文件缓存（skills/rules/resume/examples） =====
  let _contextCache = null;     // { skills, resume, rules, examples }
  let _contextCacheTime = 0;
  const CONTEXT_CACHE_TTL = 5 * 60 * 1000; // 5 分钟自动过期

  /**
   * 获取完整的 AI 配置
   * 优先使用页面设置（chrome.storage.local），fallback 到 ai-config.js
   * @returns {Promise<Object>}
   */
  async function getConfig() {
    const fileConfig = (typeof AI_CONFIG !== 'undefined') ? AI_CONFIG : {};

    // 从 storage 读取页面设置
    const stored = await new Promise(resolve => {
      chrome.storage.local.get('aiConfig', result => resolve(result.aiConfig || {}));
    });

    // 页面设置优先，fallback 到文件配置
    return {
      apiKey: stored.apiKey || fileConfig.apiKey || '',
      baseUrl: stored.baseUrl || fileConfig.baseUrl || 'https://api.openai.com/v1',
      model: stored.model || fileConfig.model || 'gpt-4o-mini',
      temperature: stored.temperature ?? fileConfig.temperature ?? 0.8,
      maxTokens: stored.maxTokens ?? fileConfig.maxTokens ?? 2048,
      systemPrompt: stored.systemPrompt || fileConfig.systemPrompt || '',
    };
  }

  /**
   * 检查 AI 配置是否可用
   * @returns {Promise<boolean>}
   */
  async function isConfigured() {
    const config = await getConfig();
    return config.apiKey && config.apiKey.length > 0;
  }

  /**
   * 读取扩展内的文本文件
   * @param {string} path - 相对于扩展根目录的路径
   * @returns {Promise<string>} 文件内容，失败返回空字符串
   */
  async function readFile(path) {
    try {
      const url = chrome.runtime.getURL(path);
      const resp = await fetch(url);
      if (!resp.ok) return '';
      return await resp.text();
    } catch (e) {
      console.warn(`读取 ${path} 失败:`, e);
      return '';
    }
  }

  /**
   * 从 skills/ 和 rules/ 文件夹加载上下文文件
   * 自动缓存处理后的结果，5 分钟过期或调用 invalidateContextCache() 清除
   * @returns {Promise<{skills: string, resume: string, rules: string}>}
   */
  async function loadContextFiles() {
    const now = Date.now();
    if (_contextCache && (now - _contextCacheTime) < CONTEXT_CACHE_TTL) {
      return _contextCache;
    }

    const [skillsContent, resumeContent, rulesContent] = await Promise.all([
      readFile('skills/SKILL.md'),
      readFile('skills/RESUME.md'),
      readFile('rules/RULES.md')
    ]);

    _contextCache = {
      skills:    extractUsefulContent(skillsContent),
      resume:    extractUsefulContent(resumeContent),
      rules:     extractUsefulContent(rulesContent),
      examples:  extractExamples(rulesContent)
    };
    _contextCacheTime = now;
    return _contextCache;
  }

  /**
   * 手动使上下文缓存失效（修改 skills/rules 后调用）
   */
  function invalidateContextCache() {
    _contextCache = null;
    _contextCacheTime = 0;
  }

  /**
   * 清理 Markdown 内容，去掉纯注释/提示行，只保留有效文本
   * @param {string} md
   * @returns {string}
   */
  function extractUsefulContent(md) {
    if (!md) return '';
    return md
      .split('\n')
      .map(line => line.trim())
      // 去掉纯注释行（<!-- -->）、分隔线、空行、纯标题行
      .filter(line => {
        if (!line) return false;
        if (line.startsWith('<!--')) return false;
        if (/^[-=#*]{3,}$/.test(line)) return false;
        if (line.startsWith('>')) return true;  // 保留引用块内容
        return true;
      })
      .join('\n')
      .trim();
  }

  /**
   * 从 rules Markdown 中提取示例话术（## 示例 之后的 - 开头行）
   * @param {string} md
   * @returns {string[]} 示例话术数组
   */
  function extractExamples(md) {
    if (!md) return [];
    const lines = md.split('\n');
    const examples = [];
    let inExampleSection = false;

    for (const raw of lines) {
      const line = raw.trim();
      // 进入示例区块
      if (/^#{1,3}\s*示例/.test(line)) {
        inExampleSection = true;
        continue;
      }
      // 遇到新的标题，退出示例区块
      if (inExampleSection && /^#{1,3}\s/.test(line)) break;
      // 提取示例行
      if (inExampleSection && line.startsWith('- ')) {
        const text = line.slice(2).trim();
        if (text.length > 0) examples.push(text);
      }
    }
    return examples;
  }

  /**
   * 从 API 响应中提取助手文本
   * 推理模型（如 mimo-v2.5-pro）可能把 token 耗在 reasoning_content，导致 content 为空
   * @param {Object} choice
   * @returns {string}
   */
  function extractAssistantText(choice) {
    const message = choice?.message || {};
    const content = (message.content || '').trim();
    if (content) return content;

    const reasoning = (message.reasoning_content || '').trim();
    if (!reasoning) return '';

    // 从思考内容中提取引号包裹的候选话术
    const quoted = [...reasoning.matchAll(/["「]([^"」\n]{4,200})["」]/g)]
      .map(m => m[1].trim())
      .filter(Boolean);
    if (quoted.length > 0) return quoted.join('\n');

    return '';
  }

  /**
   * 调用 Chat Completions API
   * @param {Object} config
   * @param {Array} messages
   * @param {Object} overrides
   * @returns {Promise<Object>}
   */
  async function callChatCompletion(config, messages, overrides = {}) {
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: overrides.maxTokens ?? config.maxTokens,
        messages
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`AI API 请求失败 (${response.status}): ${errorBody.substring(0, 200)}`);
    }

    return response.json();
  }

  /**
   * 解析 AI 返回的话术行
   * @param {string} content
   * @returns {Array<{text: string, type: string}>}
   */
  function parseGreetingLines(content) {
    return content
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)、]\s*/, '').replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length >= 4 && line.length <= 200)
      .map(text => ({ text, type: 'ai' }));
  }

  /**
   * 构建示例话术文本块
   * @param {string[]} examples
   * @returns {string}
   */
  function buildExamplesText(examples) {
    if (!examples || examples.length === 0) return '';
    return '## 示例话术（参考风格和长度，不要照搬内容）\n' +
      examples.map(e => '- ' + e).join('\n');
  }

  /**
   * 构建公司信息摘要
   * @param {Object} companyInfo
   * @returns {string}
   */
  function buildCompanyInfoText(companyInfo) {
    const parts = [];
    if (companyInfo.companyName) parts.push('公司名称：' + companyInfo.companyName);
    if (companyInfo.jobTitle) parts.push('职位：' + companyInfo.jobTitle);
    if (companyInfo.companyDesc) parts.push('公司介绍：' + companyInfo.companyDesc.substring(0, 300));
    if (companyInfo.requirements) parts.push('岗位要求：' + companyInfo.requirements.substring(0, 300));
    if (companyInfo.benefits) parts.push('福利待遇：' + companyInfo.benefits.substring(0, 200));
    if (companyInfo.industry) parts.push('行业：' + companyInfo.industry);
    if (companyInfo.companySize) parts.push('公司规模：' + companyInfo.companySize);
    if (parts.length === 0 && companyInfo.rawText) {
      parts.push('页面文本：' + companyInfo.rawText.substring(0, 500));
    }
    return parts.join('\n') || '未识别到公司信息';
  }

  /**
   * 调用 AI API 生成话术
   * 自动读取 skills/SKILL.md 和 rules/RULES.md 并注入 prompt
   * @param {Object} companyInfo - 公司信息
   * @param {Object} userProfile - 用户档案（设置页的技能/亮点）
   * @param {Object} options - 额外选项
   * @returns {Promise<Array>} 生成的话术列表
   */
  async function generate(companyInfo, userProfile, options = {}) {
    const config = await getConfig();

    if (!config.apiKey) {
      throw new Error('AI 未配置：请在设置页面填写 API Key，或在 ai-config.js 中配置');
    }

    const { count = 8 } = options;

    // 1. 加载文件上下文（自动缓存）
    const { skills: skillsText, resume: resumeText, rules: rulesText, examples } = await loadContextFiles();

    // 2. 构建 system prompt（规则 + 基础角色）
    const basePrompt = config.systemPrompt
      ? config.systemPrompt
      : '你是一个专业的招聘助手。根据公司信息和用户资料，生成简短的打招呼话术。';

    const systemParts = [
      basePrompt,
      '直接输出最终话术文本，不要输出思考过程、分析说明或 markdown。'
    ];
    if (rulesText) {
      systemParts.push('', '## 输出规则（必须严格遵守）', rulesText);
    }

    // 3. 构建 user message（示例 + 公司信息 + 个人档案 + 设置页补充）
    const userParts = [];

    // 示例 few-shot（放在最前面，让模型先理解风格和长度）
    const examplesText = buildExamplesText(examples);
    if (examplesText) {
      userParts.push(examplesText, '');
    }

    if (skillsText) {
      userParts.push('## 个人能力概要', skillsText);
    }
    if (resumeText) {
      userParts.push('', '## 完整简历', resumeText);
    }

    // 设置页的技能/亮点作为补充
    const profileParts = [];
    if (userProfile.skills && userProfile.skills.length > 0) {
      profileParts.push('技能标签：' + userProfile.skills.join('、'));
    }
    if (userProfile.highlights && userProfile.highlights.length > 0) {
      profileParts.push('亮点优势：' + userProfile.highlights.join('、'));
    }
    if (profileParts.length > 0) {
      userParts.push('', '## 设置页补充信息', profileParts.join('\n'));
    }

    userParts.push('', '## 目标公司信息', buildCompanyInfoText(companyInfo));
    userParts.push('', `请生成 ${count} 条打招呼话术，参考上方示例的风格和长度。`);

    // 4. 调用 API（推理模型需更大 max_tokens，否则思考占满配额导致 content 为空）
    const messages = [
      { role: 'system', content: systemParts.join('\n') },
      { role: 'user', content: userParts.join('\n') }
    ];

    let data = await callChatCompletion(config, messages);
    let choice = data.choices?.[0];
    let content = extractAssistantText(choice);

    if (!content && choice?.finish_reason === 'length' && choice?.message?.reasoning_content) {
      console.warn('推理模型 content 为空，自动加大 max_tokens 重试');
      data = await callChatCompletion(config, messages, {
        maxTokens: Math.max(config.maxTokens * 2, 2048)
      });
      choice = data.choices?.[0];
      content = extractAssistantText(choice);
    }

    if (!content) {
      const finishReason = choice?.finish_reason || 'unknown';
      throw new Error(
        `AI 返回内容为空（finish_reason: ${finishReason}）。` +
        '推理模型请把 ai-config.js 的 maxTokens 调到 2048 以上。'
      );
    }

    // 5. 解析返回的话术（按换行分隔，去编号）
    const lines = parseGreetingLines(content);
    if (lines.length === 0) {
      throw new Error('AI 返回内容无法解析为话术，请检查 rules/RULES.md 格式要求');
    }

    return lines;
  }

  /**
   * 压缩图片 data URL，避免因过大导致 API 请求失败
   * @param {string} dataUrl - 原始图片 data URL
   * @param {number} maxWidth - 最大宽度
   * @param {number} quality - JPEG 质量 0-1
   * @returns {Promise<string>} 压缩后的 data URL
   */
  async function compressImage(dataUrl, maxWidth = 1280, quality = 0.75) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl); // 加载失败则返回原图
      img.src = dataUrl;
    });
  }

  /**
   * 使用 AI Vision 分析截图内容，提取公司信息
   * @param {string} imageDataUrl - 截图的 data URL
   * @param {Object} userProfile - 用户档案
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} { success, data?, results?, unsupportedVision? }
   */
  async function analyzeImage(imageDataUrl, userProfile, options = {}) {
    const config = await getConfig();

    if (!config.apiKey) {
      throw new Error('AI 未配置：请在设置页面填写 API Key');
    }

    const { count = 8 } = options;

    // 加载文件上下文（自动缓存）
    const { skills: skillsText, resume: resumeText, rules: rulesText, examples } = await loadContextFiles();

    const basePrompt = config.systemPrompt
      ? config.systemPrompt
      : '你是一个专业的招聘助手。根据图片中的公司信息和用户资料，提取信息并生成简短的打招呼话术。';

    const systemParts = [basePrompt];
    if (rulesText) {
      systemParts.push('', '## 输出规则', rulesText);
    }

    // 从图片中提取公司信息，然后生成话术
    const userParts = [];

    // 示例 few-shot
    const examplesText = buildExamplesText(examples);
    if (examplesText) {
      userParts.push(examplesText, '');
    }

    userParts.push('请先识别图片中的公司名称、职位、公司介绍/岗位要求等信息，以JSON格式输出信息，然后再生成打招呼话术。');
    userParts.push('请按以下JSON格式返回（不要包含markdown代码块标记）：');
    userParts.push('{"companyName":"公司名称","jobTitle":"职位","companyDesc":"公司介绍","requirements":"岗位要求","greetings":["话术1","话术2",...]}');
    userParts.push('greetings 中的话术请参考上方示例的风格和长度。');

    if (skillsText) {
      userParts.push('', '## 个人能力概要', skillsText);
    }
    if (resumeText) {
      userParts.push('', '## 完整简历', resumeText);
    }

    const profileParts = [];
    if (userProfile.skills && userProfile.skills.length > 0) {
      profileParts.push('技能标签：' + userProfile.skills.join('、'));
    }
    if (userProfile.highlights && userProfile.highlights.length > 0) {
      profileParts.push('亮点优势：' + userProfile.highlights.join('、'));
    }
    if (profileParts.length > 0) {
      userParts.push('', '## 设置页补充信息', profileParts.join('\n'));
    }

    // 压缩图片避免过大
    const compressedImage = await compressImage(imageDataUrl, 1280, 0.75);

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const { model, temperature, maxTokens } = config;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemParts.join('\n') },
          {
            role: 'user',
            content: [
              { type: 'text', text: userParts.join('\n') },
              {
                type: 'image_url',
                image_url: {
                  url: compressedImage,
                  detail: 'auto'
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');

      // 检测是否是不支持 vision 的错误
      const isVisionUnsupported =
        errorBody.includes('image_url') ||
        errorBody.includes('vision') ||
        errorBody.includes('multimodal') ||
        errorBody.includes('not support') ||
        errorBody.includes('does not support') ||
        errorBody.includes('unsupported') ||
        errorBody.includes('model does not exist') && !errorBody.includes('invalid_api_key');

      if (isVisionUnsupported) {
        return { success: false, unsupportedVision: true, error: '当前模型不支持图片识别' };
      }

      throw new Error(`AI API 请求失败 (${response.status}): ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      // 常见于不支持多模态的模型：返回了 200 但 content 为空
      const finishReason = data.choices?.[0]?.finish_reason || '';
      console.warn('AI 返回内容为空, finish_reason:', finishReason, '完整响应前300字符:', JSON.stringify(data).substring(0, 300));

      // 如果 finish_reason 是 stop/content_filter/length 但内容为空，大概率模型不支持图片
      if (finishReason === 'stop' || finishReason === 'content_filter' || finishReason === 'length') {
        return { success: false, unsupportedVision: true, error: '当前模型不支持图片识别（返回空内容）' };
      }

      throw new Error('AI 返回内容为空，可能是模型不支持图片或图片过大');
    }

    // 尝试解析 JSON 格式的返回
    let parsed;
    try {
      // 清理可能的 markdown 代码块标记
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(cleaned);
      }
    } catch (e) {
      // JSON 解析失败，fallback 到按行解析
      const lines = content
        .split('\n')
        .map(line => line.replace(/^\d+[\.\)、]\s*/, '').replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length >= 4 && line.length <= 30);

      return {
        success: true,
        data: { companyName: '', jobTitle: '', companyDesc: '', requirements: '' },
        results: lines.map(text => ({ text, type: 'ai' }))
      };
    }

    const greetings = (parsed.greetings || []).map(text => ({
      text,
      type: 'ai'
    }));

    return {
      success: true,
      data: {
        companyName: parsed.companyName || '',
        jobTitle: parsed.jobTitle || '',
        companyDesc: parsed.companyDesc || '',
        requirements: parsed.requirements || ''
      },
      results: greetings
    };
  }

  /**
   * 使用 AI 从页面原始文本中提取结构化公司信息
   * @param {string} rawText - 页面原始文本
   * @returns {Promise<Object>} { success, data?: { companyName, jobTitle, companyDesc, requirements } }
   */
  async function extractInfoFromText(rawText) {
    const config = await getConfig();

    if (!config.apiKey) {
      throw new Error('AI 未配置：请在设置页面填写 API Key');
    }

    if (!rawText || rawText.length < 20) {
      return { success: false, error: '页面文本内容不足' };
    }

    const text = rawText.substring(0, 4000); // 限制长度避免 token 超限

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const { model, temperature, maxTokens } = config;

    const systemPrompt = '你是一个专业的信息提取助手。从给定的文本中提取招聘相关信息。只返回 JSON，不要包含任何其他内容。';
    const userPrompt = `请从以下页面文本中提取招聘信息，以JSON格式返回（不要包含markdown代码块标记）：
{"companyName":"公司名称","jobTitle":"职位名称","companyDesc":"公司介绍/业务描述","requirements":"岗位要求/职位描述"}

如果某个字段无法识别，填空字符串""。

页面文本：
${text}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: temperature ?? 0.3,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`AI API 请求失败 (${response.status}): ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    // 解析 JSON
    try {
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);

      return {
        success: true,
        data: {
          companyName: parsed.companyName || '',
          jobTitle: parsed.jobTitle || '',
          companyDesc: parsed.companyDesc || '',
          requirements: parsed.requirements || ''
        }
      };
    } catch (e) {
      console.warn('AI 信息提取 JSON 解析失败:', e);
      return { success: false, error: 'AI 返回格式解析失败' };
    }
  }

  /**
   * 解析 SSE 流中的增量文本，返回已积累的完整文本和新解析的话术
   * @param {string} accumulated - 到目前为止积累的完整文本
   * @param {Function} onGreeting - 每解析出一条新话术时的回调 (greeting: {text, type}) => void
   * @param {Set} seenTexts - 已输出的话术文本集合（去重用）
   * @returns {{ parsed: number }} 本次新解析出的话术数量
   */
  function parseStreamChunk(accumulated, onGreeting, seenTexts) {
    // 按换行切分，最后一条可能还不完整（没有换行符结尾），跳过它
    const lines = accumulated.split('\n');
    let newCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const isLast = i === lines.length - 1;
      // 最后一行如果没有换行结尾，可能还没收完，跳过
      if (isLast && !accumulated.endsWith('\n')) continue;

      let line = lines[i]
        .replace(/^\d+[\.\)、]\s*/, '')
        .replace(/^[-*]\s*/, '')
        .trim();

      if (line.length < 4 || line.length > 200) continue;
      if (seenTexts.has(line)) continue;

      seenTexts.add(line);
      onGreeting({ text: line, type: 'ai' });
      newCount++;
    }

    return newCount;
  }

  /**
   * 流式调用 AI API 生成话术（SSE）
   * 与 generate() 功能相同，但通过回调逐条返回话术，体感更快
   *
   * @param {Object} companyInfo - 公司信息
   * @param {Object} userProfile - 用户档案（设置页的技能/亮点）
   * @param {Object} options - { count?: number, onGreeting?: (greeting) => void, signal?: AbortSignal }
   * @returns {Promise<Array>} 最终的完整话术列表
   */
  async function generateStream(companyInfo, userProfile, options = {}) {
    const config = await getConfig();

    if (!config.apiKey) {
      throw new Error('AI 未配置：请在设置页面填写 API Key，或在 ai-config.js 中配置');
    }

    const { count = 8, onGreeting, signal } = options;

    // 1. 加载文件上下文（自动缓存）
    const { skills: skillsText, resume: resumeText, rules: rulesText, examples } = await loadContextFiles();

    // 2. 构建 system prompt
    const basePrompt = config.systemPrompt
      ? config.systemPrompt
      : '你是一个专业的招聘助手。根据公司信息和用户资料，生成简短的打招呼话术。';

    const systemParts = [
      basePrompt,
      '直接输出最终话术文本，不要输出思考过程、分析说明或 markdown。'
    ];
    if (rulesText) {
      systemParts.push('', '## 输出规则（必须严格遵守）', rulesText);
    }

    // 3. 构建 user message（示例 + 公司信息 + 个人档案）
    const userParts = [];

    // 示例 few-shot（放在最前面，让模型先理解风格和长度）
    const examplesText = buildExamplesText(examples);
    if (examplesText) {
      userParts.push(examplesText, '');
    }

    if (skillsText) {
      userParts.push('## 个人能力概要', skillsText);
    }
    if (resumeText) {
      userParts.push('', '## 完整简历', resumeText);
    }

    const profileParts = [];
    if (userProfile.skills && userProfile.skills.length > 0) {
      profileParts.push('技能标签：' + userProfile.skills.join('、'));
    }
    if (userProfile.highlights && userProfile.highlights.length > 0) {
      profileParts.push('亮点优势：' + userProfile.highlights.join('、'));
    }
    if (profileParts.length > 0) {
      userParts.push('', '## 设置页补充信息', profileParts.join('\n'));
    }

    userParts.push('', '## 目标公司信息', buildCompanyInfoText(companyInfo));
    userParts.push('', `请生成 ${count} 条打招呼话术，参考上方示例的风格和长度。`);

    // 4. 发起 SSE 流式请求
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const { model, temperature, maxTokens } = config;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: systemParts.join('\n') },
          { role: 'user', content: userParts.join('\n') }
        ]
      }),
      signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`AI API 请求失败 (${response.status}): ${errorBody.substring(0, 200)}`);
    }

    // 5. 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';       // 累积的完整助手文本
    let buffer = '';            // 未处理完的 SSE 原始缓冲
    const seenTexts = new Set(); // 已回调的话术文本（去重）
    const allGreetings = [];    // 收集全部话术用于最终返回

    const handleGreeting = (g) => {
      allGreetings.push(g);
      if (onGreeting) onGreeting(g);
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按行处理 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 最后一个可能不完整，留到下次

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // 空行或注释
          if (!trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') break;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              accumulated += delta.content;
              // 每收到增量就尝试解析新的话术行
              parseStreamChunk(accumulated, handleGreeting, seenTexts);
            }
          } catch (e) {
            // 忽略无法解析的 chunk
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // 用户主动中断，返回已收集的话术
        if (allGreetings.length === 0) throw new Error('生成已取消');
        return allGreetings;
      }
      throw e;
    }

    // 6. 流结束后，解析最后一行（之前可能因为没有换行被跳过）
    if (accumulated.endsWith('\n') === false && accumulated.length > 0) {
      // 对剩余内容做最后一次解析
      const lastLine = accumulated.split('\n').pop() || '';
      let cleaned = lastLine
        .replace(/^\d+[\.\)、]\s*/, '')
        .replace(/^[-*]\s*/, '')
        .trim();
      if (cleaned.length >= 4 && cleaned.length <= 200 && !seenTexts.has(cleaned)) {
        handleGreeting({ text: cleaned, type: 'ai' });
      }
    }

    if (allGreetings.length === 0) {
      throw new Error('AI 未生成有效话术，请检查配置');
    }

    return allGreetings;
  }

  return { isConfigured, generate, generateStream, getConfig, analyzeImage, extractInfoFromText, invalidateContextCache };

})();
