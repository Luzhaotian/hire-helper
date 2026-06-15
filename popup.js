// ========================================
// 招聘助手 - 弹窗主逻辑
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // ============ DOM 引用 ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const views = {
    main: $('#mainView'),
    paste: $('#pasteView'),
    screenshot: $('#screenshotView'),
    settings: $('#settingsView')
  };

  const els = {
    aiEnabled: $('#aiEnabled'),
    aiStatus: $('#aiStatus'),
    scanBtn: $('#scanBtn'),
    screenshotBtn: $('#screenshotBtn'),
    pasteBtn: $('#pasteBtn'),
    settingsBtn: $('#settingsBtn'),
    companyInfo: $('#companyInfo'),
    companyName: $('#companyName'),
    jobTitle: $('#jobTitle'),
    companyDesc: $('#companyDesc'),
    platformBadge: $('#platformBadge'),
    resultArea: $('#resultArea'),
    resultList: $('#resultList'),
    resultCount: $('#resultCount'),
    refreshBtn: $('#refreshBtn'),
    noResult: $('#noResult'),
    loading: $('#loading'),
    pasteBackBtn: $('#pasteBackBtn'),
    pasteInput: $('#pasteInput'),
    pasteConfirmBtn: $('#pasteConfirmBtn'),
    screenshotBackBtn: $('#screenshotBackBtn'),
    captureBtn: $('#captureBtn'),
    uploadBtn: $('#uploadBtn'),
    fileInput: $('#fileInput'),
    screenshotImage: $('#screenshotImage'),
    screenshotPreview: $('#screenshotPreview'),
    screenshotStatus: $('#screenshotStatus'),
    settingsBackBtn: $('#settingsBackBtn'),
    saveBtn: $('#saveBtn'),
    skillInput: $('#skillInput'),
    addSkillBtn: $('#addSkillBtn'),
    skillsContainer: $('#skillsContainer'),
    highlightInput: $('#highlightInput'),
    addHighlightBtn: $('#addHighlightBtn'),
    highlightsContainer: $('#highlightsContainer'),
    templateInput: $('#templateInput'),
    addTemplateBtn: $('#addTemplateBtn'),
    templatesContainer: $('#templatesContainer')
  };

  // ============ 状态 ============
  let currentCompanyInfo = null;
  let userProfile = { skills: [], highlights: [], customTemplates: [] };
  let isAiGenerating = false;

  // ============ 初始化 ============
  loadProfile();
  initAiSettings();

  // ============ 视图切换 ============
  function switchView(name) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[name]) views[name].classList.add('active');
  }

  // ============ Toast 提示 ============
  function showToast(message, type = 'success') {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  // ============ 保存 / 加载 Profile ============
  function loadProfile() {
    chrome.storage.local.get('userProfile', (result) => {
      if (result.userProfile) {
        userProfile = result.userProfile;
        renderSkills();
        renderHighlights();
        renderTemplates();
      }
    });
  }

  function saveProfile() {
    chrome.storage.local.set({ userProfile }, () => {
      showToast('✅ 设置已保存');
    });
  }

  // ============ AI 设置 ============
  function initAiSettings() {
    // 更新 AI 状态
    updateAiStatus();

    // AI 开关事件
    els.aiEnabled.addEventListener('change', () => {
      const enabled = els.aiEnabled.checked;
      chrome.storage.local.set({ aiEnabled: enabled });
      if (enabled && !AIService.isConfigured()) {
        showToast('⚠️ 请先在 ai-config.js 中配置 API Key', 'error');
        els.aiEnabled.checked = false;
        chrome.storage.local.set({ aiEnabled: false });
      }
    });

    // 加载 AI 开关状态
    chrome.storage.local.get('aiEnabled', (result) => {
      if (result.aiEnabled && AIService.isConfigured()) {
        els.aiEnabled.checked = true;
      }
    });
  }

  function updateAiStatus() {
    if (AIService.isConfigured()) {
      els.aiStatus.textContent = '已配置';
      els.aiStatus.className = 'ai-status-badge configured';
    } else {
      els.aiStatus.textContent = '未配置';
      els.aiStatus.className = 'ai-status-badge';
    }
  }

  // ============ 渲染 Tags ============
  function renderTags(container, items, onRemove) {
    container.innerHTML = '';
    items.forEach((item, index) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `
        <span class="tag-text">${escapeHtml(item)}</span>
        <span class="tag-remove" data-index="${index}">×</span>
      `;
      tag.querySelector('.tag-remove').addEventListener('click', () => {
        onRemove(index);
      });
      container.appendChild(tag);
    });
  }

  function renderSkills() {
    renderTags(els.skillsContainer, userProfile.skills || [], (i) => {
      userProfile.skills.splice(i, 1);
      renderSkills();
    });
  }

  function renderHighlights() {
    renderTags(els.highlightsContainer, userProfile.highlights || [], (i) => {
      userProfile.highlights.splice(i, 1);
      renderHighlights();
    });
  }

  function renderTemplates() {
    els.templatesContainer.innerHTML = '';
    (userProfile.customTemplates || []).forEach((tmpl, index) => {
      const item = document.createElement('div');
      item.className = 'template-item';
      item.innerHTML = `
        <code>${escapeHtml(tmpl)}</code>
        <span class="tag-remove" data-index="${index}">×</span>
      `;
      item.querySelector('.tag-remove').addEventListener('click', () => {
        userProfile.customTemplates.splice(index, 1);
        renderTemplates();
      });
      els.templatesContainer.appendChild(item);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ 添加 Tag 通用逻辑 ============
  function addTag(inputEl, targetArray, renderFn, maxLen = 20) {
    const val = inputEl.value.trim();
    if (!val) return;
    if (targetArray.includes(val)) {
      showToast('已存在相同标签', 'error');
      return;
    }
    if (targetArray.length >= maxLen) {
      showToast('已达最大数量', 'error');
      return;
    }
    targetArray.push(val);
    inputEl.value = '';
    renderFn();
  }

  // ============ 主页面操作 ============

  // 扫描按钮
  els.scanBtn.addEventListener('click', async () => {
    if (els.scanBtn.disabled) return;
    els.scanBtn.disabled = true;
    showLoading(true);
    hideAllResults();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // 注入 content.js
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch (e) {}

      // 等 content.js 注册 listener
      await new Promise(r => setTimeout(r, 500));

      // 消息通信提取
      let info = null;
      for (let i = 0; i < 5; i++) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_INFO' });
          if (response && response.success && response.data) {
            info = response.data;
            break;
          }
        } catch (e) {
          await new Promise(r => setTimeout(r, 400));
        }
      }

      if (info) {
        handleExtractedInfo(info);
      } else {
        showNoResult();
      }
    } catch (e) {
      console.error('扫描出错:', e);
      showNoResult();
    }

    showLoading(false);
    els.scanBtn.disabled = false;
  });

  // 处理提取到的信息
  function handleExtractedInfo(info) {
    currentCompanyInfo = info;

    // 展示公司信息
    const hasCompany = info.companyName || info.companyDesc || info.rawText;
    if (hasCompany) {
      els.companyInfo.classList.remove('hidden');
      els.companyName.textContent = info.companyName || '未识别';
      els.jobTitle.textContent = info.jobTitle || '未识别';
      els.companyDesc.textContent = info.companyDesc || info.requirements || info.rawText?.substring(0, 500) || '无';
      els.platformBadge.textContent = getPlatformName(info.platform);

      // 生成话术
      generateAndDisplay(info);
    } else {
      showNoResult();
    }
  }

  // 生成并展示话术
  async function generateAndDisplay(info) {
    const useAi = els.aiEnabled.checked && AIService.isConfigured();

    if (useAi && !isAiGenerating) {
      // AI 生成
      isAiGenerating = true;
      showLoading(true);
      hideAllResults();

      try {
        const aiResults = await AIService.generate(info, userProfile, { count: 8 });
        if (aiResults.length > 0) {
          els.resultArea.classList.remove('hidden');
          els.noResult.classList.add('hidden');
          els.resultCount.textContent = `${aiResults.length} 条`;
          renderResults(aiResults);
        } else {
          showNoResult();
        }
      } catch (e) {
        console.error('AI 生成失败:', e);
        showToast('❌ ' + e.message, 'error');
        // 回退到本地生成
        generateLocal(info);
      } finally {
        isAiGenerating = false;
        showLoading(false);
      }
    } else {
      // 本地生成
      generateLocal(info);
    }
  }

  function generateLocal(info) {
    const results = HireGenerator.generate(info, userProfile, {
      minLen: 10,
      maxLen: 20,
      count: 8
    });

    if (results.length > 0) {
      els.resultArea.classList.remove('hidden');
      els.noResult.classList.add('hidden');
      els.resultCount.textContent = `${results.length} 条`;
      renderResults(results);
    } else {
      showNoResult();
    }
  }

  function renderResults(results) {
    els.resultList.innerHTML = '';
    results.forEach((r, i) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <span class="result-text">${escapeHtml(r.text)}</span>
        <span class="result-tag ${r.type}">${getTypeLabel(r.type)}</span>
        <span class="result-copy" title="点击复制">📋</span>
      `;
      item.addEventListener('click', () => {
        copyToClipboard(r.text);
      });
      els.resultList.appendChild(item);
    });
  }

  // 刷新按钮
  els.refreshBtn.addEventListener('click', () => {
    if (currentCompanyInfo) {
      generateAndDisplay(currentCompanyInfo);
    }
  });

  // 截图按钮
  els.screenshotBtn.addEventListener('click', () => {
    switchView('screenshot');
  });

  // 粘贴按钮
  els.pasteBtn.addEventListener('click', () => {
    switchView('paste');
    els.pasteInput.value = '';
    els.pasteInput.focus();
  });

  // 设置按钮
  els.settingsBtn.addEventListener('click', () => {
    switchView('settings');
  });

  // ============ 粘贴视图 ============
  els.pasteBackBtn.addEventListener('click', () => switchView('main'));

  els.pasteConfirmBtn.addEventListener('click', () => {
    const text = els.pasteInput.value.trim();
    if (!text) {
      showToast('请输入或粘贴文本', 'error');
      return;
    }

    switchView('main');
    showLoading(true);
    hideAllResults();

    // 将粘贴的文本作为公司信息
    const info = {
      companyName: extractCompanyNameFromText(text),
      companyDesc: text.substring(0, 500),
      jobTitle: '',
      requirements: text,
      benefits: '',
      industry: '',
      companySize: '',
      rawText: text,
      platform: 'manual',
      url: 'manual-input'
    };

    setTimeout(() => {
      handleExtractedInfo(info);
      showLoading(false);
    }, 500);
  });

  // ============ 截图视图 ============
  els.screenshotBackBtn.addEventListener('click', () => switchView('main'));

  els.captureBtn.addEventListener('click', async () => {
    els.screenshotStatus.classList.remove('hidden');

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(resp);
          }
        });
      });

      if (response && response.screenshot) {
        els.screenshotImage.src = response.screenshot;
        els.screenshotImage.classList.remove('hidden');
        els.screenshotPreview.classList.add('hidden');

        // 提示用户需要 OCR
        showToast('📸 截图已捕获，请粘贴页面文本来识别');
      }
    } catch (e) {
      console.error('截图失败:', e);
      showToast('截图失败，请尝试粘贴文本', 'error');
    }

    els.screenshotStatus.classList.add('hidden');
  });

  els.uploadBtn.addEventListener('click', () => {
    els.fileInput.click();
  });

  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      els.screenshotImage.src = reader.result;
      els.screenshotImage.classList.remove('hidden');
      els.screenshotPreview.classList.add('hidden');
      showToast('📸 图片已加载，请粘贴页面文本进行识别');
    };
    reader.readAsDataURL(file);
  });

  // ============ 设置视图 ============
  els.settingsBackBtn.addEventListener('click', () => switchView('main'));
  els.saveBtn.addEventListener('click', () => {
    saveProfile();
    switchView('main');
  });

  // 添加技能
  els.addSkillBtn.addEventListener('click', () => {
    addTag(els.skillInput, userProfile.skills, renderSkills);
  });
  els.skillInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addTag(els.skillInput, userProfile.skills, renderSkills);
    }
  });

  // 添加亮点
  els.addHighlightBtn.addEventListener('click', () => {
    addTag(els.highlightInput, userProfile.highlights, renderHighlights);
  });
  els.highlightInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addTag(els.highlightInput, userProfile.highlights, renderHighlights);
    }
  });

  // 添加模板
  els.addTemplateBtn.addEventListener('click', () => {
    addTag(els.templateInput, userProfile.customTemplates, renderTemplates);
  });
  els.templateInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addTag(els.templateInput, userProfile.customTemplates, renderTemplates);
    }
  });

  // 快速标签点击
  $$('.quick-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const val = tag.dataset.tag;
      const section = tag.closest('.setting-section');
      if (section) {
        const input = section.querySelector('.tag-input');
        if (input === els.skillInput) {
          userProfile.skills.push(val);
          renderSkills();
        } else if (input === els.highlightInput) {
          userProfile.highlights.push(val);
          renderHighlights();
        } else if (input === els.templateInput) {
          userProfile.customTemplates.push(val);
          renderTemplates();
        }
      }
    });
  });

  // ============ 工具函数 ============
  function showLoading(show) {
    els.loading.classList.toggle('hidden', !show);
  }

  function hideAllResults() {
    els.companyInfo.classList.add('hidden');
    els.resultArea.classList.add('hidden');
    els.noResult.classList.add('hidden');
  }

  function showNoResult() {
    els.noResult.classList.remove('hidden');
    els.resultArea.classList.add('hidden');
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✅ 已复制到剪贴板');
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('✅ 已复制到剪贴板');
    });
  }

  function getPlatformName(platform) {
    const names = {
      boss: 'BOSS直聘',
      zhipin: 'BOSS直聘',
      lagou: '拉勾网',
      liepin: '猎聘',
      zhaopin: '智联招聘',
      '51job': '前程无忧',
      michaung: '麦茬',
      manual: '手动输入',
      unknown: '未知平台'
    };
    return names[platform] || platform;
  }

  function getTypeLabel(type) {
    const labels = {
      skill: '技能匹配',
      highlight: '亮点',
      custom: '自定义',
      generic: '通用',
      ai: '🤖 AI'
    };
    return labels[type] || type;
  }

  function extractCompanyNameFromText(text) {
    // 尝试从文本中提取公司名
    const patterns = [
      /我们是(.{2,15})的/,
      /公司是(.{2,15})的/,
      /(.{2,10})(?:是一家|成立于|创立于)/,
      /公司名[称]?(?:为|：|:)\s*(.{2,20})/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return '';
  }
});
