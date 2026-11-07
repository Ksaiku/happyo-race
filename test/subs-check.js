// 実況字幕の突き合わせ：字幕が出た時刻のレース状況（先頭・上位2人）と並べて表示する。
// 使い方: node test/subs-check.js        （読み上げなし＝字幕のみ）
//         node test/subs-check.js voice  （読み上げを疑似再現）
const path=require('path');
const {chromium}=require('playwright');
const URL='file:///'+path.join(__dirname,'..','dist','index.html').replace(/\\/g,'/');
const FAKE=process.argv[2]==='voice';
(async()=>{
 const b=await chromium.launch({channel:'msedge'});
 const p=await (await b.newContext({viewport:{width:1920,height:1080}})).newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 if(FAKE) await p.addInitScript(()=>{
  const v={lang:'ja-JP',localService:true,name:'fake'};
  window.SpeechSynthesisUtterance=function(t){this.text=t;};
  let cur=null,tm=[];
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[v,v],addEventListener(){},cancel(){tm.forEach(clearTimeout);tm=[];if(cur){const u=cur;cur=null;u.onerror&&u.onerror({});}},
   speak(u){cur=u;tm.push(setTimeout(()=>{u.onstart&&u.onstart({});tm.push(setTimeout(()=>{if(cur===u){cur=null;u.onend&&u.onend({});}},300+u.text.length*90));},250));}}});
 });
 await p.goto(URL+'?speed=1');
 await p.evaluate(()=>{const o=RR.Core.planRace;RR.Core.planRace=function(){const pl=o.apply(this,arguments);window.__plan=pl;return pl;};});
 await p.click('#btnStart');
 await p.evaluate(()=>{});
 await p.waitForFunction(()=>window.__raceLog.done,null,{timeout:60000}).catch(async()=>{console.log('TIMEOUT',JSON.stringify(await p.evaluate(()=>({l:window.__raceLog,ph:document.getElementById('race').className}))),errs);});
 const r=await p.evaluate(()=>{const pl=window.__plan,L=window.__raceLog;
  return {names:pl.names,slowFrom:pl.slowFrom,finalFrom:pl.finalFrom,hasLC:!!pl.leadChanges,events:pl.events.map(e=>[e.t,e.type,e.runner]),
   subs:L.subs.map(s=>({...s,lead:pl.names[pl.leaderAt(s.t)],top2:[0,1].map(k=>{const o=[...Array(pl.n).keys()].sort((a,b)=>pl.progress(b,s.t)-pl.progress(a,s.t));return pl.names[o[k]]})})),errors:L.errors};});
 console.log('finalFrom',r.finalFrom,'slowFrom',r.slowFrom,'LC',r.hasLC,'events',JSON.stringify(r.events));
 r.subs.forEach(s=>console.log(String(s.t).padStart(6),s.genT,s.shownAt,s.kind.padEnd(8),s.text.padEnd(14,'　'),'lead='+s.lead,'top2='+s.top2.join('/')));
 console.log('errors',r.errors,errs);
 await b.close();
})();
