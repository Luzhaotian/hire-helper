// ========================================
// 招聘助手 - 内容脚本
// 负责从招聘页面抓取公司信息
// ========================================

(() => {
  // 防止重复注入
  if (window.__hireHelperInjected) return;
  window.__hireHelperInjected = true;

  /**
   * 主入口：提取当前页面的公司信息
   */
  function extractCompanyInfo() {
    const info = {
      companyName: '',
      companyDesc: '',
      jobTitle: '',
      requirements: '',
      benefits: '',
      industry: '',
      companySize: '',
      stage: '',
      rawText: '',
      platform: detectPlatform(),
      url: window.location.href
    };

    try {
      switch (info.platform) {
        case 'boss':
          extractBoss(info);
          break;
        case 'lagou':
          extractLagou(info);
          break;
        case 'zhipin':
          extractBoss(info); // BOSS直聘新版
          break;
        case 'liepin':
          extractLiepin(info);
          break;
        case 'zhaopin':
          extractZhaopin(info);
          break;
        case '51job':
          extract51job(info);
          break;
        case 'michaung':
          extractMichaung(info);
          break;
        default:
          extractGeneric(info);
          break;
      }

      // 兜底：提取页面主体文本
      info.rawText = extractPageText();
    } catch (e) {
      console.error('[HireHelper] 提取信息出错:', e);
      info.rawText = extractPageText();
    }

    return info;
  }

  /**
   * 检测招聘平台
   */
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('boss.zhipin.com')) return 'boss';
    if (host.includes('zhipin.com')) return 'zhipin';
    if (host.includes('lagou.com')) return 'lagou';
    if (host.includes('liepin.com')) return 'liepin';
    if (host.includes('zhaopin.com')) return 'zhaopin';
    if (host.includes('51job.com') || host.includes('51job')) return '51job';
    if (host.includes('michaung.com')) return 'michaung';
    return 'unknown';
  }

  // ============ 各平台提取逻辑 ============

  function extractBoss(info) {
    // 公司名称
    info.companyName = getText([
      '.company-name a',
      '.info-company .name',
      '.company-text .name',
      'a[href*="/gongsi/"]',
      '.job-company .name'
    ]);

    // 公司描述 / 公司介绍
    info.companyDesc = getText([
      '.company-info .desc',
      '.company-desc',
      '.sider-company .company-info',
      '.job-detail .company-info',
      '.job-desc .company-desc',
      '.company-profile',
      '.sider-box .text',
      '.info-company .desc'
    ]);

    // 职位名称
    info.jobTitle = getText([
      '.job-name',
      '.job-title',
      '.info-primary .job-name',
      'h1.job-name'
    ]);

    // 岗位要求
    info.requirements = getText([
      '.job-detail .text',
      '.job-sec-text',
      '.job-detail-section .text',
      '.job-requirement'
    ]);

    // 公司福利
    info.benefits = getText([
      '.info-primary .tag-list',
      '.job-tags span',
      '.job-tag span',
      '.sider-company .tags span'
    ]);

    // 公司规模
    info.companySize = getText([
      '.company-info li:last-child',
      '.sider-company .info li:last-child'
    ]);

    // 行业
    info.industry = getText([
      '.company-info li:first-child',
      '.sider-company .info li:first-child',
      '.company-tag-list span'
    ]);
  }

  function extractLagou(info) {
    info.companyName = getText([
      '.company_name a',
      '.company-name',
      '.company_item_name',
      'a[data-company-name]'
    ]);

    info.companyDesc = getText([
      '.company_intro',
      '.company-description',
      '.company_intro_content',
      '.company_content'
    ]);

    info.jobTitle = getText([
      '.job_name .name',
      '.position-head h1',
      '.job-name'
    ]);

    info.requirements = getText([
      '.job_detail .job_bt div',
      '.job-detail .job_bt',
      '.position-detail .content'
    ]);

    info.benefits = getText([
      '.job-tags span',
      '.labels-tag span'
    ]);

    info.companySize = getText([
      '.company_data .item:last-child',
      '.company-size'
    ]);

    info.industry = getText([
      '.company_data .item:first-child',
      '.company-industry'
    ]);
  }

  function extractLiepin(info) {
    info.companyName = getText([
      '.company-name a',
      '.company-title a',
      '.comp-name a'
    ]);

    info.companyDesc = getText([
      '.company-intro',
      '.company-intro-content',
      '.comp-intro'
    ]);

    info.jobTitle = getText([
      '.job-title h1',
      '.job-name h1',
      '.position-title'
    ]);

    info.requirements = getText([
      '.job-qualifications',
      '.job-intro',
      '.content-word'
    ]);

    info.benefits = getText([
      '.job-labels span',
      '.tags span'
    ]);
  }

  function extractZhaopin(info) {
    info.companyName = getText([
      '.company-name a',
      '.companyName a',
      '.describtion .company-name'
    ]);

    info.companyDesc = getText([
      '.company-intro',
      '.companyIntro',
      '.describtion .content'
    ]);

    info.jobTitle = getText([
      '.summary-plane h1',
      '.job-name',
      '.position-name'
    ]);

    info.requirements = getText([
      '.describtion .content',
      '.job-detail .content'
    ]);

    info.benefits = getText([
      '.highlights li',
      '.welfare-label span'
    ]);
  }

  function extract51job(info) {
    info.companyName = getText([
      '.company_name a',
      '.cname a',
      '.company-name'
    ]);

    info.companyDesc = getText([
      '.company_intro',
      '.tCompany_main .msg',
      '.company-intro'
    ]);

    info.jobTitle = getText([
      '.jname',
      '.job_name',
      '.jobTitle'
    ]);

    info.requirements = getText([
      '.job_msg',
      '.tCompany_main .msg',
      '.job_detail'
    ]);
  }

  function extractMichaung(info) {
    info.companyName = getText([
      '.company-name',
      '.company_name'
    ]);

    info.companyDesc = getText([
      '.company-desc',
      '.company-intro'
    ]);

    info.jobTitle = getText([
      '.job-title',
      '.job-name'
    ]);

    info.requirements = getText([
      '.job-desc',
      '.job-detail'
    ]);
  }

  function extractGeneric(info) {
    info.companyName = getText([
      '.company-name', '.company_name', '.companyName',
      '[class*="company"] [class*="name"]'
    ]);
    info.companyDesc = getText([
      '.company-desc', '.company-intro', '.company_intro',
      '[class*="company"] [class*="desc"]',
      '[class*="company"] [class*="intro"]'
    ]);
    info.jobTitle = getText([
      '.job-name', '.job_title', '.jobTitle',
      'h1[class*="job"]', 'h2[class*="job"]'
    ]);
    info.requirements = getText([
      '.job-detail', '.job-requirement', '.job-desc',
      '[class*="requirement"]', '[class*="job-detail"]'
    ]);
  }

  // ============ 工具函数 ============

  /**
   * 按优先级尝试多个选择器
   */
  function getText(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText || el.textContent || '';
          const cleaned = text.trim().replace(/\s+/g, ' ');
          if (cleaned.length > 2) return cleaned;
        }
      } catch (e) { /* ignore */ }
    }
    return '';
  }

  /**
   * 提取页面主体文本（兜底方案）
   */
  function extractPageText() {
    const mainSelectors = [
      'main', 'article', '#content', '.content',
      '#main', '.main', '#app', '.job-detail',
      '.position-content', '.job_detail'
    ];

    for (const sel of mainSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        const text = el.innerText.trim();
        if (text.length > 50) {
          return text.substring(0, 3000); // 限制长度
        }
      }
    }

    // 最后兜底：body 文本
    return (document.body.innerText || '').substring(0, 3000);
  }

  // ============ 消息监听 ============

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_INFO') {
      const info = extractCompanyInfo();
      sendResponse({ success: true, data: info });
    }

    if (message.type === 'GET_PAGE_TEXT') {
      const text = extractPageText();
      sendResponse({ success: true, text });
    }

    return true;
  });
})();
