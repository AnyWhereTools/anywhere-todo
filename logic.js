(function (root) {
  const bytes = value => new TextEncoder().encode(value).length;
  const validID = value => typeof value === 'string' && /^[-_a-zA-Z0-9]{1,128}$/.test(value);
  function dayKey(time = Date.now()) {
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00');
    return Number.isFinite(date.getTime()) && dayKey(date) === value;
  }
  function reminders(items) {
    return items.filter(t => !t.done && t.due !== null).map(t => ({id: t.id, title: t.title, body: t.note, date: t.due / 1000, recurrence: t.recurrence}));
  }
  function validate(items) {
    if (!Array.isArray(items) || items.length > 1000) throw new Error('最多保存 1000 条待办');
    const ids = new Set();
    for (const item of items) {
      if (!item || !validID(item.id) || ids.has(item.id)) throw new Error('待办 ID 无效或重复');
      ids.add(item.id);
      if (typeof item.title !== 'string' || !item.title.trim() || bytes(item.title) > 512) throw new Error('请填写标题（最多 512 字节）');
      if (typeof item.note !== 'string' || bytes(item.note) > 4096) throw new Error('备注最多 4096 字节');
      if (![0, 1, 2].includes(item.priority) || typeof item.done !== 'boolean' || !['none', 'daily', 'weekly'].includes(item.recurrence)) throw new Error('无效的待办字段');
      if (item.due !== null && (!Number.isFinite(item.due) || item.due <= 0 || item.due >= 32503680000000)) throw new Error('无效的提醒时间');
      if (item.due === null && item.recurrence !== 'none') throw new Error('重复提醒需要设置时间');
    }
    if (bytes(JSON.stringify(items)) > 800 * 1024) throw new Error('待办数据超过 800 KiB');
    if (reminders(items).length > 50) throw new Error('最多启用 50 条提醒，其他待办可不设提醒');
    return items;
  }
  function validateState(state) {
    if (!state || state.schemaVersion !== 2) throw new Error('待办数据版本不受支持，未覆盖原数据');
    validate(state.items);
    if (!Array.isArray(state.lists) || state.lists.length > 30) throw new Error('最多创建 30 个清单');
    const ids = new Set(), names = new Set();
    for (const list of state.lists) {
      if (!list || !validID(list.id) || ids.has(list.id) || typeof list.name !== 'string' || !list.name.trim() || list.name.length > 30) throw new Error('清单名称需为 1–30 字，ID 不可重复');
      const name = list.name.trim().toLocaleLowerCase();
      if (names.has(name)) throw new Error('已有同名清单');
      names.add(name); ids.add(list.id);
    }
    for (const item of state.items) {
      if (item.deadline !== null && !validDay(item.deadline)) throw new Error('无效的截止日期');
      if (item.listId !== null && !ids.has(item.listId)) throw new Error('待办所属清单不存在');
      if (!Number.isFinite(item.createdAt) || item.createdAt < 0 || (item.completedAt !== null && (!Number.isFinite(item.completedAt) || item.completedAt < 0))) throw new Error('无效的任务记录时间');
    }
    if (bytes(JSON.stringify(state)) > 800 * 1024) throw new Error('待办数据超过 800 KiB');
    return state;
  }
  function readState(saved) {
    if (saved == null) return {schemaVersion: 2, lists: [], items: []};
    if (saved.schemaVersion === 1) {
      validate(saved.items);
      // Old `due` was a notification time, not a deadline. Keep it unchanged.
      return validateState({schemaVersion: 2, lists: [], items: saved.items.map(item => ({...item, deadline: null, listId: null, createdAt: 0, completedAt: null}))});
    }
    return validateState(saved);
  }
  function nextDue(item, now = Date.now()) {
    if (item.due === null || item.recurrence === 'none') return item.due;
    const source = new Date(item.due), next = new Date(now);
    next.setHours(source.getHours(), source.getMinutes(), 0, 0);
    if (item.recurrence === 'weekly') next.setDate(next.getDate() + (source.getDay() - next.getDay() + 7) % 7);
    if (next.getTime() <= now) next.setDate(next.getDate() + (item.recurrence === 'weekly' ? 7 : 1));
    return next.getTime();
  }
  function scheduledDay(item, now = Date.now()) { return item.deadline || (item.due === null ? null : dayKey(nextDue(item, now))); }
  function overdue(item, now = Date.now()) { return !item.done && item.deadline != null && item.deadline < dayKey(now); }
  function visible(item, filter, now = Date.now()) {
    if (filter === 'done') return item.done;
    if (item.done) return false;
    if (filter === 'all') return true;
    if (filter === 'inbox') return item.listId == null;
    if (filter.startsWith('list:')) return item.listId === filter.slice(5);
    if (filter === 'overdue') return overdue(item, now);
    const today = dayKey(now), day = scheduledDay(item, now), reminder = nextDue(item, now);
    if (filter === 'today') return overdue(item, now) || day === today || (reminder !== null && dayKey(reminder) === today);
    const end = new Date(now); end.setDate(end.getDate() + 7);
    if (filter === 'upcoming') return day !== null && day > today && day <= dayKey(end);
    return false;
  }
  function select(items, filter, query = '', sort = 'smart', now = Date.now()) {
    const text = query.trim().toLocaleLowerCase();
    return items.filter(item => visible(item, filter, now) && (item.title + ' ' + item.note).toLocaleLowerCase().includes(text)).sort((a, b) => {
      if (filter === 'done') return (b.completedAt || 0) - (a.completedAt || 0);
      if (sort === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sort === 'priority' && a.priority !== b.priority) return b.priority - a.priority;
      return (scheduledDay(a, now) || '9999').localeCompare(scheduledDay(b, now) || '9999') || b.priority - a.priority || (b.createdAt || 0) - (a.createdAt || 0);
    });
  }
  root.Todo = {validate, validateState, readState, reminders, nextDue, visible, dayKey, validDay, scheduledDay, overdue, select};
  if (typeof module !== 'undefined') module.exports = root.Todo;
})(globalThis);
