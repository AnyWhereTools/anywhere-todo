const $=id=>document.getElementById(id),host=window.anywhere;
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
let items=[],editing=null,busy=false,formDirty=false;
function status(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function action(fn){return async(...args)=>{if(busy)return;busy=true;try{await fn(...args);}catch(e){status(e.message,true);}finally{busy=false;}};}
async function sync(){
  const result=await host.notifications.replace(Todo.reminders(items));
  $('notification-status').textContent=result.authorization==='authorized'?(result.errors.length?'部分提醒登记失败：'+result.errors.join('；'):'系统提醒已同步；关闭面板后仍生效'):'通知未授权，待办已保存但无法提醒。请在系统设置 → 通知 → AnyWhere 中允许通知，再点击“检查提醒状态”。';
  $('notification-status').classList.toggle('error',result.authorization!=='authorized'||result.errors.length>0);
}
async function persist(next){Todo.validate(next);await host.storage.set('todos',{schemaVersion:1,items:next});items=next;render();status('待办已保存');try{await sync();}catch(e){$('notification-status').textContent='待办已保存，但提醒同步失败：'+e.message;$('notification-status').classList.add('error');}}
function inputDate(time){if(time===null)return '';const date=new Date(time);return new Date(time-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function edit(item){if(formDirty&&!confirm('当前编辑尚未保存，放弃修改并切换待办？'))return;formDirty=false;editing=item?.id||null;$('form').hidden=false;$('form-title').textContent=item?'编辑待办':'新建待办';$('title').value=item?.title||'';$('note').value=item?.note||'';$('priority').value=String(item?.priority||0);$('due').value=inputDate(item?.due??null);$('recurrence').value=item?.recurrence||'none';$('title').focus();}
function render(){
  const query=$('search').value.trim().toLocaleLowerCase(), now=Date.now();
  const visible=items.filter(t=>Todo.visible(t,$('filter').value,now)&&(t.title+' '+t.note).toLocaleLowerCase().includes(query)).sort((a,b)=>b.priority-a.priority||(Todo.nextDue(a,now)??Infinity)-(Todo.nextDue(b,now)??Infinity));
  const list=$('list');list.replaceChildren();
  if(!visible.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='这里还没有待办。';list.append(empty);}
  for(const item of visible){
    const row=document.createElement('article');row.id='todo-'+item.id;
    const done=document.createElement('input');done.type='checkbox';done.checked=item.done;done.setAttribute('aria-label',(item.done?'恢复 ':'完成 ')+item.title);done.onchange=action(()=>persist(items.map(t=>t.id===item.id?{...t,done:!t.done}:t)));
    const main=document.createElement('div'),title=document.createElement('button'),note=document.createElement('p'),date=document.createElement('small');
    title.className='link';title.textContent=([ '','! ','!! '][item.priority])+item.title;title.onclick=()=>edit(item);note.textContent=item.note;
    const due=Todo.nextDue(item,now);date.textContent=due===null?'未设置提醒':new Date(due).toLocaleString()+(item.recurrence==='none'?'':item.recurrence==='daily'?' · 每天':' · 每周');if(!item.done&&item.recurrence==='none'&&due!==null&&due<now)date.className='error';
    main.append(title,note,date);const remove=document.createElement('button');remove.textContent='删除';remove.className='danger';remove.onclick=action(async()=>{if(confirm(`删除“${item.title}”及其提醒？`))await persist(items.filter(t=>t.id!==item.id));});row.append(done,main,remove);list.append(row);
  }
}
$('new').onclick=()=>edit(null);$('cancel').onclick=()=>{$('form').hidden=true;editing=null;formDirty=false;};
$('form').addEventListener('input',()=>{formDirty=true;});
$('form').onsubmit=event=>{event.preventDefault();action(async()=>{
  const old=items.find(t=>t.id===editing), due=$('due').value?new Date($('due').value).getTime():null;
  const item={id:editing||uid(),title:$('title').value.trim(),note:$('note').value,priority:Number($('priority').value),done:old?.done||false,due,recurrence:due===null?'none':$('recurrence').value};
  if(!item.done&&due!==null&&item.recurrence==='none'&&due<=Date.now()&&old?.due!==due)throw new Error('新提醒时间必须晚于当前时间');
  await persist(editing?items.map(t=>t.id===editing?item:t):[...items,item]);$('form').hidden=true;editing=null;formDirty=false;
})();};
for(const id of ['filter','search'])$(id).addEventListener('input',render);
$('retry').onclick=action(sync);
setInterval(()=>{if(!busy)render();},30000);
action(async()=>{
  if(!host?.notifications)throw new Error('请升级 AnyWhere：需要定时通知服务');
  const saved=await host.storage.get('todos');if(saved){if(saved.schemaVersion!==1)throw new Error('待办数据版本不受支持，未覆盖原数据');items=Todo.validate(saved.items);}render();
  host.onEnter(context=>{const item=items.find(t=>t.id===context.argument);if(item){$('filter').value=item.done?'done':'all';$('search').value='';render();edit(item);$('todo-'+item.id)?.scrollIntoView({block:'center'});}});
  await sync();
})();
