// ========================================
// 招聘助手 - 话术生成引擎
// 基于模板 + 关键词匹配，生成 10-20 字开头语
// ========================================

const HireGenerator = (() => {

  // ========== 行业关键词 → 优势映射 ==========
  const INDUSTRY_KEYWORDS = {
    'ai': ['AI', '人工智能', '机器学习', '深度学习', 'NLP', 'AIGC', '大模型', 'LLM', 'GPT', '算法', 'RAG'],
    'frontend': ['前端', 'React', 'Vue', 'Next.js', 'Nuxt', 'TypeScript', 'H5', 'Web前端', '小程序', 'Flutter', 'React Native'],
    'backend': ['后端', 'Java', 'Go', 'Python', 'Node.js', 'Spring', '微服务', '分布式', '高并发'],
    'mobile': ['iOS', 'Android', '移动端', 'App', 'Flutter', 'Swift', 'Kotlin', 'React Native'],
    'data': ['数据', '大数据', '数据仓库', 'Hadoop', 'Spark', 'Flink', '数据分析师', 'ETL'],
    'devops': ['运维', 'DevOps', 'K8s', 'Docker', 'CI/CD', '云原生', 'SRE', 'Linux'],
    'product': ['产品', '产品经理', 'PRD', '需求分析', '用户体验', 'UX', 'UI', '设计'],
    'security': ['安全', '网络安全', '渗透测试', 'SOC', '合规', '加密'],
    'cloud': ['云计算', 'AWS', '阿里云', '腾讯云', 'Serverless', '云服务'],
    'blockchain': ['区块链', 'Web3', 'DeFi', 'Solidity', '智能合约']
  };

  // ========== 技能 → 优势描述模板 ==========
  const SKILL_ADVANTAGES = {
    'ai': [
      '深耕AI领域', '精通AI算法', 'AI实战经验丰富',
      '大模型应用专家', '有丰富AI落地经验'
    ],
    'frontend': [
      '前端架构能力扎实', '精通现代前端技术栈',
      '有大型前端项目经验', '全栈开发能力出色'
    ],
    'backend': [
      '后端架构设计精通', '高并发实战经验丰富',
      '分布式系统专家', '服务端性能优化高手'
    ],
    'mobile': [
      '移动端开发经验丰富', '跨平台开发能力出色',
      '有完整App上线经验', '原生+跨平台双修'
    ],
    'data': [
      '数据处理能力突出', '大数据实战经验丰富',
      '数据驱动决策践行者', '数据架构设计能力强'
    ],
    'devops': [
      '云原生实践经验丰富', 'DevOps体系建设专家',
      '自动化运维能力强', '容器化部署精通'
    ],
    'product': [
      '产品全生命周期经验', '用户增长实战经验丰富',
      '数据驱动产品设计', '商业化思维突出'
    ],
    'security': [
      '安全攻防能力扎实', '企业安全体系建设经验',
      '安全合规经验丰富', '安全架构设计能力强'
    ],
    'cloud': [
      '云架构设计经验充足', '多云管理实践丰富',
      '云原生转型经验丰富', '降本增效实战派'
    ],
    'blockchain': [
      'Web3实战经验丰富', '智能合约开发精通',
      '区块链技术深度掌握', '去中心化应用专家'
    ]
  };

  // ========== 通用优势短语 ==========
  const GENERIC_ADVANTAGES = [
    '技术实力过硬', '学习能力强', '执行力出色',
    '有丰富实战经验', '沟通协作能力佳', '追求技术卓越'
  ];

  // ========== 打招呼话术模板（控制10-20字） ==========
  const GREETING_TEMPLATES = [
    // 模板类型1: 直接优势 + 意向
    { pattern: '{advantage}，{intent}', minLen: 10, maxLen: 20 },
    // 模板类型2: 认同 + 优势
    { pattern: '{recognize}，{advantage}', minLen: 10, maxLen: 20 },
    // 模板类型3: 简洁表达
    { pattern: '{advantage}，期待合作', minLen: 10, maxLen: 20 },
  ];

  const INTENT_PHRASES = [
    '期待加入', '很感兴趣', '期待沟通', '希望能聊聊',
    '想深入了解', '期望合作', '很想交流'
  ];

  const RECOGNIZE_PHRASES = [
    '看好贵司方向', '认可贵司理念', '关注贵司已久',
    '看好贵司发展', '认同贵司文化', '对贵司很向往'
  ];

  /**
   * 核心生成函数
   * @param {Object} companyInfo - 公司信息
   * @param {Object} userProfile - 用户档案
   * @param {Object} options - 额外选项
   * @returns {Array} 生成的话术列表
   */
  function generate(companyInfo, userProfile, options = {}) {
    const results = [];
    const { minLen = 10, maxLen = 20, count = 5 } = options;

    // 1. 分析公司信息，提取关键词
    const companyKeywords = analyzeCompany(companyInfo);

    // 2. 匹配用户技能与公司需求
    const matchedSkills = matchSkills(userProfile, companyKeywords);

    // 3. 生成话术
    // 3a. 使用自定义模板（优先）
    if (userProfile.customTemplates && userProfile.customTemplates.length > 0) {
      userProfile.customTemplates.forEach(tmpl => {
        const generated = fillTemplate(tmpl, companyInfo, matchedSkills);
        if (generated && generated.length >= minLen && generated.length <= maxLen) {
          results.push({ text: generated, type: 'custom', score: 10 });
        }
      });
    }

    // 3b. 使用 highlight 生成
    if (userProfile.highlights && userProfile.highlights.length > 0) {
      userProfile.highlights.forEach(highlight => {
        const phrases = generateFromHighlight(highlight, companyInfo, matchedSkills);
        phrases.forEach(p => {
          if (p.length >= minLen && p.length <= maxLen) {
            results.push({ text: p, type: 'highlight', score: 8 });
          }
        });
      });
    }

    // 3c. 使用 skills 生成
    if (userProfile.skills && userProfile.skills.length > 0) {
      userProfile.skills.forEach(skill => {
        const adv = getAdvantagePhrase(skill);
        if (adv) {
          const phrases = buildPhrases(adv, companyInfo);
          phrases.forEach(p => {
            if (p.length >= minLen && p.length <= maxLen) {
              results.push({ text: p, type: 'skill', score: 6 });
            }
          });
        }
      });
    }

    // 3d. 通用话术（兜底）
    if (results.length < count) {
      GENERIC_ADVANTAGES.forEach(adv => {
        const phrases = buildPhrases(adv, companyInfo);
        phrases.forEach(p => {
          if (p.length >= minLen && p.length <= maxLen) {
            results.push({ text: p, type: 'generic', score: 3 });
          }
        });
      });
    }

    // 4. 去重 + 排序 + 截取
    const unique = [...new Set(results.map(r => r.text))];
    return unique.slice(0, count).map(text => {
      const found = results.find(r => r.text === text);
      return { text, type: found?.type || 'unknown' };
    });
  }

  /**
   * 分析公司信息，提取关键词标签
   */
  function analyzeCompany(info) {
    const text = [
      info.companyName, info.companyDesc, info.jobTitle,
      info.requirements, info.industry, info.rawText
    ].filter(Boolean).join(' ').toLowerCase();

    const tags = [];
    for (const [category, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          tags.push(category);
          break;
        }
      }
    }

    return {
      tags,
      fullText: text,
      companyName: info.companyName || '贵司',
      industryText: info.industry || ''
    };
  }

  /**
   * 匹配用户技能与公司需求
   */
  function matchSkills(userProfile, companyKeywords) {
    const matched = [];
    if (!userProfile.skills) return matched;

    for (const skill of userProfile.skills) {
      const lower = skill.toLowerCase();
      for (const [category, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
        for (const kw of keywords) {
          if (lower.includes(kw.toLowerCase())) {
            matched.push({ category, skill });
            break;
          }
        }
      }
    }
    return matched;
  }

  /**
   * 从技能获取优势短语
   */
  function getAdvantagePhrase(skill) {
    const lower = skill.toLowerCase();
    for (const [category, phrases] of Object.entries(SKILL_ADVANTAGES)) {
      for (const kw of INDUSTRY_KEYWORDS[category] || []) {
        if (lower.includes(kw.toLowerCase())) {
          return phrases[Math.floor(Math.random() * phrases.length)];
        }
      }
    }
    // 没有匹配到行业关键词，用技能名本身
    return skill.length > 10 ? skill.substring(0, 10) : `擅长${skill}`;
  }

  /**
   * 从 highlight 生成话术
   */
  function generateFromHighlight(highlight, companyInfo, matchedSkills) {
    const phrases = [];
    const h = highlight.length > 12 ? highlight.substring(0, 12) : highlight;
    const company = companyInfo.companyName || '贵司';

    // 多种组合方式
    phrases.push(`${h}，期待加入`);
    phrases.push(`看好${company}，${h}`);
    phrases.push(`${h}，想深入了解`);
    phrases.push(`关注${company}，${h}`);
    phrases.push(`${h}，期望合作`);

    // 如果有匹配的技能领域，加针对性话术
    if (matchedSkills.length > 0) {
      phrases.push(`${h}，希望能聊聊`);
    }

    return phrases;
  }

  /**
   * 构建话术短语
   */
  function buildPhrases(advantage, companyInfo) {
    const phrases = [];
    const company = companyInfo.companyName || '贵司';

    // 填充模板
    GREETING_TEMPLATES.forEach(tmpl => {
      const text = tmpl.pattern
        .replace('{advantage}', advantage)
        .replace('{intent}', INTENT_PHRASES[Math.floor(Math.random() * INTENT_PHRASES.length)])
        .replace('{recognize}', RECOGNIZE_PHRASES[Math.floor(Math.random() * RECOGNIZE_PHRASES.length)]);
      phrases.push(text);
    });

    // 额外生成
    phrases.push(`${company}${RECOGNIZE_PHRASES[0]}，${advantage}`);
    phrases.push(`${advantage}，${INTENT_PHRASES[0]}`);

    return phrases;
  }

  /**
   * 填充自定义模板
   * 支持占位符: {company}, {advantage}, {skill}, {intent}
   */
  function fillTemplate(template, companyInfo, matchedSkills) {
    const company = companyInfo.companyName || '贵司';
    const skill = matchedSkills.length > 0 ? matchedSkills[0].skill : '';
    const advantage = skill ? getAdvantagePhrase(skill) : GENERIC_ADVANTAGES[0];

    return template
      .replace(/\{company\}/g, company)
      .replace(/\{advantage\}/g, advantage)
      .replace(/\{skill\}/g, skill)
      .replace(/\{intent\}/g, INTENT_PHRASES[Math.floor(Math.random() * INTENT_PHRASES.length)]);
  }

  // 导出
  return { generate, analyzeCompany };

})();

// 支持 CommonJS（Node环境测试用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HireGenerator;
}
