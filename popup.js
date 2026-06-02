'use strict';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/chn.1/scoreboard';
const ESPN_STANDINGS  = 'https://site.api.espn.com/apis/v2/sports/soccer/chn.1/standings';
const CACHE_TTL      = 10 * 60 * 1000;
const LIVE_INTERVAL  = 60 * 1000;

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

// ── App state ──────────────────────────────────────────────
let favoriteTeamId = null;
let liveTimer      = null;
let currentTab     = 'schedule';
let loadSeq        = 0;

// ── Helpers ───────────────────────────────────────────────
function cn(name) { return TEAM_CN[name] || name; }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function logoImg(teamId, name) {
  if (!teamId) return `<span class="team-logo team-logo-fallback">⚽</span>`;
  return `<img class="team-logo" src="https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(teamId)}.png" alt="${escapeHtml(cn(name))}">`;
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
  const r = await storageGet(key);
  const e = r[key];
  if (e && Date.now() - e.ts < CACHE_TTL) return e;
  return null;
}

async function fetchWithCache(url, skipCache = false) {
  const key = 'cache_' + url.replace(/[^a-z0-9]/gi, '_');
  if (!skipCache) {
    const cached = await getCached(key);
    if (cached) {
      updateDataStatus(cached.ts, true);
      return cached.data;
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败 (HTTP ${res.status})`);
  const data = await res.json();
  const ts = Date.now();
  await storageSet({ [key]: { data, ts } });
  updateDataStatus(ts, false);
  return data;
}

function updateDataStatus(ts, fromCache) {
  const status = document.getElementById('data-status');
  if (!status || !ts) return;
  const time = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
  status.textContent = `${fromCache ? '缓存' : '更新'} ${time}`;
  status.title = `${fromCache ? '正在使用缓存数据' : '数据已刷新'}：${new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
}

function setRefreshing(isRefreshing) {
  const btn = document.getElementById('refresh');
  if (!btn) return;
  btn.disabled = isRefreshing;
  btn.classList.toggle('is-refreshing', isRefreshing);
}

// ── Data parsing ──────────────────────────────────────────
async function fetchSeasonEvents(skipCache = false) {
  const year = new Date().getFullYear();
  const url  = `${ESPN_SCOREBOARD}?dates=${year}0101-${year}1231&limit=300`;
  const data = await fetchWithCache(url, skipCache);
  return (data.events || []).map(parseEvent).filter(Boolean);
}

async function fetchStandingsEntries(skipCache = false) {
  const year = new Date().getFullYear();
  const data = await fetchWithCache(`${ESPN_STANDINGS}?season=${year}`, skipCache);
  return data?.children?.[0]?.standings?.entries || [];
}

function parseEvent(e) {
  const comp = (e.competitions || [])[0];
  if (!comp) return null;
  const home = comp.competitors.find(t => t.homeAway === 'home');
  const away = comp.competitors.find(t => t.homeAway === 'away');
  if (!home || !away) return null;

  const statusType  = comp.status?.type?.name  || '';
  const statusState = comp.status?.type?.state || '';
  const finished = statusType === 'STATUS_FULL_TIME' || statusType === 'STATUS_FINAL';
  const live     = statusState === 'in';

  return {
    id:           e.id,
    date:         e.date,
    homeTeam:     home.team.displayName,
    awayTeam:     away.team.displayName,
    homeId:       home.team.id,
    awayId:       away.team.id,
    homeScore:    (finished || live) ? home.score : null,
    awayScore:    (finished || live) ? away.score : null,
    finished,
    live,
    displayClock: comp.status?.displayClock || '',
  };
}

function formatBeijingTime(utcStr) {
  const bj = new Date(new Date(utcStr).getTime() + 8 * 3600 * 1000);
  const M  = bj.getUTCMonth() + 1;
  const D  = bj.getUTCDate();
  const hh = String(bj.getUTCHours()).padStart(2, '0');
  const mm = String(bj.getUTCMinutes()).padStart(2, '0');
  return `${M}月${D}日 ${hh}:${mm}`;
}

function formatRoundLabel(utcStr) {
  const bj = new Date(new Date(utcStr).getTime() + 8 * 3600 * 1000);
  return `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日`;
}

// CSL always has 16 teams → exactly 8 games per round.
// Split sorted events into chunks of 8 for reliable round grouping.
function groupByRound(events) {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
  const rounds = [];
  for (let i = 0; i < sorted.length; i += 8) {
    rounds.push(sorted.slice(i, i + 8));
  }
  return rounds;
}

// Find the "active" round index: first round with an upcoming match, else last finished round
function activeRoundIndex(rounds) {
  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i].some(ev => !ev.finished && !ev.live)) return i;
  }
  return rounds.length - 1;
}

// Direct stat lookup by ESPN field name (names are stable and known)
function statVal(entry, name) {
  const s = (entry.stats || []).find(s => s.name === name);
  return s != null ? Math.round(s.value) : '-';
}

function signedValue(value) {
  if (typeof value !== 'number') return value;
  return value > 0 ? `+${value}` : String(value);
}

function teamEvents(events, teamId) {
  return events.filter(ev => ev.homeId === teamId || ev.awayId === teamId);
}

function opponentName(ev, teamId) {
  return ev.homeId === teamId ? cn(ev.awayTeam) : cn(ev.homeTeam);
}

function teamResult(ev, teamId) {
  const home = Number(ev.homeScore);
  const away = Number(ev.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const diff = ev.homeId === teamId ? home - away : away - home;
  if (diff > 0) return 'W';
  if (diff < 0) return 'L';
  return 'D';
}

function formDots(events, teamId) {
  const results = teamEvents(events, teamId)
    .filter(ev => ev.finished)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .reverse()
    .map(ev => teamResult(ev, teamId))
    .filter(Boolean);

  if (!results.length) return '<span class="form-empty">-</span>';
  return results.map(r => `<span class="form-dot form-${r.toLowerCase()}">${r}</span>`).join('');
}

function findTeamName(teamId, events, entries = []) {
  const standingEntry = entries.find(e => e.team.id === teamId);
  if (standingEntry) return cn(standingEntry.team.displayName);
  const ev = events.find(item => item.homeId === teamId || item.awayId === teamId);
  if (!ev) return '我的球队';
  return cn(ev.homeId === teamId ? ev.homeTeam : ev.awayTeam);
}

function compactMatchLine(ev, teamId, type) {
  if (!ev) return `<span class="my-team-muted">${type === 'next' ? '暂无后续赛程' : '暂无近期赛果'}</span>`;
  const side = ev.homeId === teamId ? '主' : '客';
  const opponent = escapeHtml(opponentName(ev, teamId));
  if (ev.live) {
    return `<span class="my-team-live">直播中</span> ${side} vs ${opponent} <strong>${ev.homeScore} - ${ev.awayScore}</strong>`;
  }
  if (type === 'next') {
    return `${formatBeijingTime(ev.date)} ${side} vs ${opponent}`;
  }
  return `${formatBeijingTime(ev.date)} ${side} vs ${opponent} <strong>${ev.homeScore} - ${ev.awayScore}</strong>`;
}

function favoriteSummary(events, entries = []) {
  if (!favoriteTeamId) return '';

  const teamName = findTeamName(favoriteTeamId, events, entries);
  const matches  = teamEvents(events, favoriteTeamId);
  const live = matches.find(ev => ev.live);
  const next = live || matches
    .filter(ev => !ev.finished && !ev.live)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const last = matches
    .filter(ev => ev.finished)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const entry = entries.find(e => e.team.id === favoriteTeamId);
  const rankPill = entry
    ? `<span class="rank-pill">第 ${statVal(entry, 'rank')} 名 · ${statVal(entry, 'points')} 分</span>`
    : '';

  return `
    <section class="my-team-card">
      <div class="my-team-head">
        <div>
          <span class="my-team-kicker">我的球队</span>
          <strong>${escapeHtml(teamName)}</strong>
        </div>
        ${rankPill}
      </div>
      <div class="my-team-grid">
        <div><span>下一场</span><p>${compactMatchLine(next, favoriteTeamId, 'next')}</p></div>
        <div><span>上一场</span><p>${compactMatchLine(last, favoriteTeamId, 'last')}</p></div>
      </div>
      <div class="my-team-form"><span>近况</span>${formDots(events, favoriteTeamId)}</div>
    </section>`;
}

// ── Rendering ─────────────────────────────────────────────
function matchCard(ev) {
  const isFav = favoriteTeamId && (ev.homeId === favoriteTeamId || ev.awayId === favoriteTeamId);

  const middle = ev.live
    ? `<span class="score live-score"><span class="live-nums">${ev.homeScore} - ${ev.awayScore}</span><span class="live-clock">${ev.displayClock}</span></span>`
    : ev.finished
      ? `<span class="score">${ev.homeScore} - ${ev.awayScore}</span>`
      : `<span class="vs">vs</span>`;

  const classes = ['match-card'];
  if (!ev.finished && !ev.live) classes.push('upcoming');
  if (isFav)   classes.push('fav-match');
  if (ev.live) classes.push('live-match');

  const homeStarHtml = (isFav && ev.homeId === favoriteTeamId) ? '<span class="fav-inline-star">★</span>' : '';
  const awayStarHtml = (isFav && ev.awayId === favoriteTeamId) ? '<span class="fav-inline-star">★</span>' : '';
  const liveTag      = ev.live ? '<span class="live-badge">直播中</span>' : '';

  return `
    <div class="${classes.join(' ')}" data-id="${ev.id}">
      <div class="match-header">
        <span class="match-date">${formatBeijingTime(ev.date)}${liveTag}</span>
      </div>
      <div class="match-teams">
        <span class="team home">${homeStarHtml}<span class="team-name">${escapeHtml(cn(ev.homeTeam))}</span>${logoImg(ev.homeId, ev.homeTeam)}</span>
        ${middle}
        <span class="team away">${logoImg(ev.awayId, ev.awayTeam)}<span class="team-name">${escapeHtml(cn(ev.awayTeam))}</span>${awayStarHtml}</span>
      </div>
    </div>`;
}

function roundSection(roundNum, events, isOpen) {
  const startLabel = formatRoundLabel(events[0].date);
  const endLabel   = formatRoundLabel(events[events.length - 1].date);
  const dateRange  = startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
  const liveCount  = events.filter(e => e.live).length;
  const liveTag    = liveCount ? `<span class="round-live-dot"></span>` : '';
  return `
    <details class="round-group" ${isOpen ? 'open' : ''}>
      <summary class="round-summary">第 ${roundNum} 轮 <span class="round-date">${dateRange}</span>${liveTag}</summary>
      <div class="round-body">${events.map(matchCard).join('')}</div>
    </details>`;
}

// ── Live refresh ──────────────────────────────────────────
function startLiveTimer() {
  if (liveTimer) return;
  liveTimer = setInterval(async () => {
    const tab = currentTab;
    if (tab === 'schedule' || tab === 'results') {
      await loadTab(tab, true);
    }
  }, LIVE_INTERVAL);
}

function stopLiveTimer() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

function syncLiveTimer(events) {
  const hasLive = events.some(e => e.live);
  hasLive ? startLiveTimer() : stopLiveTimer();
}

// ── Favorite team ─────────────────────────────────────────
async function loadFavorite() {
  const r = await storageGet('favoriteTeamId');
  favoriteTeamId = r.favoriteTeamId || null;
}

async function toggleFavorite(teamId) {
  favoriteTeamId = (favoriteTeamId === teamId) ? null : teamId;
  await storageSet({ favoriteTeamId });
  await loadTab(currentTab);
}

function bindFavoriteButtons(root) {
  root.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.teamId);
    });
  });
}

// ── Tab rendering ─────────────────────────────────────────
async function loadTab(tab, skipCache = false) {
  const seq = ++loadSeq;
  currentTab = tab;
  const content = document.getElementById('content');
  setRefreshing(true);
  if (!skipCache) {
    content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  }

  try {
    if (tab === 'schedule') {
      const events = await fetchSeasonEvents(skipCache);
      const entries = favoriteTeamId ? await fetchStandingsEntries(skipCache).catch(() => []) : [];
      if (seq !== loadSeq) return;
      syncLiveTimer(events);

      // Group ALL events by round first to preserve correct round numbers,
      // then filter each round to only upcoming/live games for display.
      const allRounds = groupByRound(events);
      const scheduleRounds = allRounds
        .map(r => r.filter(e => !e.finished || e.live))
        .filter(r => r.length > 0);

      if (!scheduleRounds.length) {
        content.innerHTML = `${favoriteSummary(events, entries)}<p class="empty">暂无赛程数据</p>`;
        return;
      }

      // Map schedule rounds back to their true round numbers
      const scheduleRoundNums = scheduleRounds.map(sr => {
        const firstId = sr[0].id;
        return allRounds.findIndex(r => r.some(e => e.id === firstId)) + 1;
      });

      const active = activeRoundIndex(scheduleRounds);
      content.innerHTML = favoriteSummary(events, entries) + scheduleRounds
        .map((r, i) => roundSection(scheduleRoundNums[i], r, i === active))
        .join('');
      bindLogoFallbacks(content);

      // Scroll active round into view
      requestAnimationFrame(() => {
        const openRound = content.querySelector('details[open] .round-body .match-card.upcoming');
        if (openRound) openRound.scrollIntoView({ block: 'start' });
      });

    } else if (tab === 'results') {
      const events   = await fetchSeasonEvents(skipCache);
      if (seq !== loadSeq) return;
      syncLiveTimer(events);

      // Group ALL events, then keep only finished rounds in reverse order
      const allRounds     = groupByRound(events);
      const finishedRounds = allRounds
        .map(r => r.filter(e => e.finished))
        .filter(r => r.length > 0);

      if (!finishedRounds.length) {
        content.innerHTML = '<p class="empty">暂无战绩数据</p>';
        return;
      }

      // Most recent round open, display in reverse (newest first)
      const reversed = [...finishedRounds].reverse();
      content.innerHTML = reversed
        .map((r, i) => roundSection(finishedRounds.length - i, r, i === 0))
        .join('');
      bindLogoFallbacks(content);

    } else if (tab === 'standings') {
      stopLiveTimer();
      const entries = await fetchStandingsEntries(skipCache);
      const events = await fetchSeasonEvents(skipCache).catch(() => []);
      if (seq !== loadSeq) return;
      if (!entries.length) {
        content.innerHTML = '<p class="empty">暂无积分榜数据</p>';
        return;
      }
      entries.sort((a, b) => statVal(a, 'rank') - statVal(b, 'rank'));
      const rows = entries.map(e => {
        const tid      = e.team.id;
        const isFav    = tid === favoriteTeamId;
        const rank     = statVal(e, 'rank');
        const gd       = statVal(e, 'pointDifferential');
        const rankClass = rank <= 3 ? 'rank-top' : rank >= entries.length - 1 ? 'rank-bottom' : '';
        const gdClass   = gd > 0 ? 'positive' : gd < 0 ? 'negative' : '';
        return `
          <tr class="${isFav ? 'fav-row' : ''} ${rankClass}">
            <td class="rank-cell">${rank}</td>
            <td class="team-name-cell">
              ${logoImg(tid, e.team.displayName)}
              <span>${escapeHtml(cn(e.team.displayName))}</span>
            </td>
            <td>${statVal(e, 'gamesPlayed')}</td>
            <td class="record-cell">${statVal(e, 'wins')}-${statVal(e, 'ties')}-${statVal(e, 'losses')}</td>
            <td class="${gdClass}">${signedValue(gd)}</td>
            <td class="points">${statVal(e, 'points')}</td>
            <td class="form-cell">${formDots(events, tid)}</td>
            <td class="fav-cell"><button class="fav-btn${isFav ? ' active' : ''}" data-team-id="${tid}">${isFav ? '★' : '☆'}</button></td>
          </tr>`;
      }).join('');
      content.innerHTML = `
        <table class="standings-table">
          <thead>
            <tr><th>#</th><th>球队</th><th>场</th><th>胜平负</th><th>净胜</th><th>积分</th><th>近况</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
      bindLogoFallbacks(content);
      bindFavoriteButtons(content);
    }
  } catch (err) {
    if (seq !== loadSeq) return;
    content.innerHTML = `
      <div class="error">
        <p>${escapeHtml(err.message)}</p>
        <button class="retry-btn" id="retry">重试</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', () => loadTab(tab));
  } finally {
    if (seq === loadSeq) setRefreshing(false);
  }
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFavorite();

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      loadTab(btn.dataset.tab);
    });
  });

  document.getElementById('refresh').addEventListener('click', () => {
    loadTab(currentTab, true);
  });

  loadTab('schedule');
});
