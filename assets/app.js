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
  const MOOD_COLORS = ['#79e0a6', '#55afd5', '#7a6fd0', '#f4c340', '#e86a6e'];
  const REPEAT_LABELS = { daily: '每天', weekdays: '每工作日', weekly: '每周', monthly: '每月' };

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
    userMenu.appendChild(el('span', null, email));
    const out = el('button', 'btn-plain', '退出');
    out.onclick = () => FolioAuth.signOut();
    userMenu.appendChild(out);
    await boot();
  } else {
    showLogin();
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
    render();
    booted = true;
    scheduleMidnightRefresh();
  }

  // 跨天顺延：过去的未完成任务 → 移到今天页顶部，保持原相对顺序
  async function rollover() {
    const stale = todos
      .filter((t) => !t.done && t.day < TODAY)
      .sort((a, b) => a.day.localeCompare(b.day) || a.position - b.position);
    if (!stale.length) return;
    const todayItems = todos.filter((t) => t.day === TODAY);
    const minPos = todayItems.length ? Math.min(...todayItems.map((t) => t.position)) : 1;
    for (let i = 0; i < stale.length; i++) {
      const pos = minPos - stale.length + i;
      stale[i].day = TODAY;
      stale[i].position = pos;
      stale[i].rolled_over = true; // 仅本地标记，用于展示
      await store.update(stale[i].id, { day: TODAY, position: pos });
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

    // 添加任务
    for (const [inputId, day] of [['today-add', () => TODAY], ['tomorrow-add', () => TOMORROW]]) {
      $(inputId).addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const title = e.target.value.trim();
        if (!title) return;
        e.target.value = '';
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
    const label = day === TODAY ? `今天 · ${human(day)}` : human(day);
    $('journal-title').textContent = `${label} 的日记`;
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
    return null;
  }

  async function setRepeat(t, rule) {
    t.repeat = rule || null;
    if (t.repeat && !t.series) t.series = t.id; // 整条重复链共用一个 series
    render();
    await store.update(t.id, { repeat: t.repeat, series: t.series || null });
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
    const opts = [['', '不重复'], ['daily', '每天'], ['weekdays', '每工作日'], ['weekly', '每周'], ['monthly', '每月']];
    for (const [rule, label] of opts) {
      const b = el('button', (t.repeat || '') === rule ? 'active' : null, label);
      b.onclick = () => { closeRepeatMenu(); setRepeat(t, rule); };
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
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
    for (const [day, countId, faceId] of [
      [TODAY, 'today-count', 'today-face'],
      [TOMORROW, 'tomorrow-count', 'tomorrow-face']
    ]) {
      const items = todos.filter((t) => t.day === day);
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
    t.position = dayItems.length ? Math.max(...dayItems.map((x) => x.position)) + 1 : 1;
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

  function renderPage(listId, day, isToday) {
    const list = $(listId);
    list.innerHTML = '';
    const items = todos.filter((t) => t.day === day).sort((a, b) => a.position - b.position);

    if (!items.length) {
      const empty = el('li', 'page-empty', isToday ? '今天还没有任务。' : '改天再做也没关系。');
      list.appendChild(empty);
      return;
    }
    for (const t of items) list.appendChild(todoNode(t, isToday));
  }

  function todoNode(t, isToday) {
    const li = el('li', 'todo-item' + (t.done ? ' done' : '') + (t.rolled_over ? ' rolled-over' : ''));
    li.dataset.id = t.id;
    // mooda 主题用：按稳定哈希分配一个心情色（笔记本主题忽略）
    li.style.setProperty('--c', MOOD_COLORS[hashColor(t.id)]);

    const check = el('button', 'todo-check');
    check.title = t.done ? '标记未完成' : '标记完成';
    check.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><polyline points="4 13 9 18 20 6"/></svg>';
    check.onclick = () => toggleDone(t);
    li.appendChild(check);

    const title = el('span', 'todo-title');
    title.appendChild(el('span', 'todo-text', t.title));
    title.onclick = () => startEdit(li, title, t);
    li.appendChild(title);
    if (t.repeat) {
      const badge = el('span', 'repeat-badge', REPEAT_LABELS[t.repeat] || '重复');
      badge.title = '重复任务';
      li.appendChild(badge);
    }

    const actions = el('div', 'todo-actions');
    // 始终渲染，完成时由 CSS 隐藏（保证就地切换不需重建节点）
    const rep = el('button', 'act-repeat' + (t.repeat ? ' on' : ''), '↻');
    rep.title = t.repeat ? `重复：${REPEAT_LABELS[t.repeat]}` : '设为重复';
    rep.onclick = (e) => { e.stopPropagation(); openRepeatMenu(t, rep); };
    actions.appendChild(rep);
    const move = el('button', 'act-move', isToday ? '→' : '←');
    move.title = isToday ? '移到改天' : '移到今天';
    move.onclick = () => moveTodo(t, isToday ? TOMORROW : TODAY);
    actions.appendChild(move);
    const del = el('button', 'act-delete', '×');
    del.title = '删除';
    del.onclick = () => deleteTodo(t);
    actions.appendChild(del);
    li.appendChild(actions);
    return li;
  }

  function startEdit(li, titleSpan, t) {
    const input = el('input', 'todo-edit');
    input.value = t.title;
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
    if (t.day === TODAY || t.day === TOMORROW) {
      switchView('notebook');
      flash(document.querySelector(`#notebook-view [data-id="${t.id}"]`));
    } else {
      ganttAnchor = parse(startDate(t));
      switchView('gantt');
      flash(document.querySelector(`#gantt-view [data-id="${t.id}"]`));
    }
  }

  function flash(node) {
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.add('flash');
    setTimeout(() => node.classList.remove('flash'), 1600);
  }

  // ---------- render: gantt ----------
  // 任务条：创建日期 → 完成日期；未完成则延伸到今天（或所属日，取较晚者）
  const isoToLocalDay = (iso) => fmt(new Date(iso)); // ISO 时间戳 → 本地日期
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
      const del = el('button', 'gl-del', '×');
      del.title = '删除任务';
      del.onclick = () => deleteTodo(t);
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

  // ---------- show app ----------
  if (store) {
    $('notebook-view').classList.remove('hidden');
  }
})();
