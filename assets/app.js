/**
 * Folio App – 笔记本双页 todo + 搜索 + 甘特图。
 */
(async function () {
  // ---------- date helpers (local timezone) ----------
  const fmt = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'),
      day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const addMonths = (s, n) => {
    const d = parse(s), targetM = d.getMonth() + n;
    const x = new Date(d.getFullYear(), targetM, d.getDate());
    // 溢出（如 1/31 + 1 月）则取目标月最后一天
    if (x.getDate() !== d.getDate()) return fmt(new Date(d.getFullYear(), targetM + 1, 0));
    return fmt(x);
  };
  const human = (s) => {
    const d = parse(s);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
  };

  let TODAY = fmt(new Date());
  let TOMORROW = addDays(TODAY, 1);

  // ---------- state ----------
  let store = null;
  let sortables = {};
  let todos = [];
  let journals = {};        // { 'YYYY-MM-DD': { content, updated_at } }
  let journalDay = null;    // 当前编辑的日记日期
  let view = 'notebook';
  let ganttAnchor = parse(TODAY); // 当前甘特图月份的任意一天

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  let booted = false;

  // ---------- 主题 ----------
  const THEMES = ['notebook', 'mooda'];
  const THEME_META = {
    notebook: { label: '笔记本', next: 'mooda' },
    mooda: { label: '心情', next: 'notebook' }
  };
  // mooda 主题里每个任务循环用到的心情色
  const MOOD_COLORS = ['#79e0a6', '#7a6fd0', '#f4c340', '#e86a6e'];
  // 手绘 blob 形状（24×24），用于勾选框 / 头像
  const BLOB24 = 'M12.4 1.9 C17.3 1.5 22.1 5.6 21.8 11.6 C21.4 17.6 17.6 22.1 11.6 21.8 C6 21.4 1.9 17.6 2.2 11.2 C2.6 5.6 7.1 2.2 12.4 1.9 Z';
  // 操作图标（实心，fill 继承 currentColor）
  const ICON_REFRESH = '<svg viewBox="0 0 513.806 513.806" fill="currentColor" width="13" height="13"><path d="M66.074,228.731C81.577,123.379,179.549,50.542,284.901,66.045c35.944,5.289,69.662,20.626,97.27,44.244l-24.853,24.853c-8.33,8.332-8.328,21.84,0.005,30.17c3.999,3.998,9.423,6.245,15.078,6.246h97.835c11.782,0,21.333-9.551,21.333-21.333V52.39c-0.003-11.782-9.556-21.331-21.338-21.329c-5.655,0.001-11.079,2.248-15.078,6.246L427.418,65.04C321.658-29.235,159.497-19.925,65.222,85.835c-33.399,37.467-55.073,83.909-62.337,133.573c-2.864,17.607,9.087,34.202,26.693,37.066c1.586,0.258,3.188,0.397,4.795,0.417C50.481,256.717,64.002,244.706,66.074,228.731z"/><path d="M479.429,256.891c-16.108,0.174-29.629,12.185-31.701,28.16C432.225,390.403,334.253,463.24,228.901,447.738c-35.944-5.289-69.662-20.626-97.27-44.244l24.853-24.853c8.33-8.332,8.328-21.84-0.005-30.17c-3.999-3.998-9.423-6.245-15.078-6.246H43.568c-11.782,0-21.333,9.551-21.333,21.333v97.835c0.003,11.782,9.556,21.331,21.338,21.329c5.655-0.001,11.079-2.248,15.078-6.246l27.733-27.733c105.735,94.285,267.884,85.004,362.17-20.732c33.417-37.475,55.101-83.933,62.363-133.615c2.876-17.605-9.064-34.208-26.668-37.084C482.655,257.051,481.044,256.91,479.429,256.891z"/></svg>';
  const ICON_ARROW = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M23.73,11.356l-5.154-5.087c-.581-.574-1.575-.167-1.575,.644v3.587H1.5c-.828,0-1.5,.671-1.5,1.5s.672,1.5,1.5,1.5h15.5v3.587c0,.811,.994,1.218,1.575,.644l5.154-5.087c.36-.356,.36-.932,0-1.288Z"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 512 512" fill="currentColor" width="13" height="13"><path d="M490.667,96c0-17.673-14.327-32-32-32h-80.555C364.632,25.757,328.549,0.13,288,0h-64c-40.549,0.13-76.632,25.757-90.112,64H53.333c-17.673,0-32,14.327-32,32c0,17.673,14.327,32,32,32H64v266.667C64,459.468,116.532,512,181.333,512h149.333C395.468,512,448,459.468,448,394.667V128h10.667C476.34,128,490.667,113.673,490.667,96z M384,394.667C384,424.122,360.122,448,330.667,448H181.333C151.878,448,128,424.122,128,394.667V128h256V394.667z"/><path d="M202.667,384c17.673,0,32-14.327,32-32V224c0-17.673-14.327-32-32-32s-32,14.327-32,32v128C170.667,369.673,184.994,384,202.667,384z"/><path d="M309.333,384c17.673,0,32-14.327,32-32V224c0-17.673-14.327-32-32-32s-32,14.327-32,32v128C277.333,369.673,291.66,384,309.333,384z"/></svg>';
  const REPEAT_LABELS = { daily: '每天', weekdays: '每工作日', weekly: '每周', monthly: '每月' };
  const DOW_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  // repeat 取值：'daily'|'weekdays'|'weekly'|'monthly'，或 'dow:1,4'（按周几，数字为 getDay）
  function repeatLabel(rule) {
    if (!rule) return '';
    if (rule.startsWith('dow:')) {
      const days = rule.slice(4).split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
      return days.length ? '周' + days.map((d) => DOW_NAMES[d]).join('·') : '重复';
    }
    return REPEAT_LABELS[rule] || '重复';
  }

  function theme() { return document.documentElement.dataset.theme || 'mooda'; }
  function setupTheme() {
    const btn = $('theme-toggle');
    if (!btn) return;
    updateThemeButton();
    btn.onclick = () => {
      const next = THEME_META[theme()].next;
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('folio.theme', next); } catch {}
      updateThemeButton();
      if (booted && view === 'notebook') renderNotebook();
    };
  }
  function updateThemeButton() {
    const btn = $('theme-toggle');
    if (!btn) return;
    btn.innerHTML = '<span class="tt-emoji">🎨</span><span>换肤</span>';
    btn.title = `切换主题（当前：${THEME_META[theme()].label}）`;
  }
  setupTheme();

  // ---------- init: auth ----------
  const userMenu = $('user-menu');
  const session = await FolioAuth.getSession();
  const client = await FolioAuth.getClient();

  if (!client) {
    // 未配置 Supabase → 本地试用模式
    store = createLocalStore();
    userMenu.appendChild(el('span', 'badge-local', '本地模式 · 数据保存在此浏览器'));
    await boot();
  } else if (session) {
    store = createSupabaseStore(client);
    const email = session.user.email || '已登录';
    buildUserMenu(email);
    await boot();
  } else {
    showLogin();
  }

  // 邮箱首字母头像 + 弹出菜单（邮箱 + 退出）
  function buildUserMenu(email) {
    const initial = ((email || '').trim()[0] || '?').toUpperCase();
    const avatar = el('button', 'avatar', initial);
    avatar.title = email;
    const pop = el('div', 'user-pop hidden');
    pop.appendChild(el('div', 'user-pop-email', email));
    const out = el('button', 'user-pop-logout', '退出');
    out.onclick = () => FolioAuth.signOut();
    pop.appendChild(out);
    avatar.onclick = (e) => { e.stopPropagation(); pop.classList.toggle('hidden'); };
    document.addEventListener('click', (e) => { if (!userMenu.contains(e.target)) pop.classList.add('hidden'); });
    userMenu.appendChild(avatar);
    userMenu.appendChild(pop);
  }

  function showLogin() {
    $('view-toggle').classList.add('hidden');
    $('search-wrap').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('btn-google').onclick = () => FolioAuth.signInWithGoogle().catch(loginErr);

    let otpSent = false;
    $('otp-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = $('otp-email').value.trim();
      const btn = $('otp-submit');
      const msg = $('login-msg');
      msg.className = 'login-msg';
      btn.disabled = true;
      try {
        if (!otpSent) {
          await FolioAuth.sendEmailOtp(email);
          otpSent = true;
          $('otp-code').classList.remove('hidden');
          $('otp-code').focus();
          btn.textContent = '验证并登录';
          msg.textContent = '验证码已发送，请查收邮箱。';
        } else {
          await FolioAuth.verifyEmailOtp(email, $('otp-code').value.trim());
          window.location.reload();
        }
      } catch (err) {
        loginErr(err);
      } finally {
        btn.disabled = false;
      }
    };
  }

  function loginErr(err) {
    const msg = $('login-msg');
    msg.className = 'login-msg error';
    msg.textContent = err?.message || '出错了，请重试。';
  }

  // ---------- boot ----------
  async function boot() {
    todos = await store.list();
    try { journals = await store.listJournals(); } catch (e) { journals = {}; }
    await rollover();
    bindUI();
    // 恢复上次所在视图（在甘特图刷新仍停留甘特图）
    const savedView = (() => { try { return localStorage.getItem('folio.view'); } catch (e) { return null; } })();
    switchView(savedView === 'gantt' ? 'gantt' : 'notebook');
    booted = true;
    scheduleMidnightRefresh();
    // 实时同步：其他设备/标签页有改动时自动拉取（debounce 合并，编辑中不打断）
    if (store.subscribe) { try { store.subscribe(scheduleSync); } catch (e) {} }
    // 保底：标签页重新可见 / 窗口聚焦时同步一次（即使 Realtime 不可用，切回页面也会刷新）
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
    window.addEventListener('focus', scheduleSync);
  }

  // ---------- 实时同步 ----------
  let syncTimer = null;
  async function syncNow() {
    let next;
    try { next = await store.list(); } catch (e) { return; }
    todos = next;
    try { journals = await store.listJournals(); } catch (e) {}
    // 正在编辑或正在写日记时不重渲染，避免打断（数据已更新，下次渲染即生效）
    const busy = document.querySelector('.todo-edit') ||
      !$('journal-modal').classList.contains('hidden');
    if (!busy) render();
  }
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 250);
  }

  // 跨天顺延：过去未完成的任务 → 移到「改天 / Not Today」页顶部（已完成的留在原日期，只在甘特图体现）
  async function rollover() {
    const stale = todos
      .filter((t) => !t.done && t.day && t.day < TODAY)
      .sort((a, b) => a.day.localeCompare(b.day) || a.position - b.position);
    if (!stale.length) return;
    const laterItems = todos.filter((t) => t.day == null);
    const minPos = laterItems.length ? Math.min(...laterItems.map((t) => t.position)) : 1;
    for (let i = 0; i < stale.length; i++) {
      const pos = minPos - stale.length + i;
      stale[i].day = null;
      stale[i].position = pos;
      await store.update(stale[i].id, { day: null, position: pos });
    }
  }

  // 跨过零点时自动刷新两页
  function scheduleMidnightRefresh() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(async () => {
      TODAY = fmt(new Date());
      TOMORROW = addDays(TODAY, 1);
      await rollover();
      render();
      scheduleMidnightRefresh();
    }, next - now);
  }

  // ---------- UI bindings ----------
  function bindUI() {
    // 视图切换
    $('view-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (btn) switchView(btn.dataset.view);
    });

    // 添加任务（用 form submit，手机软键盘的「完成/前往」键也能提交）
    for (const [formId, inputId, day] of [['today-add-form', 'today-add', () => TODAY], ['tomorrow-add-form', 'tomorrow-add', () => null]]) {
      $(formId).addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $(inputId);
        const title = input.value.trim();
        if (!title) return;
        input.value = '';
        await addTodo(title, day());
      });
    }

    // 搜索
    const input = $('search-input');
    input.addEventListener('input', () => renderSearch(input.value.trim()));
    input.addEventListener('focus', () => renderSearch(input.value.trim()));
    document.addEventListener('click', (e) => {
      if (!$('search-wrap').contains(e.target)) $('search-results').innerHTML = '';
    });

    // 甘特图导航
    $('gantt-prev').onclick = () => { ganttAnchor.setMonth(ganttAnchor.getMonth() - 1); renderGantt(); };
    $('gantt-next').onclick = () => { ganttAnchor.setMonth(ganttAnchor.getMonth() + 1); renderGantt(); };
    $('gantt-today').onclick = () => { ganttAnchor = parse(TODAY); renderGantt(); };

    // 日记
    $('journal-btn').onclick = () => openJournal(TODAY);
    $('journal-close').onclick = closeJournal;
    $('journal-save').onclick = saveJournalNow;
    $('journal-modal').addEventListener('click', (e) => { if (e.target.id === 'journal-modal') closeJournal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('journal-modal').classList.contains('hidden')) closeJournal();
    });
  }

  // ---------- 日记 ----------
  function openJournal(day) {
    journalDay = day;
    $('journal-title').textContent = day === TODAY ? '随手写点' : `${human(day)} · 随手写点`;
    $('journal-text').value = journals[day]?.content || '';
    $('journal-status').textContent = '';
    $('journal-modal').classList.remove('hidden');
    $('journal-text').focus();
  }
  function closeJournal() { $('journal-modal').classList.add('hidden'); }
  async function saveJournalNow() {
    const content = $('journal-text').value;
    const text = content.trim();
    try {
      await store.saveJournal(journalDay, content);
    } catch (e) {
      $('journal-status').textContent = '保存失败：' + (e?.message || '请稍后再试');
      return;
    }
    if (text) journals[journalDay] = { content: text, updated_at: new Date().toISOString() };
    else delete journals[journalDay];
    $('journal-status').textContent = '已保存';
    if (view === 'gantt') renderGantt();
    setTimeout(closeJournal, 450);
  }

  function switchView(v) {
    view = v;
    document.querySelectorAll('#view-toggle button').forEach((b) =>
      b.classList.toggle('active', b.dataset.view === v));
    $('notebook-view').classList.toggle('hidden', v !== 'notebook');
    $('gantt-view').classList.toggle('hidden', v !== 'gantt');
    try { localStorage.setItem('folio.view', v); } catch (e) {}
    render();
  }

  // ---------- mutations ----------
  async function addTodo(title, day) {
    const dayItems = todos.filter((t) => t.day === day);
    const position = dayItems.length ? Math.max(...dayItems.map((t) => t.position)) + 1 : 1;
    const row = await store.insert({ title, day, position });
    todos.push(row);
    render();
  }

  async function toggleDone(t) {
    t.done = !t.done;
    t.completed_at = t.done ? new Date().toISOString() : null;
    // 就地切换节点，让划线/勾号动画播得出来（整页重渲染会重建节点、动画失效）
    const li = document.querySelector(`#notebook-view [data-id="${t.id}"]`);
    if (view === 'notebook' && li) {
      li.classList.toggle('done', t.done);
      li.querySelector('.todo-check').title = t.done ? '标记未完成' : '标记完成';
      if (t.done) {
        li.classList.add('celebrate');
        setTimeout(() => li.classList.remove('celebrate'), 700);
      }
      updateCounts();
    } else {
      render();
    }
    await store.update(t.id, { done: t.done, completed_at: t.completed_at });
    if (t.done && t.repeat) await spawnNext(t);
  }

  // ---------- 重复任务 ----------
  // 下一个符合规则、且严格晚于 baseDay 的日期
  function nextOccurrence(rule, baseDay) {
    if (rule === 'daily') return addDays(baseDay, 1);
    if (rule === 'weekly') return addDays(baseDay, 7);
    if (rule === 'monthly') return addMonths(baseDay, 1);
    if (rule === 'weekdays') {
      let d = baseDay;
      do { d = addDays(d, 1); } while ([0, 6].includes(parse(d).getDay()));
      return d;
    }
    if (rule && rule.startsWith('dow:')) {
      const set = new Set(rule.slice(4).split(',').filter(Boolean).map(Number));
      if (!set.size) return null;
      let d = baseDay;
      for (let i = 0; i < 7; i++) { d = addDays(d, 1); if (set.has(parse(d).getDay())) return d; }
      return null;
    }
    return null;
  }

  async function setRepeat(t, rule) {
    const wasToday = t.day === TODAY;
    t.repeat = rule || null;
    if (t.repeat && !t.series) t.series = t.id; // 整条重复链共用一个 series
    let moved = false;
    // 在「今天」设置循环 → 挪到下次发生日（平时待在右边的「改天」页）
    if (t.repeat && wasToday) {
      t.day = nextOccurrence(t.repeat, TODAY) || TOMORROW;
      const fut = todos.filter((x) => x.id !== t.id && (x.day == null || x.day > TODAY));
      t.position = fut.length ? Math.min(...fut.map((x) => x.position)) - 1 : 1;
      moved = true;
    }
    render();
    await store.update(t.id, { repeat: t.repeat, series: t.series || null, day: t.day, position: t.position });
    // 动效：移到右边后高亮一下，告知已去「改天」
    if (moved) requestAnimationFrame(() => flash(document.querySelector(`#tomorrow-list [data-id="${t.id}"]`)));
  }

  // 完成重复任务后，在下一个符合条件的日子生成新实例（基准取 max(当天, 今天)，保证不在当天，避免死循环）
  async function spawnNext(t) {
    const series = t.series || t.id;
    // 该重复链已有未完成的未来实例则不再生成，避免反复勾选产生重复
    if (todos.some((x) => (x.series || x.id) === series && !x.done && x.day > TODAY)) return;
    const base = t.day > TODAY ? t.day : TODAY;
    const day = nextOccurrence(t.repeat, base);
    if (!day) return;
    const dayItems = todos.filter((x) => x.day === day);
    const position = dayItems.length ? Math.max(...dayItems.map((x) => x.position)) + 1 : 1;
    const row = await store.insert({ title: t.title, day, position, repeat: t.repeat, series });
    todos.push(row);
    render();
  }

  function openRepeatMenu(t, anchor) {
    closeRepeatMenu();
    const menu = el('div', 'repeat-menu');
    menu.id = 'repeat-menu';
    const cur = t.repeat || '';
    const opts = [['', '不重复'], ['daily', '每天'], ['weekdays', '每工作日'], ['weekly', '每周'], ['monthly', '每月']];
    for (const [rule, label] of opts) {
      const b = el('button', cur === rule ? 'active' : null, label);
      b.onclick = () => { closeRepeatMenu(); setRepeat(t, rule); };
      menu.appendChild(b);
    }
    // 自定义：按周几重复（可多选，如 周一+周四）
    menu.appendChild(el('div', 'repeat-sep', '按周几重复'));
    const selected = new Set(cur.startsWith('dow:') ? cur.slice(4).split(',').filter(Boolean).map(Number) : []);
    const dowWrap = el('div', 'repeat-dow');
    for (let d = 0; d < 7; d++) {
      const chip = el('button', 'dow-chip' + (selected.has(d) ? ' on' : ''), DOW_NAMES[d]);
      chip.onclick = () => {
        if (selected.has(d)) selected.delete(d); else selected.add(d);
        chip.classList.toggle('on');
      };
      dowWrap.appendChild(chip);
    }
    menu.appendChild(dowWrap);
    const apply = el('button', 'repeat-apply', '应用所选周几');
    apply.onclick = () => {
      closeRepeatMenu();
      setRepeat(t, selected.size ? 'dow:' + [...selected].sort((a, b) => a - b).join(',') : '');
    };
    menu.appendChild(apply);
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const menuH = menu.offsetHeight, menuW = menu.offsetWidth;
    // 默认在按钮下方展开；若会超出视口底部（手机上常见），则改为向上展开
    let top = r.bottom + 4;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, r.top - menuH - 4);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    setTimeout(() => document.addEventListener('mousedown', onDocClickRepeat), 0);
  }
  function closeRepeatMenu() {
    const m = $('repeat-menu');
    if (m) m.remove();
    document.removeEventListener('mousedown', onDocClickRepeat);
  }
  function onDocClickRepeat(e) {
    if (!e.target.closest('#repeat-menu')) closeRepeatMenu();
  }

  function updateCounts() {
    for (const [isToday, countId, faceId] of [
      [true, 'today-count', 'today-face'],
      [false, 'tomorrow-count', 'tomorrow-face']
    ]) {
      const items = pageItems(isToday);
      const done = items.filter((t) => t.done).length;
      $(countId).textContent = items.length ? `${items.length} 项 · ${items.length - done} 项未完成` : '';
      $(faceId).innerHTML = moodFace(items.length ? done / items.length : -1, items.length);
    }
  }

  // 稳定地把任意 id 映射到色板下标
  function hashColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % MOOD_COLORS.length;
  }

  // mooda 主题的「今日心情脸」：进度越高越开心；ratio<0 表示当天还没任务
  function moodFace(ratio, count) {
    // MOODA 风：手绘 blob 脸 + 黑色墨水五官；开心时加腮红
    let fill, mouth, cheeks = '';
    if (count === 0) {                       // 空白的一天，浅色轻笑
      fill = '#cdd3da';
      mouth = '<path d="M26 39 Q32 42 38 39"/>';
    } else if (ratio === 0) {                // 还没开始，天蓝微笑
      fill = '#55afd5';
      mouth = '<path d="M25 38 Q32 43 39 38"/>';
    } else if (ratio < 0.67) {               // 做了一点，黄色微笑
      fill = '#f4c340';
      mouth = '<path d="M25 38 Q32 43 39 38"/>';
    } else if (ratio < 1) {                  // 快做完，薄荷绿开心 + 腮红
      fill = '#79e0a6';
      mouth = '<path d="M24 37 Q32 45 40 37"/>';
      cheeks = cheekMarks(3.4);
    } else {                                 // 全清空，珊瑚红大笑 + 腮红
      fill = '#e86a6e';
      mouth = '<path d="M23 36 Q32 47 41 36"/>';
      cheeks = cheekMarks(4);
    }
    const blob = 'M33 5 C46 4 59 15 58 31 C57 47 47 59 31 58 C16 57 5 47 6 30 C7 15 19 6 33 5 Z';
    return `<svg viewBox="0 0 64 64">
      <path d="${blob}" fill="${fill}"/>${cheeks}
      <g fill="#52565e"><circle cx="24" cy="27" r="2.4"/><circle cx="40" cy="27" r="2.4"/></g>
      <g fill="none" stroke="#52565e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${mouth}</g>
    </svg>`;
  }
  function cheekMarks(r) {
    return `<ellipse cx="17" cy="38" rx="${r}" ry="${r * 0.66}" fill="#ef7d7d" opacity="0.32"/>` +
           `<ellipse cx="47" cy="38" rx="${r}" ry="${r * 0.66}" fill="#ef7d7d" opacity="0.32"/>`;
  }

  async function moveTodo(t, day) {
    const dayItems = todos.filter((x) => x.day === day);
    t.day = day;
    t.position = day === null
      ? (dayItems.length ? Math.min(...dayItems.map((x) => x.position)) - 1 : 1)
      : (dayItems.length ? Math.max(...dayItems.map((x) => x.position)) + 1 : 1);
    render();
    await store.update(t.id, { day: t.day, position: t.position });
  }

  async function deleteTodo(t) {
    todos = todos.filter((x) => x.id !== t.id);
    render();
    await store.remove(t.id);
  }

  async function renameTodo(t, title) {
    if (!title || title === t.title) { render(); return; }
    t.title = title;
    render();
    await store.update(t.id, { title });
  }

  // ---------- render: notebook ----------
  function render() {
    if (view === 'notebook') renderNotebook();
    else renderGantt();
  }

  function renderNotebook() {
    renderPage('today-list', TODAY, true);
    renderPage('tomorrow-list', TOMORROW, false);
    updateCounts(); // 计数 + 心情脸
  }

  // 左页=今天的任务（含今天到期的循环任务）；
  // 右页=「改天」待办池（day 为空，无固定日期）+ 平时待命的循环任务（下次发生日还没到）
  function pageItems(isToday) {
    return isToday
      ? todos.filter((t) => t.day === TODAY)
      : todos.filter((t) => t.day == null || t.day > TODAY);
  }

  function renderPage(listId, day, isToday) {
    const list = $(listId);
    list.innerHTML = '';
    const items = pageItems(isToday).sort((a, b) => a.position - b.position);

    if (!items.length) {
      const empty = el('li', 'page-empty', isToday ? '今天还没有任务。' : '改天再做也没关系。');
      list.appendChild(empty);
      return;
    }
    for (const t of items) list.appendChild(todoNode(t, isToday));
    initSortable(listId);
  }

  // 拖动排序（鼠标 + 触摸），跨列拖动会改归属的「今天 / 改天」
  function initSortable(listId) {
    if (!window.Sortable) return;
    if (sortables[listId]) sortables[listId].destroy();
    sortables[listId] = window.Sortable.create($(listId), {
      group: 'tasks',
      handle: '.drag-handle',
      animation: 150,
      filter: '.page-empty',
      onEnd: async (evt) => { await persistOrder(evt); setTimeout(render, 0); }
    });
  }

  async function persistOrder(evt) {
    const listEls = evt.from === evt.to ? [evt.to] : [evt.from, evt.to];
    const movedId = evt.item && evt.item.dataset.id;
    const updates = [];
    for (const listEl of listEls) {
      const day = listEl.id === 'today-list' ? TODAY : null;
      [...listEl.querySelectorAll('.todo-item')].forEach((li, i) => {
        const t = todos.find((x) => x.id === li.dataset.id);
        if (!t) return;
        const pos = i + 1;
        const crossed = li.dataset.id === movedId && evt.from !== evt.to;
        const newDay = crossed ? day : t.day;
        if (t.position !== pos || t.day !== newDay) {
          t.position = pos;
          t.day = newDay;
          updates.push(store.update(t.id, { position: pos, day: t.day }));
        }
      });
    }
    await Promise.all(updates);
  }

  function todoNode(t, isToday) {
    const li = el('li', 'todo-item' + (t.done ? ' done' : ''));
    li.dataset.id = t.id;
    // mooda 主题用：按稳定哈希分配一个心情色（笔记本主题忽略）
    li.style.setProperty('--c', MOOD_COLORS[hashColor(t.id)]);

    const handle = el('span', 'drag-handle');
    handle.title = '拖动排序';
    handle.innerHTML = '<svg width="12" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.7"/><circle cx="15" cy="5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="19" r="1.7"/><circle cx="15" cy="19" r="1.7"/></svg>';
    li.appendChild(handle);

    const check = el('button', 'todo-check');
    check.title = t.done ? '标记未完成' : '标记完成';
    check.innerHTML = '<svg class="check-blob" viewBox="0 0 24 24"><path class="cb-shape" d="' + BLOB24 + '"/><path class="cb-tick" d="M7 12.4l3 3 6.4-7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    check.onclick = () => toggleDone(t);
    li.appendChild(check);

    const title = el('span', 'todo-title');
    title.appendChild(el('span', 'todo-text', t.title));
    title.onclick = () => startEdit(li, title, t);
    li.appendChild(title);
    if (t.repeat) {
      const badge = el('span', 'repeat-badge', repeatLabel(t.repeat));
      badge.title = '重复任务';
      li.appendChild(badge);
    }

    const actions = el('div', 'todo-actions');
    // 始终渲染，完成时由 CSS 隐藏（保证就地切换不需重建节点）
    const rep = el('button', 'act-repeat' + (t.repeat ? ' on' : ''));
    rep.innerHTML = ICON_REFRESH;
    rep.title = t.repeat ? `重复：${repeatLabel(t.repeat)}` : '设为重复';
    rep.onclick = (e) => { e.stopPropagation(); openRepeatMenu(t, rep); };
    actions.appendChild(rep);
    const move = el('button', 'act-move' + (isToday ? '' : ' flip'));
    move.innerHTML = ICON_ARROW;
    move.title = isToday ? '移到改天' : '移到今天';
    move.onclick = () => moveTodo(t, isToday ? null : TODAY);
    actions.appendChild(move);
    const del = el('button', 'act-delete');
    del.innerHTML = ICON_TRASH;
    del.title = '删除';
    del.onclick = () => deleteTodo(t);
    actions.appendChild(del);
    li.appendChild(actions);
    return li;
  }

  function startEdit(li, titleSpan, t) {
    const input = el('input', 'todo-edit');
    input.value = t.title;
    li.classList.add('editing');
    li.replaceChild(input, titleSpan);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    let saved = false;
    const save = () => { if (saved) return; saved = true; renameTodo(t, input.value.trim()); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) save();
      if (e.key === 'Escape') { saved = true; render(); }
    });
    input.addEventListener('blur', save);
  }

  // ---------- render: search ----------
  function renderSearch(q) {
    const box = $('search-results');
    box.innerHTML = '';
    if (!q) return;
    const matches = todos
      .filter((t) => t.title.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, 20);
    if (!matches.length) {
      box.appendChild(el('div', 'search-empty', '没有匹配的任务'));
      return;
    }
    for (const t of matches) {
      const item = el('button', 'search-result');
      item.appendChild(el('span', 'dot ' + (t.done ? 'done' : 'open')));
      item.appendChild(el('span', 'sr-title' + (t.done ? ' done' : ''), t.title));
      item.appendChild(el('span', 'sr-date', spanLabel(t)));
      item.onclick = () => jumpTo(t);
      box.appendChild(item);
    }
  }

  function spanLabel(t) {
    const start = startDate(t), end = endDate(t);
    return start === end ? human(start) : `${human(start)} → ${human(end)}`;
  }

  function jumpTo(t) {
    $('search-results').innerHTML = '';
    $('search-input').value = '';
    // 在甘特图页搜索 → 定位到甘特图上的任务条；否则今天/改天的任务回笔记本
    if (view === 'gantt' || !(t.day === TODAY || t.day == null)) {
      ganttAnchor = parse(startDate(t));
      switchView('gantt');
      flash(document.querySelector(`#gantt-view [data-id="${t.id}"]`));
    } else {
      switchView('notebook');
      flash(document.querySelector(`#notebook-view [data-id="${t.id}"]`));
    }
  }

  function flash(node) {
    if (!node) return;
    // rAF 确保切换视图后布局已就绪；inline 横向滚动到甘特图任务条
    requestAnimationFrame(() => node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }));
    const row = node.closest('.gantt-bar-row');
    if (row) {
      // 甘特图：整行（任务名 + 整月行）黄色高亮
      const targets = [row, row.previousElementSibling].filter(Boolean);
      targets.forEach((n) => n.classList.add('flash-row'));
      setTimeout(() => targets.forEach((n) => n.classList.remove('flash-row')), 1600);
    } else {
      node.classList.add('flash');
      setTimeout(() => node.classList.remove('flash'), 1600);
    }
  }

  // ---------- render: gantt ----------
  // 任务条：创建日期 → 完成日期；未完成则延伸到今天（或所属日，取较晚者）
  function isoToLocalDay(iso) { return fmt(new Date(iso)); } // ISO 时间戳 → 本地日期（函数声明：提升，boot 时即可用）
  function startDate(t) {
    return t.created_at ? isoToLocalDay(t.created_at) : t.day;
  }
  function endDate(t) {
    if (t.done && t.completed_at) return isoToLocalDay(t.completed_at);
    return t.day > TODAY ? t.day : TODAY;
  }

  function renderGantt() {
    const y = ganttAnchor.getFullYear(), m = ganttAnchor.getMonth();
    $('gantt-month').textContent = `${y}年${m + 1}月`;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const monthStart = fmt(new Date(y, m, 1));
    const monthEnd = fmt(new Date(y, m, daysInMonth));

    const tasks = todos
      .filter((t) => startDate(t) <= monthEnd && endDate(t) >= monthStart)
      .sort((a, b) => startDate(a).localeCompare(startDate(b)) || a.position - b.position);

    const box = $('gantt-container');
    box.innerHTML = '';
    if (!tasks.length) {
      box.appendChild(el('div', 'gantt-empty', '本月没有任务。'));
      return;
    }

    const LABEL_W = 200, DAY_W = 34;
    const grid = el('div', 'gantt-grid');
    grid.style.gridTemplateColumns = `${LABEL_W}px repeat(${daysInMonth}, ${DAY_W}px)`;

    // header
    grid.appendChild(el('div', 'gantt-cell gantt-head gantt-label'));
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const dayStr = fmt(date);
      const head = el('div', 'gantt-cell gantt-head' + (dayStr === TODAY ? ' today-col' : ''));
      head.innerHTML = `<span class="dow">${'日一二三四五六'[date.getDay()]}</span><span class="dom">${d}</span>`;
      if (journals[dayStr]) {
        const jb = el('button', 'gh-journal', '📝');
        jb.title = '查看这天的日记';
        jb.onclick = () => openJournal(dayStr);
        head.appendChild(jb);
      }
      grid.appendChild(head);
    }

    // rows
    for (const t of tasks) {
      const label = el('div', 'gantt-cell gantt-label' + (t.done ? ' done' : ''));
      label.title = `${t.title}\n${spanLabel(t)}`;
      label.appendChild(el('span', 'gl-text', t.title));
      const del = el('button', 'gl-del');
      del.innerHTML = ICON_TRASH;
      del.title = '删除任务';
      del.onclick = () => { if (confirm(`确定删除任务「${t.title}」吗？`)) deleteTodo(t); };
      label.appendChild(del);
      grid.appendChild(label);

      const row = el('div', 'gantt-bar-row');
      row.style.gridColumn = `2 / span ${daysInMonth}`;
      row.style.display = 'grid';
      row.style.gridTemplateColumns = `repeat(${daysInMonth}, ${DAY_W}px)`;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m, d);
        const cell = el('div', 'gantt-cell'
          + ([0, 6].includes(date.getDay()) ? ' weekend' : '')
          + (fmt(date) === TODAY ? ' today-col-body' : ''));
        cell.style.height = '34px';
        row.appendChild(cell);
      }
      // bar（裁剪到本月范围内）
      const s = startDate(t) < monthStart ? 1 : parse(startDate(t)).getDate();
      const e = endDate(t) > monthEnd ? daysInMonth : parse(endDate(t)).getDate();
      const bar = el('div', 'gantt-bar' + (t.done ? ' done' : ''));
      bar.dataset.id = t.id;
      bar.style.left = `${(s - 1) * DAY_W + 2}px`;
      bar.style.width = `${(e - s + 1) * DAY_W - 4}px`;
      bar.title = `${t.title}\n${spanLabel(t)}${t.done ? '（已完成）' : ''}`;
      row.appendChild(bar);
      grid.appendChild(row);
    }
    box.appendChild(grid);
  }

})();
