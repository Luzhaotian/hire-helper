// ========================================
// 招聘助手 - 后台服务
// ========================================

// 安装时初始化默认设置
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('userProfile', (result) => {
    if (!result.userProfile) {
      chrome.storage.local.set({
        userProfile: {
          name: '',
          skills: [],
          experience: '',
          highlights: [],
          customTemplates: []
        }
      });
    }
  });
});

// 监听来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({ tabId: tabs[0].id, url: tabs[0].url });
      }
    });
    return true;
  }

  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }
});
