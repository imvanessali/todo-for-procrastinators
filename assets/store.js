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
    }
  };
}
