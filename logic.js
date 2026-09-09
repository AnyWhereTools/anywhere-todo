(function(root){
  function validate(items){
    if(!Array.isArray(items)||items.length>1000)throw new Error('最多保存 1000 条待办');
    const ids=new Set();
    for(const item of items){
      if(!item||typeof item.id!=='string'||!/^[-_a-zA-Z0-9]{1,128}$/.test(item.id)||ids.has(item.id))throw new Error('待办 ID 无效或重复');ids.add(item.id);
      if(typeof item.title!=='string'||!item.title.trim()||new TextEncoder().encode(item.title).length>512)throw new Error('请填写标题（最多 512 字节）');
      if(typeof item.note!=='string'||new TextEncoder().encode(item.note).length>4096)throw new Error('备注最多 4096 字节');
      if(![0,1,2].includes(item.priority)||typeof item.done!=='boolean'||!['none','daily','weekly'].includes(item.recurrence))throw new Error('无效的待办字段');
      if(item.due!==null&&(!Number.isFinite(item.due)||item.due<=0||item.due>=32503680000000))throw new Error('无效的提醒时间');
    }
    if(new TextEncoder().encode(JSON.stringify(items)).length>800*1024)throw new Error('待办数据超过 800 KiB');
    if(reminders(items).length>50)throw new Error('最多启用 50 条提醒，其他待办可不设提醒');
    return items;
  }
  function reminders(items){return items.filter(t=>!t.done&&t.due!==null).map(t=>({id:t.id,title:t.title,body:t.note,date:t.due/1000,recurrence:t.recurrence}));}
  function nextDue(item, now=Date.now()){
    if(item.due===null||item.recurrence==='none')return item.due;
    const source=new Date(item.due),next=new Date(now);next.setHours(source.getHours(),source.getMinutes(),0,0);
    if(item.recurrence==='weekly')next.setDate(next.getDate()+(source.getDay()-next.getDay()+7)%7);
    if(next.getTime()<=now)next.setDate(next.getDate()+(item.recurrence==='weekly'?7:1));
    return next.getTime();
  }
  function visible(item,filter,now=Date.now()){
    if(filter==='done')return item.done;if(item.done)return false;
    if(filter==='all')return true;const due=nextDue(item,now);if(due===null)return false;
    const start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
    if(filter==='today')return due>=start.getTime()&&due<end.getTime();
    if(filter==='overdue')return item.recurrence==='none'&&due<now;
    return due>=end.getTime();
  }
  root.Todo={validate,reminders,nextDue,visible};if(typeof module!=='undefined')module.exports=root.Todo;
})(globalThis);
