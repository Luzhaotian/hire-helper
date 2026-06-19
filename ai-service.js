// ========================================
// 招聘助手 - AI 服务模块
// 基于 OpenAI 兼容 API 生成话术
// 每次调用自动携带 skills/ 和 rules/ 文件夹内容
// ========================================

const AIService = (() => {

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
      maxTokens: stored.maxTokens ?? fileConfig.maxTokens ?? 512,
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
   * 从 skills/ 和 rules/ 文件夹加载所有 .md 文件
   * @returns {Promise<{skills: string, rules: string}>}
   */
  async function loadContextFiles() {
    const skillsContent = await readFile('skills/SKILL.md');
    const rulesContent = await readFile('rules/RULES.md');
    return { skills: skillsContent, rules: rulesContent };
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

    // 1. 加载文件上下文
    const { skills, rules } = await loadContextFiles();
    const skillsText = extractUsefulContent(skills);
    const rulesText = extractUsefulContent(rules);

    // 2. 构建 system prompt（规则 + 基础角色）
    const basePrompt = config.systemPrompt
      ? config.systemPrompt
      : '你是一个专业的招聘助手。根据公司信息和用户资料，生成简短的打招呼话术。';

    const systemParts = [basePrompt];
    if (rulesText) {
      systemParts.push('', '## 输出规则（必须严格遵守）', rulesText);
    }

    // 3. 构建 user message（公司信息 + 个人档案 + 设置页补充）
    const userParts = [];

    if (skillsText) {
      userParts.push('## 个人能力档案', skillsText);
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
    userParts.push('', `请生成 ${count} 条打招呼话术，每条 10-20 个字。`);

    // 4. 调用 API
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
          { role: 'user', content: userParts.join('\n') }
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

    // 5. 解析返回的话术（按换行分隔，去编号）
    const lines = content
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)、]\s*/, '').replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length >= 4 && line.length <= 30);

    return lines.map(text => ({
      text,
      type: 'ai'
    }));
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

    // 加载文件上下文
    const { skills, rules } = await loadContextFiles();
    const skillsText = extractUsefulContent(skills);
    const rulesText = extractUsefulContent(rules);

    const basePrompt = config.systemPrompt
      ? config.systemPrompt
      : '你是一个专业的招聘助手。根据图片中的公司信息和用户资料，提取信息并生成简短的打招呼话术。';

    const systemParts = [basePrompt];
    if (rulesText) {
      systemParts.push('', '## 输出规则', rulesText);
    }

    // 从图片中提取公司信息，然后生成话术
    const userParts = [];
    userParts.push('请先识别图片中的公司名称、职位、公司介绍/岗位要求等信息，以JSON格式输出信息，然后再生成打招呼话术。');
    userParts.push('请按以下JSON格式返回（不要包含markdown代码块标记）：');
    userParts.push('{"companyName":"公司名称","jobTitle":"职位","companyDesc":"公司介绍","requirements":"岗位要求","greetings":["话术1","话术2",...]}');

    if (skillsText) {
      userParts.push('', '## 个人能力档案', skillsText);
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

  return { isConfigured, generate, getConfig, analyzeImage, extractInfoFromText };

})();
