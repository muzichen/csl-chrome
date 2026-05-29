'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('api-key');
  const status = document.getElementById('status');

  chrome.storage.local.get('apiKey', result => {
    if (result.apiKey) input.value = result.apiKey;
  });

  function showStatus(msg, type) {
    status.textContent = msg;
    status.className = 'status ' + type;
  }

  document.getElementById('save').addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) {
      showStatus('请输入 API Key', 'error');
      return;
    }

    showStatus('验证中，请稍候...', 'pending');

    try {
      const res = await fetch('https://api.football-data.org/v4/competitions/CSL', {
        headers: { 'X-Auth-Token': key }
      });

      if (res.status === 403) {
        showStatus('API Key 无效或无访问中超数据的权限', 'error');
        return;
      }
      if (!res.ok) {
        showStatus(`验证失败 (HTTP ${res.status})`, 'error');
        return;
      }

      // Clear cached data so fresh data is fetched with new key
      chrome.storage.local.get(null, items => {
        const cacheKeys = Object.keys(items).filter(k => k.startsWith('cache_'));
        if (cacheKeys.length) chrome.storage.local.remove(cacheKeys);
      });

      chrome.storage.local.set({ apiKey: key }, () => {
        showStatus('保存成功！现在可以关闭此页面', 'success');
      });
    } catch {
      showStatus('网络错误，请检查网络连接', 'error');
    }
  });

  document.getElementById('clear').addEventListener('click', () => {
    chrome.storage.local.remove('apiKey', () => {
      input.value = '';
      showStatus('已清除 API Key', 'success');
    });
  });
});
