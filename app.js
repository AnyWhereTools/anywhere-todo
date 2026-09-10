const $ = id => document.getElementById(id), host = window.anywhere;
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
const views = [['today', '☀', '今天', '今天要做的事，放在这里慢慢完成。'], ['inbox', '▤', '收集箱', '先记下来，再安排到合适的清单。'], ['upcoming', '▦', '未来 7 天', '提前看看接下来要做的事。'], ['all', '≡', '全部待办', '所有尚未完成的任务。'], ['done', '✓', '已完成', '每一个完成，都值得被记住。']];
let state = Todo.readState(null), filter = 'today', editing = null, original = null, formDirty = false;
let ready = false, busy = false, undoAction = null, listEditing = null;
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}
function status(text, error = false) {
  $('message').textContent = text; $('message').classList.toggle('error', error);
  if (error && !$('form').hidden) { $('edit-status').textContent = text; $('edit-status').classList.add('error'); }
}
function action(fn) {
  return async (...args) => {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('#form input, #form textarea, #form select, #form button, #quick-form input, #quick-form button, #list-form input, #list-form button')];
    controls.forEach(control => { control.disabled = true; });
    try { await fn(...args); } catch (error) { status(error.message || '操作失败，请重试', true); }
    finally { busy = false; controls.forEach(control => { control.disabled = false; }); $('save').disabled = !ready; render(); }
  };
}
function reminderStatus(text, error = false) {
  $('notification-status').textContent = text;
  $('notification-box').classList.toggle('has-error', error);
  $('reminder-label').textContent = error ? '提醒需要处理' : '系统提醒';
  if (error) $('notification-box').open = true;
}
async function sync() {
  const requests = Todo.reminders(state.items);
  const result = await host.notifications.replace(requests);
  $('reminder-count').textContent = `${requests.length} / 50`;
  if (requests.length === 0 && result.errors.length === 0) {
    reminderStatus('还没有需要发送的提醒。设置提醒时间后，由 macOS 在约定时间通知你。');
  } else if (result.authorization !== 'authorized') {
    reminderStatus('任务已保存，但通知未授权。请在系统设置 → 通知 → AnyWhere 中允许通知，然后点击下方按钮重试。', true);
  } else if (result.errors.length) {
    reminderStatus('任务已保存，部分提醒登记失败：' + result.errors.join('；'), true);
  } else {
    reminderStatus('提醒已交给 macOS，关闭面板后仍然生效。实际展示受系统通知设置和专注模式影响。');
  }
}
async function persist(change, message = '待办已保存') {
  if (!ready) throw new Error('数据尚未成功读取，不能保存。请先重新读取数据。');
  // Re-read before each mutation. The host storage API has no cross-window CAS;
  // ponytail: use one editing window; simultaneous writes need a host transaction API.
  const raw = await host.storage.get('todos'), current = Todo.readState(raw);
  const next = Todo.validateState(change(current));
  if (raw?.schemaVersion === 1 && await host.storage.get('todos.v1Backup') == null) await host.storage.set('todos.v1Backup', raw);
  await host.storage.set('todos', next);
  state = next; undoAction = null; status(message); render();
  try { await sync(); } catch (error) { reminderStatus('任务已保存，但提醒同步失败：' + error.message, true); }
}
function inputDate(time) {
  if (time === null) return '';
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function defaults() {
  return {id: uid(), title: '', note: '', priority: 0, done: false, due: null, recurrence: 'none', deadline: filter === 'today' ? Todo.dayKey() : null,
    listId: filter.startsWith('list:') ? filter.slice(5) : null, createdAt: Date.now(), completedAt: null};
}
function canLeave() { return !formDirty || confirm('当前修改尚未保存，放弃这些修改？'); }
const narrow = matchMedia('(max-width:850px)');
function editorLayout() {
  const modal = !$('editor').hidden && narrow.matches;
  document.querySelector('main').inert = modal;
  document.querySelector('.sidebar').inert = modal;
  $('editor').setAttribute('role', modal ? 'dialog' : 'region');
  if (modal) $('editor').setAttribute('aria-modal', 'true'); else $('editor').removeAttribute('aria-modal');
}
narrow.addEventListener('change', editorLayout);
function closeEditor(force = false) {
  if (!force && !canLeave()) return false;
  formDirty = false; editing = null; original = null;
  $('editor').hidden = true; $('form').hidden = true;
  document.querySelector('.workspace').classList.remove('editing');
  editorLayout(); render(); return true;
}
function edit(item) {
  if (!ready || busy || !canLeave()) return;
  original = item ? {...item} : null; editing = item?.id || null; formDirty = false;
  const value = item || defaults();
  $('editor').hidden = false; $('form').hidden = false;
  document.querySelector('.workspace').classList.add('editing');
  $('form-title').textContent = item ? '待办详情' : '新建待办';
  $('title').value = value.title; $('note').value = value.note;
  $('priority').value = String(value.priority); $('deadline').value = value.deadline || '';
  $('due').value = inputDate(value.due); $('recurrence').value = value.recurrence;
  $('task-list').replaceChildren(new Option('收集箱', ''), ...state.lists.map(list => new Option(list.name, list.id)));
  $('task-list').value = value.listId || '';
  $('delete').hidden = !item; $('edit-status').textContent = '修改后点击保存';
  $('edit-status').classList.remove('error');
  repeatHelp(); editorLayout(); render(); $('title').focus();
}
function dirty() { formDirty = true; $('edit-status').textContent = '有未保存的修改'; $('edit-status').classList.remove('error'); }
function repeatHelp() {
  const repeated = $('recurrence').value !== 'none';
  $('repeat-help').textContent = repeated ? '这是重复提醒：每天按时刻、每周按星期和时刻通知，首次为下一次匹配。完成任务会停止后续提醒，不会自动生成新任务。' : '截止日期用于安排任务；提醒时间用于发送系统通知，可分别设置。';
}
function switchView(value) {
  if (busy || !closeEditor()) return;
  filter = value; $('search').value = ''; status(''); render();
}
function navItem(id, symbol, title) {
  const button = node('button', 'nav-item'); button.type = 'button'; button.dataset.view = id;
  if (id === filter) button.setAttribute('aria-current', 'page');
  const icon = node('span', 'nav-symbol', symbol); icon.setAttribute('aria-hidden', 'true');
  button.append(icon, node('span', 'nav-name', title), node('span', 'nav-count', String(state.items.filter(item => Todo.visible(item, id)).length)));
  button.onclick = () => switchView(id); return button;
}
function dateLabel(day) {
  if (!day) return '';
  if (day === Todo.dayKey()) return '今天';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === Todo.dayKey(tomorrow)) return '明天';
  return new Date(day + 'T12:00:00').toLocaleDateString('zh-CN', {month: 'short', day: 'numeric', ...(day.slice(0, 4) !== String(new Date().getFullYear()) ? {year: 'numeric'} : {})});
}
function changedItem(current, before) {
  const latest = current.items.find(item => item.id === before.id);
  // Native storage may reorder JSON keys; compare fields in a stable order.
  if (!latest || JSON.stringify(Object.entries(latest).sort()) !== JSON.stringify(Object.entries(before).sort())) throw new Error('此待办已在另一窗口修改。请收起详情并重新读取数据后再编辑，当前输入尚未保存。');
  return latest;
}
async function complete(item) {
  if (editing === item.id && !canLeave()) return;
  let after;
  await persist(current => {
    const latest = changedItem(current, item);
    after = {...latest, done: !latest.done, completedAt: latest.done ? null : Date.now()};
    return {...current, items: current.items.map(t => t.id === item.id ? after : t)};
  }, item.done ? '已恢复待办' : '已完成，做得不错');
  if (editing === item.id) closeEditor(true);
  undoAction = () => persist(current => {
    changedItem(current, after);
    return {...current, items: current.items.map(t => t.id === item.id ? item : t)};
  }, '已撤销');
}
function taskRow(item) {
  const row = node('article', 'task-row' + (item.done ? ' done' : '') + (editing === item.id ? ' selected' : ''));
  row.id = 'todo-' + item.id;
  const done = node('input', 'task-check'); done.type = 'checkbox'; done.checked = item.done; done.disabled = busy || !ready;
  done.setAttribute('aria-label', (item.done ? '恢复 ' : '完成 ') + item.title); done.onchange = action(() => complete(item));
  const main = node('div', 'task-main'), title = node('button', 'task-title', item.title);
  title.onclick = () => edit(item); main.append(title);
  if (item.note) main.append(node('p', 'task-note', item.note));
  const meta = node('div', 'task-meta');
  const list = state.lists.find(list => list.id === item.listId);
  if (list && filter !== 'list:' + list.id) meta.append(node('span', 'tag', list.name));
  if (item.priority) meta.append(node('span', 'tag priority-' + item.priority, item.priority === 2 ? '紧急' : '重要'));
  if (item.deadline) meta.append(node('span', 'task-date' + (Todo.overdue(item) ? ' overdue' : ''), (Todo.overdue(item) ? '已逾期 · ' : '') + dateLabel(item.deadline) + '截止'));
  if (item.due !== null) {
    const reminder = Todo.nextDue(item), clock = new Date(reminder).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false});
    meta.append(node('span', 'task-date', item.done ? '提醒已停止' : `${dateLabel(Todo.dayKey(reminder))} ${clock} 提醒${item.recurrence === 'none' ? (reminder < Date.now() ? ' · 时间已过' : '') : item.recurrence === 'daily' ? ' · 每天' : ' · 每周'}`));
  }
  if (meta.childNodes.length) main.append(meta);
  row.append(done, main); return row;
}
function render() {
  const focused = document.activeElement?.closest('[data-view]')?.dataset.view;
  $('views').replaceChildren(...views.map(([id, symbol, name]) => navItem(id, symbol, name)));
  $('lists').replaceChildren(...state.lists.map(list => navItem('list:' + list.id, '•', list.name)));
  if (focused) [...document.querySelectorAll('[data-view]')].find(el => el.dataset.view === focused)?.focus();
  const list = state.lists.find(list => filter === 'list:' + list.id), view = views.find(view => view[0] === filter);
  $('view-title').textContent = list?.name || view?.[2] || '待办';
  $('view-description').textContent = list ? '把相关的事情放在一起，一件件完成。' : view?.[3] || '';
  $('date-label').textContent = new Date().toLocaleDateString('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'});
  $('manage-list').hidden = !list; $('quick-form').hidden = filter === 'done' || !ready;
  $('new').disabled = !ready || busy; $('add-list').disabled = !ready || busy;
  $('undo').hidden = !undoAction; $('retry').disabled = !ready || busy;
  const selected = Todo.select(state.items, filter, $('search').value, $('sort').value);
  const container = $('list'); container.replaceChildren();
  if (!selected.length && ready) {
    const empty = node('div', 'empty'); empty.append(node('div', 'empty-icon', filter === 'done' ? '✓' : '☀'));
    const searching = $('search').value.trim();
    empty.append(node('h2', '', searching ? '没有找到匹配的待办' : filter === 'today' ? '今天，留一点从容' : filter === 'done' ? '完成的任务会留在这里' : '这里还很安静'),
      node('p', '', searching ? '换个关键词试试，搜索仅限当前视图。' : filter === 'today' ? '添加今天要做的事，或到收集箱安排已有任务。' : '不用一次安排好所有事，先记下下一步。'));
    if (!searching && filter !== 'done') { const add = node('button', 'quiet', '＋ 添加一个待办'); add.onclick = () => edit(null); empty.append(add); }
    container.append(empty);
  }
  const late = selected.filter(item => Todo.overdue(item)), rest = selected.filter(item => !Todo.overdue(item));
  for (const [title, items, warning] of [['已逾期', late, true], [filter === 'today' ? '今天的安排' : filter === 'done' ? '已完成' : '待办事项', rest, false]]) {
    if (!items.length) continue;
    const group = node('div', 'group-title' + (warning ? ' overdue' : ''));
    group.append(node('span', '', title), node('span', '', String(items.length))); container.append(group, ...items.map(taskRow));
  }
  const completedToday = state.items.filter(item => item.done && item.completedAt && Todo.dayKey(item.completedAt) === Todo.dayKey()).length;
  $('summary').textContent = `${selected.length} 项${filter === 'done' ? '已完成' : '待办'}${completedToday ? ` · 今天已完成 ${completedToday} 项` : ''}`;
  $('reminder-count').textContent = `${Todo.reminders(state.items).length} / 50`;
}
$('new').onclick = () => edit(null);
$('cancel').onclick = () => { if (closeEditor()) $('new').focus(); };
$('form').addEventListener('input', dirty);
$('recurrence').onchange = repeatHelp;
for (const button of document.querySelectorAll('[data-day]')) button.onclick = () => {
  const date = new Date(); date.setDate(date.getDate() + Number(button.dataset.day));
  $('deadline').value = button.dataset.day === '' ? '' : Todo.dayKey(date); dirty();
};
$('form').onsubmit = event => {
  event.preventDefault(); action(async () => {
    const due = $('due').value ? new Date($('due').value).getTime() : null;
    const item = {...(original || defaults()), title: $('title').value.trim(), note: $('note').value, priority: Number($('priority').value),
      deadline: $('deadline').value || null, listId: $('task-list').value || null, due, recurrence: due === null ? 'none' : $('recurrence').value};
    if (!item.done && due !== null && item.recurrence === 'none' && due <= Date.now() && original?.due !== due) throw new Error('新提醒时间必须晚于当前时间');
    await persist(current => {
      if (original) changedItem(current, original);
      return {...current, items: original ? current.items.map(t => t.id === original.id ? item : t) : [...current.items, item]};
    });
    closeEditor(true); $('quick-title').focus();
  })();
};
$('quick-form').onsubmit = event => {
  event.preventDefault(); action(async () => {
    const item = {...defaults(), title: $('quick-title').value.trim()};
    if (!item.title) return;
    await persist(current => ({...current, items: [...current.items, item]})); $('quick-title').value = '';
  })();
};
$('delete').onclick = action(async () => {
  if (!original || !confirm(`删除“${original.title}”？它的提醒也会取消，删除后可立即撤销。`)) return;
  const before = original;
  await persist(current => { changedItem(current, before); return {...current, items: current.items.filter(item => item.id !== before.id)}; }, '待办已删除');
  closeEditor(true);
  undoAction = () => persist(current => {
    if (current.items.some(item => item.id === before.id)) throw new Error('此待办已被恢复');
    const restored = {...before, listId: current.lists.some(list => list.id === before.listId) ? before.listId : null};
    return {...current, items: [...current.items, restored]};
  }, '已撤销删除');
});
$('undo').onclick = action(async () => { if (undoAction) await undoAction(); });
for (const id of ['search', 'sort']) $(id).addEventListener('input', render);
$('retry').onclick = action(sync);
function showListForm(list = null) {
  if (!ready || busy || !closeEditor()) return;
  listEditing = list; $('list-form').hidden = false; $('list-name').value = list?.name || '';
  $('list-form').querySelector('[type=submit]').textContent = list ? '保存' : '添加';
  $('list-delete').hidden = !list; $('list-name').focus();
}
$('add-list').onclick = () => showListForm();
$('manage-list').onclick = () => showListForm(state.lists.find(list => filter === 'list:' + list.id));
$('cancel-list').onclick = () => { $('list-form').hidden = true; listEditing = null; };
const deleteList = node('button', 'quiet danger', '删除清单'); deleteList.id = 'list-delete'; deleteList.type = 'button'; deleteList.hidden = true;
$('list-form').append(deleteList);
$('list-form').onsubmit = event => {
  event.preventDefault(); action(async () => {
    const list = {id: listEditing?.id || uid(), name: $('list-name').value.trim()};
    await persist(current => {
      if (listEditing && !current.lists.some(entry => entry.id === list.id)) throw new Error('清单已被删除，请重新读取数据');
      return {...current, lists: listEditing ? current.lists.map(entry => entry.id === list.id ? list : entry) : [...current.lists, list]};
    }, '清单已保存');
    $('list-form').hidden = true; listEditing = null; filter = 'list:' + list.id; $('search').value = '';
  })();
};
deleteList.onclick = action(async () => {
  if (!listEditing || !confirm(`删除清单“${listEditing.name}”？其中的任务会移到收集箱，不会被删除。`)) return;
  const id = listEditing.id;
  await persist(current => ({...current, lists: current.lists.filter(list => list.id !== id), items: current.items.map(item => item.listId === id ? {...item, listId: null} : item)}), '清单已删除，任务已保留');
  $('list-form').hidden = true; listEditing = null; filter = 'inbox';
});
document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && narrow.matches && !$('editor').hidden) {
    const controls = [...$('editor').querySelectorAll('button,input,textarea,select')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); edit(null); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); if (closeEditor()) $('search').focus(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !$('form').hidden) { event.preventDefault(); $('form').requestSubmit(); }
  if (event.key === 'Escape' && !$('form').hidden) { event.preventDefault(); event.stopPropagation(); closeEditor(); }
});
async function load() {
  ready = false; render();
  try {
    if (!host?.storage || !host?.notifications) throw new Error('请在支持通知服务的 AnyWhere 中打开此插件。');
    state = Todo.readState(await host.storage.get('todos'));
    ready = true; $('load-error').hidden = true; render();
    try { await sync(); } catch (error) { reminderStatus('提醒同步失败：' + error.message, true); }
  } catch (error) {
    $('load-error').hidden = false;
    $('load-error-text').textContent = error.message + '。原数据未修改，编辑已暂停。';
  }
}
$('reload').onclick = action(async () => { if (closeEditor()) await load(); });
setInterval(() => { if (!busy && !$('list').contains(document.activeElement)) render(); }, 60000);
action(load)().then(() => {
  host?.onEnter(async context => {
    if (!ready || busy) return;
    if (!formDirty) {
      try {
        const latest = Todo.readState(await host.storage.get('todos'));
        if (busy || formDirty) return;
        state = latest; render();
      } catch (error) { status(error.message, true); return; }
    }
    const item = state.items.find(item => item.id === context.argument);
    if (item && canLeave()) { formDirty = false; filter = item.done ? 'done' : 'all'; $('search').value = ''; edit(item); }
  });
});
