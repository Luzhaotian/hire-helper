// ========================================
// AI 配置文件示例 — 复制为 ai-config.js 后填写
// ai-config.js 含密钥，已 gitignore，请勿提交
// ========================================

const AI_CONFIG = {
  // API 地址（支持 OpenAI 及兼容接口）
  baseUrl: "https://api.openai.com/v1",

  // 模型名称
  model: "gpt-4o-mini",

  // API Key（必填）
  apiKey: "sk-xxx",

  // 生成参数
  temperature: 0.8,
  // 推理模型会把 token 用于思考，建议 ≥ 2048
  maxTokens: 2048,

  // 系统提示词（角色定义；具体输出规则见 rules/RULES.md）
  systemPrompt: `你是专属招聘话术助手。根据目标公司信息和 SKILL.md 中的个人档案，生成简短、个性化、突出人岗匹配的打招呼话术。`,
};
