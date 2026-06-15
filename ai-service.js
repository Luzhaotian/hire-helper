// ========================================
// 招聘助手 - AI 服务模块
// 基于 OpenAI 兼容 API 生成话术
// 每次调用自动携带 skills/ 和 rules/ 文件夹内容
// ========================================

const AIService = (() => {

  /**
   * 检查 AI 配置是否可用
   * @returns {boolean}
   */
  function isConfigured() {
    return typeof AI_CONFIG !== 'undefined' &&
           AI_CONFIG.apiKey &&
           AI_CONFIG.apiKey.length > 0;
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
    if (!isConfigured()) {
      throw new Error('AI 未配置：请在 ai-config.js 中填写 API Key');
    }

    const { count = 8 } = options;

    // 1. 加载文件上下文
    const { skills, rules } = await loadContextFiles();
    const skillsText = extractUsefulContent(skills);
    const rulesText = extractUsefulContent(rules);

    // 2. 构建 system prompt（规则 + 基础角色）
    const basePrompt = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.systemPrompt)
      ? AI_CONFIG.systemPrompt
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
    const baseUrl = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.baseUrl)
      ? AI_CONFIG.baseUrl.replace(/\/+$/, '')
      : 'https://api.openai.com/v1';

    const model = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.model)
      ? AI_CONFIG.model : 'gpt-4o-mini';

    const temperature = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.temperature)
      ? AI_CONFIG.temperature : 0.8;

    const maxTokens = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.maxTokens)
      ? AI_CONFIG.maxTokens : 512;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
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

  return { isConfigured, generate };

})();
