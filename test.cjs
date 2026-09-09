const assert=require('node:assert/strict'),{validate,reminders,nextDue,visible}=require('./logic');
const now=new Date(2026,8,9,10,0).getTime(),item={id:'one',title:'报告',note:'备注',priority:1,done:false,due:now+3600000,recurrence:'none'};
assert.equal(validate([item]).length,1);assert.equal(reminders([item])[0].date,item.due/1000);
assert.equal(reminders([{...item,done:true}]).length,0);assert.equal(reminders([{...item,due:null}]).length,0);
assert.ok(visible(item,'today',now));assert.ok(!visible(item,'overdue',now));assert.ok(visible({...item,due:now-1000},'overdue',now));
const recurring={...item,due:now-3600000,recurrence:'daily'};assert.ok(nextDue(recurring,now)>now);assert.ok(!visible(recurring,'overdue',now));
assert.throws(()=>validate([item,item]));assert.throws(()=>validate([{...item,due:NaN}]));assert.throws(()=>validate([{...item,priority:5}]));
console.log('Todo: persistence validation, completion cancellation, timestamps, recurrence and views passed.');
