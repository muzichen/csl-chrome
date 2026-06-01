'use strict';

// ESPN public API — no key required
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/chn.1/scoreboard';
const ESPN_STANDINGS  = 'https://site.api.espn.com/apis/v2/sports/soccer/chn.1/standings';
const CACHE_TTL = 10 * 60 * 1000;

const TEAM_CN = {
  'Beijing Guoan':           '北京国安',
  'Chengdu Rongcheng':       '成都蓉城',
  'Chongqing Tonglianglong': '重庆铜梁龙',
  'Dalian Yingbo':           '大连英博',
  'Henan Songshan Longmen':  '河南俱乐部',
  'Liaoning Tieren':         '辽宁铁人',
  'Qingdao Hainiu':          '青岛海牛',
  'Qingdao West Coast':      '青岛西海岸',
  'Shandong Taishan':        '山东泰山',
  'Shanghai Port':           '上海海港',
  'Shanghai Shenhua':        '上海申花',
  'Shenzhen Xinpengcheng':   '深圳新鹏城',
  'Tianjin Jinmen Tiger':    '天津津门虎',
  'Wuhan Three Towns':       '武汉三镇',
  'Yunnan Yukun':            '云南玉昆',
  'Zhejiang Professional FC':'浙江队',
};

function cn(name) {
  return TEAM_CN[name] || name;
}

function logoImg(teamId, name) {
  const cnName = cn(name);
  if (!teamId) {
    return `<span class="team-logo team-logo-fallback">⚽</span>`;
  }
  const url = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
  return `<img class="team-logo" src="${url}" alt="${cnName}">`;
}

function bindLogoFallbacks(root) {
  root.querySelectorAll('img.team-logo').forEach(img => {
    const swap = () => {
      const span = document.createElement('span');
      span.className = 'team-logo team-logo-fallback';
      span.textContent = '⚽';
      img.replaceWith(span);
    };
    img.addEventListener('error', swap);
    if (img.complete && img.naturalWidth === 0) swap();
  });
}

function storageGet(key) {
  return new Promise(resolve => chrome.storage.local.get(key, resolve));
}

function storageSet(items) {
  return new Promise(resolve => chrome.storage.local.set(items, resolve));
}

async function getCached(key) {
  const result = await storageGet(key);
  const entry = result[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

async function fetchWithCache(url) {
  const cacheKey = 'cache_' + url.replace(/[^a-z0-9]/gi, '_');
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败 (HTTP ${res.status})`);
  const data = await res.json();
  await storageSet({ [cacheKey]: { data, ts: Date.now() } });
  return data;
}

// Fetch full season scoreboard (all 200 matches)
async function fetchSeasonEvents() {
  const year = new Date().getFullYear();
  const url = `${ESPN_SCOREBOARD}?dates=${year}0101-${year}1231&limit=300`;
  const data = await fetchWithCache(url);
  return (data.events || []).map(parseEvent).filter(Boolean);
}

function parseEvent(e) {
  const comp = (e.competitions || [])[0];
  if (!comp) return null;
  const home = comp.competitors.find(t => t.homeAway === 'home');
  const away = comp.competitors.find(t => t.homeAway === 'away');
  if (!home || !away) return null;
  const status = comp.status?.type?.name || '';
  const finished = status === 'STATUS_FULL_TIME' || status === 'STATUS_FINAL';
  return {
    date: e.date,
    homeTeam: home.team.displayName,
    awayTeam: away.team.displayName,
    homeId: home.team.id,
    awayId: away.team.id,
    homeScore: finished ? home.score : null,
    awayScore: finished ? away.score : null,
    finished,
  };
}

function formatBeijingTime(utcStr) {
  const bj = new Date(new Date(utcStr).getTime() + 8 * 3600 * 1000);
  const M = bj.getUTCMonth() + 1;
  const D = bj.getUTCDate();
  const hh = String(bj.getUTCHours()).padStart(2, '0');
  const mm = String(bj.getUTCMinutes()).padStart(2, '0');
  return `${M}月${D}日 ${hh}:${mm}`;
}

function matchCard(ev) {
  const middle = ev.finished
    ? `<span class="score">${ev.homeScore} - ${ev.awayScore}</span>`
    : `<span class="vs">vs</span>`;
  return `
    <div class="match-card${ev.finished ? '' : ' upcoming'}">
      <div class="match-date">${formatBeijingTime(ev.date)}</div>
      <div class="match-teams">
        <span class="team home">
          <span class="team-name">${cn(ev.homeTeam)}</span>
          ${logoImg(ev.homeId, ev.homeTeam)}
        </span>
        ${middle}
        <span class="team away">
          ${logoImg(ev.awayId, ev.awayTeam)}
          <span class="team-name">${cn(ev.awayTeam)}</span>
        </span>
      </div>
    </div>
  `;
}

async function loadTab(tab) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    if (tab === 'schedule') {
      const events = await fetchSeasonEvents();
      events.sort((a, b) => new Date(a.date) - new Date(b.date));
      content.innerHTML = events.length
        ? events.map(matchCard).join('')
        : '<p class="empty">暂无赛程数据</p>';
      bindLogoFallbacks(content);

      // Scroll to first upcoming match
      requestAnimationFrame(() => {
        const upcoming = content.querySelector('.match-card.upcoming');
        if (upcoming) upcoming.scrollIntoView({ block: 'start' });
      });

    } else if (tab === 'results') {
      const events = await fetchSeasonEvents();
      const finished = events.filter(e => e.finished)
                             .sort((a, b) => new Date(b.date) - new Date(a.date));
      content.innerHTML = finished.length
        ? finished.map(matchCard).join('')
        : '<p class="empty">暂无战绩数据</p>';
      bindLogoFallbacks(content);

    } else if (tab === 'standings') {
      const year = new Date().getFullYear();
      const data = await fetchWithCache(`${ESPN_STANDINGS}?season=${year}`);
      const entries = data?.children?.[0]?.standings?.entries || [];
      if (!entries.length) {
        content.innerHTML = '<p class="empty">暂无积分榜数据</p>';
        return;
      }
      // Sort by rank stat
      entries.sort((a, b) => {
        const ra = (a.stats.find(s => s.name === 'rank') || {}).value ?? 99;
        const rb = (b.stats.find(s => s.name === 'rank') || {}).value ?? 99;
        return ra - rb;
      });
      const rows = entries.map(e => {
        const stat = name => {
          const s = e.stats.find(s => s.name === name);
          return s ? Math.round(s.value) : '-';
        };
        return `
          <tr>
            <td>${stat('rank')}</td>
            <td class="team-name">
              ${logoImg(e.team.id, e.team.displayName)}
              <span>${cn(e.team.displayName)}</span>
            </td>
            <td>${stat('gamesPlayed')}</td>
            <td>${stat('wins')}</td>
            <td>${stat('ties')}</td>
            <td>${stat('losses')}</td>
            <td class="points">${stat('points')}</td>
          </tr>
        `;
      }).join('');
      content.innerHTML = `
        <table class="standings-table">
          <thead>
            <tr><th>#</th><th>球队</th><th>场</th><th>胜</th><th>平</th><th>负</th><th>积分</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      bindLogoFallbacks(content);
    }
  } catch (err) {
    content.innerHTML = `
      <div class="error">
        <p>${err.message}</p>
        <button class="retry-btn" id="retry">重试</button>
      </div>
    `;
    document.getElementById('retry').addEventListener('click', () => loadTab(tab));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  let currentTab = 'schedule';
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      loadTab(currentTab);
    });
  });

  loadTab(currentTab);
});
