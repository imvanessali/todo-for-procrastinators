/**
 * Folio Store – 数据层。
 * Supabase 已配置 → Postgres（RLS 按用户隔离）；未配置 → localStorage 试用模式。
 * 统一接口：list / insert / update / remove。
 */
function createSupabaseStore(client) {
  return {
    local: false,
    async list() {
      const { data, error } = await client.from('todos')
        .select('*').order('position', { ascending: true });
      if (error) throw error;
      return data;
    },
    async insert(todo) {
      const { data, error } = await client.from('todos').insert(todo).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { error } = await client.from('todos').update(patch).eq('id', id);
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await client.from('todos').delete().eq('id', id);
      if (error) throw error;
    },
    // 日记：按天一篇
    async listJournals() {
      const { data, error } = await client.from('journals').select('day, content, updated_at');
      if (error) throw error;
      const map = {};
      for (const r of data) map[r.day] = { content: r.content, updated_at: r.updated_at };
      return map;
    },
    async saveJournal(day, content) {
      const text = (content || '').trim();
      if (text) {
        const { error } = await client.from('journals')
          .upsert({ day, content: text, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
        if (error) throw error;
      } else {
        const { error } = await client.from('journals').delete().eq('day', day);
        if (error) throw error;
      }
    },
    // 实时同步：订阅 todos/journals 变更（Supabase Realtime，websocket 推送，非轮询）
    // 需在库中启用：alter publication supabase_realtime add table todos, journals;
    subscribe(onChange) {
      return client.channel('folio-db')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journals' }, onChange)
        .subscribe();
    }
  };
}

function createLocalStore() {
  const KEY = 'folio.todos';
  const read = () => JSON.parse(localStorage.getItem(KEY) || '[]');
  const write = (todos) => localStorage.setItem(KEY, JSON.stringify(todos));
  return {
    local: true,
    async list() {
      return read().sort((a, b) => a.position - b.position);
    },
    async insert(todo) {
      const todos = read();
      const row = {
        id: crypto.randomUUID(),
        done: false,
        created_at: new Date().toISOString(),
        completed_at: null,
        ...todo
      };
      todos.push(row);
      write(todos);
      return row;
    },
    async update(id, patch) {
      write(read().map(t => t.id === id ? { ...t, ...patch } : t));
    },
    async remove(id) {
      write(read().filter(t => t.id !== id));
    },
    // 日记：按天一篇，存为 { 'YYYY-MM-DD': { content, updated_at } }
    async listJournals() {
      return JSON.parse(localStorage.getItem('folio.journals') || '{}');
    },
    async saveJournal(day, content) {
      const j = JSON.parse(localStorage.getItem('folio.journals') || '{}');
      const text = (content || '').trim();
      if (text) j[day] = { content: text, updated_at: new Date().toISOString() };
      else delete j[day];
      localStorage.setItem('folio.journals', JSON.stringify(j));
    },
    // 同一浏览器多标签页同步
    subscribe(onChange) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'folio.todos' || e.key === 'folio.journals') onChange(e);
      });
    }
  };
}
