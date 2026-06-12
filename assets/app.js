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
  const human = (s) => {
    const d = parse(s);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
  };

  let TODAY = fmt(new Date());
  let TOMORROW = addDays(TODAY, 1);

  // ---------- state ----------
  let store = null;
  let todos = [];
  let view = 'notebook';
  let ganttAnchor = parse(TODAY); // 当前甘特图月份的任意一天

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

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
    await rollover();
    bindUI();
    render();
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
    render();
    await store.update(t.id, { done: t.done, completed_at: t.completed_at });
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
    $('today-date').textContent = human(TODAY);
    $('tomorrow-date').textContent = human(TOMORROW);
    renderPage('today-list', 'today-count', TODAY, true);
    renderPage('tomorrow-list', 'tomorrow-count', TOMORROW, false);
  }

  function renderPage(listId, countId, day, isToday) {
    const list = $(listId);
    list.innerHTML = '';
    const items = todos.filter((t) => t.day === day).sort((a, b) => a.position - b.position);
    const open = items.filter((t) => !t.done).length;
    $(countId).textContent = items.length
      ? `${items.length} 项 · ${open} 项未完成` : '';

    if (!items.length) {
      const empty = el('li', 'page-empty', isToday ? '今天还没有任务。' : '明天还没有安排。');
      list.appendChild(empty);
      return;
    }
    for (const t of items) list.appendChild(todoNode(t, isToday));
  }

  function todoNode(t, isToday) {
    const li = el('li', 'todo-item' + (t.done ? ' done' : '') + (t.rolled_over ? ' rolled-over' : ''));
    li.dataset.id = t.id;

    const check = el('button', 'todo-check');
    check.title = t.done ? '标记未完成' : '标记完成';
    check.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><polyline points="4 13 9 18 20 6"/></svg>';
    check.onclick = () => toggleDone(t);
    li.appendChild(check);

    const title = el('span', 'todo-title', t.title);
    title.onclick = () => startEdit(li, title, t);
    li.appendChild(title);

    const actions = el('div', 'todo-actions');
    if (!t.done) {
      const move = el('button', null, isToday ? '→' : '←');
      move.title = isToday ? '移到明天' : '移到今天';
      move.onclick = () => moveTodo(t, isToday ? TOMORROW : TODAY);
      actions.appendChild(move);
    }
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
      const head = el('div', 'gantt-cell gantt-head' + (fmt(date) === TODAY ? ' today-col' : ''));
      head.innerHTML = `<span class="dow">${'日一二三四五六'[date.getDay()]}</span><span class="dom">${d}</span>`;
      grid.appendChild(head);
    }

    // rows
    for (const t of tasks) {
      const label = el('div', 'gantt-cell gantt-label' + (t.done ? ' done' : ''), t.title);
      label.title = `${t.title}\n${spanLabel(t)}`;
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
