const $ = s => document.querySelector(s);
const views = ["loadingView","errorView","startView","prelimView","prelimCompleteView","mainIntroView","mainView","roundClearView","mainCompleteView","rescueIntroView","rescueView","finalistsView","finalIntroView","finalView","resultView"]
  .map(id => $("#"+id));

const FLOW_KEY = "sukigao9:flow:public:v1";
const ANON_RESULTS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzDvqkKgVkjcNwGFkJAUv0H3ArOojgb8t2u16ZkhK7oqB12yKhsKoMW0Tm6PavO8XMJBg/exec";
const ANON_SENT_KEY_PREFIX = "sukigao9:anon-sent:";
const OLD_V5_KEY = "sukigao9:flow:v5";
const OLD_V4_KEY = "sukigao9:flow:v4";
const OLD_V3_KEY = "sukigao9:flow:v3";
const OLD_V2_KEY = "sukigao9:flow:v2";
const OLD_PRELIM_KEY = "sukigao9:prelim:v1";

let membersDoc, groupsDoc, members=[], memberMap=new Map(), groupMap=new Map(), state=null, noticeTimer=null;

function showOnly(view){ views.forEach(v=>v.classList.add("hidden")); view.classList.remove("hidden"); }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const r=new Uint32Array(1);crypto.getRandomValues(r);const j=r[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }
function groupName(m){ return m.groupId ? (groupMap.get(m.groupId)?.name ?? m.groupId) : "個人"; }
function save(){ state.updatedAt=new Date().toISOString(); localStorage.setItem(FLOW_KEY,JSON.stringify(state)); }
function clearAll(){ localStorage.removeItem(FLOW_KEY); localStorage.removeItem(OLD_V5_KEY); localStorage.removeItem(OLD_V4_KEY); localStorage.removeItem(OLD_V3_KEY); localStorage.removeItem(OLD_V2_KEY); localStorage.removeItem(OLD_PRELIM_KEY); state=null; }

function prelimGroups(ids){
  if(ids.length!==137) throw new Error(`有効メンバーが137人ではありません（${ids.length}人）`);
  const sizes=shuffle([...Array(32).fill(4),...Array(3).fill(3)]);
  const s=shuffle(ids), out=[]; let p=0;
  for(const n of sizes){out.push(s.slice(p,p+n));p+=n;}
  return out;
}
function fresh(){
  const ids=members.filter(m=>m.eligible&&m.enabled).map(m=>m.id);
  return {
    version:6,datasetVersion:membersDoc.datasetVersion,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    stage:"prelim",
    prelim:{index:0,groups:prelimGroups(ids),selections:{},completed:false},
    main:null,rescue:null,finalists:null,final:null,result:null
  };
}
function migrateOld(){
  try{
    const v5=JSON.parse(localStorage.getItem(OLD_V5_KEY)||"null");
    if(v5&&v5.datasetVersion===membersDoc.datasetVersion){
      return {...v5,version:6};
    }
  }catch{}
  try{
    const v4=JSON.parse(localStorage.getItem(OLD_V4_KEY)||"null");
    if(v4&&v4.datasetVersion===membersDoc.datasetVersion){
      return {...v4,version:6};
    }
  }catch{}
  try{
    const v3=JSON.parse(localStorage.getItem(OLD_V3_KEY)||"null");
    if(v3&&v3.datasetVersion===membersDoc.datasetVersion){
      return {...v3,version:6,final:v3.final??null,result:v3.result??null};
    }
  }catch{}
  try{
    const v2=JSON.parse(localStorage.getItem(OLD_V2_KEY)||"null");
    if(v2&&v2.datasetVersion===membersDoc.datasetVersion){
      return {...v2,version:6,rescue:null,finalists:null,final:null,result:null};
    }
  }catch{}
  try{
    const o=JSON.parse(localStorage.getItem(OLD_PRELIM_KEY)||"null");
    if(!o||o.datasetVersion!==membersDoc.datasetVersion||!Array.isArray(o.groups)||o.groups.length!==35) return null;
    return {
      version:6,datasetVersion:o.datasetVersion,createdAt:o.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
      stage:o.completed?"prelimComplete":"prelim",
      prelim:{index:o.index,groups:o.groups,selections:o.selections||{},completed:!!o.completed},
      main:null,rescue:null,finalists:null,final:null,result:null
    };
  }catch{return null}
}
function load(){
  try{
    const s=JSON.parse(localStorage.getItem(FLOW_KEY)||"null");
    if(s&&s.version===6&&s.datasetVersion===membersDoc.datasetVersion) return s;
  }catch{}
  const m=migrateOld(); if(m){state=m;save();return m;} return null;
}
function selectedIds(){
  const out=[]; for(let i=0;i<state.prelim.groups.length;i++) for(const id of(state.prelim.selections[String(i)]||[])) out.push(id);
  return [...new Set(out)];
}

function renderStart(){
  const s=load();
  $("#startBtn").classList.toggle("hidden",!!s);
  $("#resumeBtn").classList.toggle("hidden",!s);
  $("#restartBtn").classList.toggle("hidden",!s);
  if(s){
    let label="前回の続きから";
    if(s.stage==="prelim") label=`前回の続きから（予選 ${Math.min(s.prelim.index+1,35)}/35）`;
    if(s.stage==="prelimComplete") label="前回の予選結果から";
    if(s.stage==="mainIntro") label="本選から続ける";
    if(s.stage==="main") label=`本選 ROUND ${s.main.round}/3 から続ける`;
    if(s.stage==="mainComplete") label="本選結果から続ける";
    if(s.stage==="rescueIntro") label="本選 最終戦から続ける";
    if(s.stage==="rescue") label="本選 最終戦の続きから";
    if(s.stage==="finalists") label="決勝進出18人から続ける";
    if(s.stage==="finalIntro") label="決勝から続ける";
    if(s.stage==="final") label="決勝の続きから";
    if(s.stage==="result") label="結果を見る";
    $("#resumeBtn").textContent=label;
  }
  showOnly($("#startView"));
}
function startNew(){ clearAll(); state=fresh(); save(); renderPrelim(); }
function resume(){
  state=load()||fresh();
  if(state.stage==="prelim")renderPrelim();
  else if(state.stage==="prelimComplete")renderPrelimComplete();
  else if(state.stage==="mainIntro")showOnly($("#mainIntroView"));
  else if(state.stage==="main")renderMain();
  else if(state.stage==="mainComplete")renderMainComplete();
  else if(state.stage==="rescueIntro")renderRescueIntro();
  else if(state.stage==="rescue")renderRescue();
  else if(state.stage==="finalists")renderFinalists();
  else if(state.stage==="finalIntro")renderFinalIntro();
  else if(state.stage==="final")renderFinal();
  else if(state.stage==="result")renderResult();
}

function makeCard(member, mode, rank=null){
  const frag=$("#candidateTemplate").content.cloneNode(true);
  const card=frag.querySelector(".candidate-card"), img=frag.querySelector(".candidate-photo"), fb=frag.querySelector(".photo-fallback");
  card.dataset.id=member.id;
  frag.querySelector(".candidate-name").textContent=member.name;
  frag.querySelector(".candidate-group").textContent=groupName(member);
  if(member.portrait?.imageUrl){
    img.src=member.portrait.imageUrl;img.alt=member.name;img.style.display="block";fb.style.display="none";
    img.addEventListener("error",()=>{img.style.display="none";fb.style.display="block";fb.textContent="IMAGE ERROR";});
  }
  if(mode==="prelim"){
    if(rank==="selected"){card.classList.add("selected");card.setAttribute("aria-pressed","true");}
  }else{
    const medal=frag.querySelector(".medal");
    if(rank===1){card.classList.add("first");medal.textContent="🥇1";}
    if(rank===2){card.classList.add("second");medal.textContent="🥈2";}
  }
  return {frag,card};
}

function renderPrelim(){
  state.stage="prelim";save();showOnly($("#prelimView"));
  const p=state.prelim, ids=p.groups[p.index]||[], selected=new Set(p.selections[String(p.index)]||[]);
  const grid=$("#prelimGrid");grid.innerHTML="";grid.classList.toggle("is-three",ids.length===3);
  for(const id of ids){
    const m=memberMap.get(id);if(!m)continue;
    const {frag,card}=makeCard(m,"prelim",selected.has(id)?"selected":null);
    card.addEventListener("click",()=>{
      const now=new Set(p.selections[String(p.index)]||[]);
      if(now.has(id))now.delete(id);else{if(now.size>=3){showLimit();return;}now.add(id);}
      p.selections[String(p.index)]=[...now];save();renderPrelim();
    });
    grid.appendChild(frag);
  }
  $("#prelimProgressText").textContent=`${p.index+1} / 35`;
  $("#prelimProgressBar").style.width=`${((p.index+1)/35)*100}%`;
  $("#selectionCount").textContent=`選択中 ${selected.size} / 3`;
  $("#prelimBackBtn").disabled=p.index===0;
}
function showLimit(){const el=$("#limitNotice");el.classList.remove("hidden");clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.add("hidden"),1300);}
function prelimNext(){
  const p=state.prelim;
  if(p.index===34){p.completed=true;p.index=35;state.stage="prelimComplete";save();renderPrelimComplete();return;}
  p.index++;save();scrollTo(0,0);renderPrelim();
}
function prelimBack(){if(state.prelim.index<=0)return;state.prelim.index--;save();scrollTo(0,0);renderPrelim();}
function renderPrelimComplete(){
  state.stage="prelimComplete";save();showOnly($("#prelimCompleteView"));
  const ids=selectedIds();$("#survivorCount").textContent=ids.length;
  const box=$("#survivorPreview");box.innerHTML="";
  ids.map(id=>memberMap.get(id)).filter(Boolean).forEach(m=>{const s=document.createElement("span");s.textContent=m.name;box.appendChild(s);});
  $("#toMainBtn").disabled=ids.length<18;
  $("#toMainBtn").textContent=ids.length<18?`候補が18人未満です（${ids.length}人）`:"🔥 本選へ";
}

function groupSizes(n){
  const sizes=[]; let a=0,b=0;
  if(n%4===0){b=n/4}
  else if(n%4===1){a=3;b=(n-9)/4}
  else if(n%4===2){a=2;b=(n-6)/4}
  else {a=1;b=(n-3)/4}
  if(b<0) throw new Error("候補人数が少なすぎます");
  sizes.push(...Array(b).fill(4),...Array(a).fill(3));
  return shuffle(sizes);
}
function initMain(){
  const ids=selectedIds();
  const ratings=Object.fromEntries(ids.map(id=>[id,1500]));
  const opponents=Object.fromEntries(ids.map(id=>[id,[]]));
  state.main={round:1,screen:0,ids,ratings,opponents,roundGroups:{},picks:{},completed:false};
  state.main.roundGroups["1"]=buildMainRoundGroups(1);
  state.stage="mainIntro";save();showOnly($("#mainIntroView"));
}
function buildMainRoundGroups(round){
  const ids=state.main.ids, sizes=groupSizes(ids.length);
  if(round===1){
    const pool=shuffle(ids),out=[];let p=0;for(const n of sizes){out.push(pool.slice(p,p+n));p+=n;}return out;
  }
  const pool=[...ids].sort((a,b)=>(state.main.ratings[b]??1500)-(state.main.ratings[a]??1500));
  return swissGroup(pool,sizes,state.main.ratings,state.main.opponents);
}
function swissGroup(pool,sizes,ratings,opponents){
  const remain=[...pool], out=[];
  for(const size of sizes){
    if(!remain.length)break;
    const group=[remain.shift()];
    while(group.length<size&&remain.length){
      let bestIdx=0,bestScore=Infinity;
      for(let i=0;i<remain.length;i++){
        const c=remain[i];
        const repeats=group.reduce((n,g)=>n+(opponents[g]||[]).includes(c),0);
        const ratingGap=group.reduce((n,g)=>n+Math.abs((ratings[g]??1500)-(ratings[c]??1500)),0);
        const score=repeats*100000+ratingGap;
        if(score<bestScore){bestScore=score;bestIdx=i;}
      }
      group.push(remain.splice(bestIdx,1)[0]);
    }
    out.push(group);
  }
  return out;
}
function eloOn(ratings,opponents,a,b,winner){
  const ra=ratings[a],rb=ratings[b],K=24;
  const ea=1/(1+10**((rb-ra)/400)),eb=1-ea;
  const sa=winner===a?1:0,sb=1-sa;
  ratings[a]=ra+K*(sa-ea);ratings[b]=rb+K*(sb-eb);
  if(!opponents[a].includes(b))opponents[a].push(b);
  if(!opponents[b].includes(a))opponents[b].push(a);
}
function applyPickOn(ratings,opponents,group,first,second){
  for(const x of group)if(x!==first)eloOn(ratings,opponents,first,x,first);
  for(const x of group)if(x!==first&&x!==second)eloOn(ratings,opponents,second,x,second);
}
function currentMainGroup(){return state.main.roundGroups[String(state.main.round)][state.main.screen];}
function currentMainPick(){return state.main.picks[`${state.main.round}-${state.main.screen}`]||[];}
function renderMain(){
  state.stage="main";save();showOnly($("#mainView"));
  const group=currentMainGroup(),pick=currentMainPick(),grid=$("#mainGrid");grid.innerHTML="";grid.classList.toggle("is-three",group.length===3);
  for(const id of group){
    const m=memberMap.get(id);if(!m)continue;
    const rank=pick[0]===id?1:pick[1]===id?2:null;
    const {frag,card}=makeCard(m,"main",rank); card.addEventListener("click",()=>mainChoose(id)); grid.appendChild(frag);
  }
  const total=state.main.roundGroups[String(state.main.round)].length;
  $("#mainRoundText").textContent=`ROUND ${state.main.round} / 3`;
  $("#mainScreenText").textContent=`${state.main.screen+1} / ${total}`;
  $("#mainProgressBar").style.width=`${((state.main.screen+1)/total)*100}%`;
  $("#mainPrompt").textContent=pick.length===0?"① 一番好きな顔は？":"② 次に好きなのは？";
  $("#mainSubPrompt").textContent=pick.length===0?"まず1位をタップ":"残りから2位をタップ";
  $("#mainBackBtn").disabled=state.main.screen===0;
}
function mainChoose(id){
  const key=`${state.main.round}-${state.main.screen}`,pick=[...(state.main.picks[key]||[])];
  if(pick.length===0){state.main.picks[key]=[id];save();renderMain();return;}
  if(pick[0]===id){state.main.picks[key]=[];save();renderMain();return;}
  if(pick.length===1){
    pick.push(id);state.main.picks[key]=pick;
    applyPickOn(state.main.ratings,state.main.opponents,currentMainGroup(),pick[0],pick[1]);save();renderMain();
    setTimeout(advanceMain,480);
  }
}
function advanceMain(){
  const groups=state.main.roundGroups[String(state.main.round)];
  if(state.main.screen<groups.length-1){state.main.screen++;save();scrollTo(0,0);renderMain();return;}
  if(state.main.round<3){
    const finished=state.main.round; showOnly($("#roundClearView")); $("#roundClearTitle").textContent=`ROUND ${finished} CLEAR!`;
    setTimeout(()=>{state.main.round++;state.main.screen=0;state.main.roundGroups[String(state.main.round)]=buildMainRoundGroups(state.main.round);save();scrollTo(0,0);renderMain();},900);
    return;
  }
  state.main.completed=true;state.stage="mainComplete";save();renderMainComplete();
}
function rebuildMainRatings(){
  const ids=state.main.ids;
  state.main.ratings=Object.fromEntries(ids.map(id=>[id,1500]));
  state.main.opponents=Object.fromEntries(ids.map(id=>[id,[]]));
  for(let r=1;r<=state.main.round;r++){
    const gs=state.main.roundGroups[String(r)]||[];
    const limit=r<state.main.round?gs.length:state.main.screen;
    for(let s=0;s<limit;s++){const p=state.main.picks[`${r}-${s}`];if(p?.length===2)applyPickOn(state.main.ratings,state.main.opponents,gs[s],p[0],p[1]);}
  }
}
function mainBack(){
  if(state.main.screen<=0)return;
  delete state.main.picks[`${state.main.round}-${state.main.screen}`];
  state.main.screen--;
  delete state.main.picks[`${state.main.round}-${state.main.screen}`];
  rebuildMainRatings();save();scrollTo(0,0);renderMain();
}
function renderMainComplete(){state.stage="mainComplete";save();showOnly($("#mainCompleteView"));}

function rankedMain(){return [...state.main.ids].sort((a,b)=>state.main.ratings[b]-state.main.ratings[a]);}
function initRescue(){
  const ranked=rankedMain();
  const locked=ranked.slice(0,Math.min(11,ranked.length));
  const border=ranked.slice(11,Math.min(30,ranked.length));
  const rounds=state.main.ids.length>45?2:1;
  const ratings=Object.fromEntries(border.map(id=>[id,state.main.ratings[id]]));
  const opponents=Object.fromEntries(border.map(id=>[id,[]]));
  state.rescue={
    rounds,round:1,screen:0,locked,border,ratings,opponents,
    roundGroups:{},picks:{},completed:false
  };
  state.rescue.roundGroups["1"]=buildRescueRoundGroups(1);
  state.stage="rescueIntro";save();renderRescueIntro();
}
function buildRescueRoundGroups(round){
  const ids=state.rescue.border,sizes=groupSizes(ids.length);
  if(round===1){
    const pool=shuffle(ids); return swissGroup(pool,sizes,state.rescue.ratings,state.rescue.opponents);
  }
  const pool=[...ids].sort((a,b)=>state.rescue.ratings[b]-state.rescue.ratings[a]);
  return swissGroup(pool,sizes,state.rescue.ratings,state.rescue.opponents);
}
function renderRescueIntro(){
  state.stage="rescueIntro";save();showOnly($("#rescueIntroView"));
  $("#rescueInfoText").textContent=`ボーダー候補 ${state.rescue?.border?.length ?? 19} 人を ${state.rescue?.rounds ?? 1} ROUND 再比較します。`;
}
function currentRescueGroup(){return state.rescue.roundGroups[String(state.rescue.round)][state.rescue.screen];}
function currentRescuePick(){return state.rescue.picks[`${state.rescue.round}-${state.rescue.screen}`]||[];}
function renderRescue(){
  state.stage="rescue";save();showOnly($("#rescueView"));
  const group=currentRescueGroup(),pick=currentRescuePick(),grid=$("#rescueGrid");grid.innerHTML="";grid.classList.toggle("is-three",group.length===3);
  for(const id of group){
    const m=memberMap.get(id);if(!m)continue;
    const rank=pick[0]===id?1:pick[1]===id?2:null;
    const {frag,card}=makeCard(m,"main",rank); card.addEventListener("click",()=>rescueChoose(id)); grid.appendChild(frag);
  }
  const total=state.rescue.roundGroups[String(state.rescue.round)].length;
  $("#rescueRoundText").textContent=state.rescue.rounds===1?`${state.rescue.screen+1} / ${total}`:`ROUND ${state.rescue.round}/${state.rescue.rounds}`;
  $("#rescueScreenText").textContent=`${state.rescue.screen+1} / ${total}`;
  $("#rescueProgressBar").style.width=`${((state.rescue.screen+1)/total)*100}%`;
  $("#rescuePrompt").textContent=pick.length===0?"① 一番好きな顔は？":"② 次に好きなのは？";
  $("#rescueSubPrompt").textContent=pick.length===0?"決勝進出をかけて、まず1位をタップ":"残りから2位をタップ";
  $("#rescueBackBtn").disabled=state.rescue.screen===0;
}
function rescueChoose(id){
  const key=`${state.rescue.round}-${state.rescue.screen}`,pick=[...(state.rescue.picks[key]||[])];
  if(pick.length===0){state.rescue.picks[key]=[id];save();renderRescue();return;}
  if(pick[0]===id){state.rescue.picks[key]=[];save();renderRescue();return;}
  if(pick.length===1){
    pick.push(id);state.rescue.picks[key]=pick;
    applyPickOn(state.rescue.ratings,state.rescue.opponents,currentRescueGroup(),pick[0],pick[1]);save();renderRescue();
    setTimeout(advanceRescue,480);
  }
}
function advanceRescue(){
  const groups=state.rescue.roundGroups[String(state.rescue.round)];
  if(state.rescue.screen<groups.length-1){state.rescue.screen++;save();scrollTo(0,0);renderRescue();return;}
  if(state.rescue.round<state.rescue.rounds){
    state.rescue.round++;state.rescue.screen=0;state.rescue.roundGroups[String(state.rescue.round)]=buildRescueRoundGroups(state.rescue.round);save();scrollTo(0,0);renderRescue();return;
  }
  finishRescue();
}
function rebuildRescueRatings(){
  const border=state.rescue.border;
  state.rescue.ratings=Object.fromEntries(border.map(id=>[id,state.main.ratings[id]]));
  state.rescue.opponents=Object.fromEntries(border.map(id=>[id,[]]));
  for(let r=1;r<=state.rescue.round;r++){
    const gs=state.rescue.roundGroups[String(r)]||[];
    const limit=r<state.rescue.round?gs.length:state.rescue.screen;
    for(let s=0;s<limit;s++){const p=state.rescue.picks[`${r}-${s}`];if(p?.length===2)applyPickOn(state.rescue.ratings,state.rescue.opponents,gs[s],p[0],p[1]);}
  }
}
function rescueBack(){
  if(state.rescue.screen<=0)return;
  delete state.rescue.picks[`${state.rescue.round}-${state.rescue.screen}`];
  state.rescue.screen--;
  delete state.rescue.picks[`${state.rescue.round}-${state.rescue.screen}`];
  rebuildRescueRatings();save();scrollTo(0,0);renderRescue();
}
function finishRescue(){
  const need=Math.max(0,18-state.rescue.locked.length);
  const borderRanked=[...state.rescue.border].sort((a,b)=>state.rescue.ratings[b]-state.rescue.ratings[a]);
  state.finalists=[...state.rescue.locked,...borderRanked.slice(0,need)].slice(0,18);
  state.rescue.completed=true;state.stage="finalists";save();renderFinalists();
}
function renderFinalists(){
  state.stage="finalists";save();showOnly($("#finalistsView"));
  const box=$("#finalistsPreview");box.innerHTML="";
  for(const id of(state.finalists||[])){const m=memberMap.get(id);if(!m)continue;const s=document.createElement("span");s.textContent=m.name;box.appendChild(s);}
}



function makeMergeTask(left,right){
  return {left:[...left],right:[...right],li:0,ri:0,out:[],done:false};
}
function currentTaskPair(task){
  if(task.done)return null;
  if(task.li>=task.left.length){
    task.out.push(...task.right.slice(task.ri)); task.done=true; return null;
  }
  if(task.ri>=task.right.length){
    task.out.push(...task.left.slice(task.li)); task.done=true; return null;
  }
  return [task.left[task.li],task.right[task.ri]];
}
function normalizeSorter(sorter){
  while(true){
    if(sorter.done)return;
    if(!sorter.tasks){
      if(sorter.runs.length===1){
        sorter.done=true; sorter.result=sorter.runs[0]; return;
      }
      const tasks=[], carry=[];
      for(let i=0;i<sorter.runs.length;i+=2){
        if(i+1<sorter.runs.length)tasks.push(makeMergeTask(sorter.runs[i],sorter.runs[i+1]));
        else carry.push(sorter.runs[i]);
      }
      sorter.tasks=tasks; sorter.carry=carry;
    }
    for(const t of sorter.tasks) currentTaskPair(t);
    if(sorter.tasks.every(t=>t.done)){
      sorter.runs=[...sorter.tasks.map(t=>t.out),...sorter.carry];
      sorter.tasks=null; sorter.carry=[];
      continue;
    }
    return;
  }
}
function sorterPairs(sorter, sorterIndex){
  normalizeSorter(sorter);
  if(sorter.done)return [];
  const pairs=[];
  sorter.tasks.forEach((task,taskIndex)=>{
    const pair=currentTaskPair(task);
    if(pair)pairs.push({sorterIndex,taskIndex,pair});
  });
  return pairs;
}
function chooseAntiStreakPair(pairs){
  if(!pairs.length)return null;
  const recent=state.final.recent||[];
  const last=recent.at(-1)||null;
  const last2=new Set(recent.slice(-2));

  const scored=pairs.map(p=>{
    const [a,b]=p.pair;
    let penalty=0;
    if(a===last||b===last)penalty+=100;
    if(last2.has(a))penalty+=15;
    if(last2.has(b))penalty+=15;
    // sorter/task tie breaker rotates naturally via cursor
    const cursor=state.final.schedulerCursor||0;
    penalty+=((p.sorterIndex*10+p.taskIndex-cursor+1000)%100)*0.001;
    return {...p,penalty};
  }).sort((x,y)=>x.penalty-y.penalty);

  const pick=scored[0];
  state.final.schedulerCursor=(pick.sorterIndex*10+pick.taskIndex+1)%100;
  return pick;
}
function initFinal(){
  const ids=[...(state.finalists||[])];
  if(ids.length!==18){alert(`決勝進出者が18人ではありません（${ids.length}人）`);return;}

  // 18人を6人×3組へ蛇行配置。3組を同時並行でソートし、
  // 独立している比較を交互に出すことで同じ人の連続登場を抑える。
  const groups=[[],[],[]];
  ids.forEach((id,i)=>groups[i%3].push(id));

  state.final={
    algorithm:"three-way-interleaved-merge-v1",
    comparisons:0,
    phase:"sort",
    sorters:groups.map(g=>({runs:g.map(id=>[id]),tasks:null,carry:[],done:false,result:null})),
    sorted:null,
    topMerge:null,
    pendingComparison:null,
    recent:[],
    schedulerCursor:0,
    lastSnapshot:null,
    completed:false,
    ranking:null
  };
  state.result=null;
  state.stage="finalIntro";save();renderFinalIntro();
}
function renderFinalIntro(){state.stage="finalIntro";save();showOnly($("#finalIntroView"));}

function snapshotFinal(){
  const copy=structuredClone(state.final);
  copy.lastSnapshot=null;
  return JSON.stringify(copy);
}
function restoreFinalSnapshot(raw){
  if(!raw)return;
  state.final=JSON.parse(raw);
  state.final.lastSnapshot=null;
}
function pushRecent(ids){
  state.final.recent=[...(state.final.recent||[]),...ids].slice(-6);
}
function ensureTopMerge(){
  if(state.final.topMerge)return;
  state.final.sorted=state.final.sorters.map(s=>s.result);
  state.final.topMerge={
    lists:state.final.sorted,
    idx:[0,0,0],
    top:[],
    mini:null
  };
}
function currentHeads(){
  const m=state.final.topMerge;
  return m.lists.map((list,i)=>list[m.idx[i]]).filter(Boolean);
}
function normalizeThreeWay(){
  const m=state.final.topMerge;
  if(m.top.length>=9){
    state.final.completed=true; state.final.ranking=m.top.slice(0,9); return null;
  }

  const heads=m.lists.map((list,i)=>({id:list[m.idx[i]],listIndex:i})).filter(x=>x.id);
  if(heads.length===0){
    state.final.completed=true; state.final.ranking=m.top.slice(0,9); return null;
  }
  if(heads.length===1){
    while(m.top.length<9 && m.lists[heads[0].listIndex][m.idx[heads[0].listIndex]]){
      m.top.push(m.lists[heads[0].listIndex][m.idx[heads[0].listIndex]++]);
    }
    return normalizeThreeWay();
  }
  if(heads.length===2){
    return {kind:"top2",a:heads[0],b:heads[1]};
  }

  if(!m.mini){
    // 3つの先頭のうち、直前に出た人をなるべく含まない2人から先に比較。
    const last=(state.final.recent||[]).at(-1);
    const combos=[[0,1],[1,2],[0,2]];
    combos.sort((x,y)=>{
      const px=(heads[x[0]].id===last||heads[x[1]].id===last)?1:0;
      const py=(heads[y[0]].id===last||heads[y[1]].id===last)?1:0;
      return px-py;
    });
    const [i,j]=combos[0];
    const k=[0,1,2].find(x=>x!==i&&x!==j);
    m.mini={first:[heads[i],heads[j]],third:heads[k],winner:null};
    return {kind:"top3-first",a:heads[i],b:heads[j]};
  }
  if(!m.mini.winner){
    return {kind:"top3-first",a:m.mini.first[0],b:m.mini.first[1]};
  }
  return {kind:"top3-second",a:m.mini.winner,b:m.mini.third};
}
function nextFinalComparison(){
  if(state.final.completed)return null;

  if(state.final.phase==="sort"){
    const pairs=[];
    state.final.sorters.forEach((s,i)=>pairs.push(...sorterPairs(s,i)));
    if(pairs.length){
      const p=chooseAntiStreakPair(pairs);
      state.final.pendingComparison={kind:"sort",...p};
      return p.pair;
    }

    if(state.final.sorters.every(s=>s.done)){
      state.final.phase="topmerge";
      ensureTopMerge();
    }
  }

  if(state.final.phase==="topmerge"){
    const c=normalizeThreeWay();
    if(!c)return null;
    state.final.pendingComparison=c;
    return [c.a.id,c.b.id];
  }
  return null;
}
function renderFinal(){
  state.stage="final";save();showOnly($("#finalView"));
  const cmp=nextFinalComparison();
  if(!cmp && state.final.completed){finishFinal();return;}
  if(!cmp)return;

  const duel=$("#finalDuel");duel.innerHTML="";
  for(const id of cmp){
    const m=memberMap.get(id);if(!m)continue;
    const {frag,card}=makeCard(m,"final",null);
    card.addEventListener("click",()=>chooseFinal(id));
    duel.appendChild(frag);
  }

  const pct=Math.min(95,Math.round((state.final.comparisons/51)*100));
  $("#finalProgressBar").style.width=`${pct}%`;
  $("#finalCompareText").textContent="TOP9選考中";
  $("#finalMadeText").textContent=`比較 ${state.final.comparisons+1} 回目`;
  $("#finalUndoBtn").disabled=!state.final.lastSnapshot;
}
function chooseFinal(id){
  const pending=state.final.pendingComparison;
  if(!pending)return;
  const pair = pending.kind==="sort" ? pending.pair : [pending.a.id,pending.b.id];
  if(!pair.includes(id))return;

  state.final.lastSnapshot=snapshotFinal();
  state.final.comparisons++;
  pushRecent(pair);

  if(pending.kind==="sort"){
    const task=state.final.sorters[pending.sorterIndex].tasks[pending.taskIndex];
    const leftId=task.left[task.li], rightId=task.right[task.ri];
    if(id===leftId){task.out.push(leftId);task.li++;}
    else{task.out.push(rightId);task.ri++;}
    currentTaskPair(task);
    normalizeSorter(state.final.sorters[pending.sorterIndex]);
  } else {
    const m=state.final.topMerge;
    if(pending.kind==="top2"){
      m.top.push(id);
      const li=pending.a.id===id?pending.a.listIndex:pending.b.listIndex;
      m.idx[li]++;
    } else if(pending.kind==="top3-first"){
      const won = pending.a.id===id ? pending.a : pending.b;
      m.mini.winner=won;
    } else if(pending.kind==="top3-second"){
      const won = pending.a.id===id ? pending.a : pending.b;
      m.top.push(won.id);
      m.idx[won.listIndex]++;
      m.mini=null;
    }
  }

  state.final.pendingComparison=null;
  save();
  renderFinal();
}
function undoFinal(){
  if(!state.final?.lastSnapshot)return;
  restoreFinalSnapshot(state.final.lastSnapshot);
  state.stage="final";save();renderFinal();
}
function finishFinal(){
  state.result=[...state.final.ranking];
  state.stage="result";save();renderResult();
}
function renderResult(){
  state.stage="result";save();showOnly($("#resultView"));
  const ranking=state.result||state.final?.ranking||[];
  const grid=$("#resultGrid");grid.innerHTML="";
  const layout=[4,5,6,2,1,3,7,8,9];
  for(const rank of layout){
    const id=ranking[rank-1],m=memberMap.get(id);
    if(!m)continue;
    const frag=$("#resultCardTemplate").content.cloneNode(true);
    const card=frag.querySelector(".result-card");
    const img=frag.querySelector(".result-photo"),fb=frag.querySelector(".result-photo-fallback");
    card.classList.add(`rank-${rank}`);
    frag.querySelector(".rank-badge").textContent=rank===1?"👑1位":`${rank}位`;
    frag.querySelector(".result-name").textContent=m.name;
    frag.querySelector(".result-group").textContent=groupName(m);
    if(m.portrait?.imageUrl){
      img.src=m.portrait.imageUrl;img.alt=m.name;img.style.display="block";fb.style.display="none";
      img.addEventListener("error",()=>{img.style.display="none";fb.style.display="block";fb.textContent="IMAGE ERROR";});
    }
    grid.appendChild(frag);
  }

  const list=$("#textRanking");list.innerHTML="";
  ranking.forEach((id,i)=>{
    const m=memberMap.get(id),row=document.createElement("div");row.className="text-rank-row";
    const r=i+1;row.innerHTML=`<strong>${r===1?"👑1位":`${r}位`}</strong><span>${m?.name??id}</span>`;
    list.appendChild(row);
  });
  updateAnonSubmitUI();
}
function anonSubmissionId(){
  if(!state.anonSubmissionId){
    const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
    state.anonSubmissionId="s9_"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    save();
  }
  return state.anonSubmissionId;
}
function anonSentKey(){return ANON_SENT_KEY_PREFIX+anonSubmissionId();}
function updateAnonSubmitUI(){
  const btn=$("#submitAnonBtn"),status=$("#anonSubmitStatus");
  if(!btn||!status)return;
  const sent=localStorage.getItem(anonSentKey())==="1";
  if(sent){
    btn.disabled=true;btn.classList.add("sent");btn.textContent="送信済み ✓";
    status.className="anon-status ok";
    status.textContent="ご協力ありがとうございます💗 集計結果は後日noteで公開予定です。";
  }else if(!ANON_RESULTS_ENDPOINT){
    btn.disabled=true;btn.classList.remove("sent");
    status.className="anon-status";
    status.textContent="匿名集計は準備中です。";
  }else{
    btn.disabled=false;btn.classList.remove("sent");btn.textContent="💗 匿名でTOP9を集計に送る";
    status.className="anon-status";status.textContent="";
  }
}
function waitForAnonResponse(submissionId,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{window.removeEventListener("message",onMessage);reject(new Error("timeout"));},timeoutMs);
    function onMessage(event){
      const d=event.data;
      if(!d||d.source!=="sukigao9-anonymous-results"||d.submissionId!==submissionId)return;
      clearTimeout(timer);window.removeEventListener("message",onMessage);
      d.ok?resolve(d):reject(new Error(d.error||"send failed"));
    }
    window.addEventListener("message",onMessage);
  });
}
async function submitAnonymousResult(){
  const btn=$("#submitAnonBtn"),status=$("#anonSubmitStatus");
  const ranking=state.result||[];
  if(!ANON_RESULTS_ENDPOINT||ranking.length!==9)return;
  const submissionId=anonSubmissionId();
  if(localStorage.getItem(anonSentKey())==="1"){updateAnonSubmitUI();return;}
  btn.disabled=true;status.className="anon-status";status.textContent="送信中…";
  const iframe=document.createElement("iframe");
  iframe.name="anonSubmitFrame_"+Date.now();iframe.style.display="none";
  const form=document.createElement("form");
  form.method="POST";form.action=ANON_RESULTS_ENDPOINT;form.target=iframe.name;form.style.display="none";
  const input=document.createElement("input");
  input.type="hidden";input.name="payload";
  input.value=JSON.stringify({submissionId,datasetVersion:state.datasetVersion,ranking});
  form.appendChild(input);document.body.append(iframe,form);
  try{
    const response=waitForAnonResponse(submissionId);
    form.submit();
    await response;
    localStorage.setItem(anonSentKey(),"1");
    updateAnonSubmitUI();
  }catch(e){
    btn.disabled=false;status.className="anon-status error";
    status.textContent="送信できませんでした。時間をおいてもう一度お試しください。";
  }finally{
    setTimeout(()=>{form.remove();iframe.remove();},500);
  }
}

function resultText(){
  const ranking=state.result||[];
  const lines=ranking.map((id,i)=>`${i+1}位 ${memberMap.get(id)?.name??id}`);
  return `私のジャニーズ好き顔9選👑\n${lines.join("\n")}\n\n#ジャニーズ好き顔9選 #ジャニーズ好き顔メーカー`;
}
function shareX(){
  const text=resultText();
  const shareUrl=location.href.split("#")[0];
  const url="https://x.com/intent/post?text="+encodeURIComponent(text)+"&url="+encodeURIComponent(shareUrl);
  window.open(url,"_blank","noopener,noreferrer");
}

async function copyResult(){
  const text = resultText();

  try{
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);

      if (!ok) throw new Error("fallback copy failed");
    }

    $("#copyNotice").classList.remove("hidden");
    setTimeout(()=>$("#copyNotice").classList.add("hidden"),1500);
  }catch{
    // 最後の保険：選択できるテキストを表示
    const textForManualCopy = resultText();
    prompt("コピーできなかったので、下のテキストを長押ししてコピーしてね。", textForManualCopy);
  }
}

$("#startBtn").onclick=startNew; $("#resumeBtn").onclick=resume;
$("#restartBtn").onclick=()=>{if(confirm("途中経過と結果を消して、最初からやり直しますか？"))startNew();}
$("#prelimNextBtn").onclick=prelimNext; $("#prelimBackBtn").onclick=prelimBack; $("#prelimQuitBtn").onclick=()=>{save();renderStart();}
$("#prelimRestartBtn").onclick=()=>{if(confirm("予選結果を消してやり直しますか？"))startNew();}
$("#toMainBtn").onclick=initMain; $("#mainStartBtn").onclick=()=>{state.stage="main";save();renderMain();}
$("#mainQuitBtn").onclick=()=>{save();renderStart();}; $("#mainBackBtn").onclick=mainBack;
$("#mainRestartBtn").onclick=()=>{if(confirm("途中経過と結果を消して、最初からやり直しますか？"))startNew();}
$("#toRescueBtn").onclick=initRescue; $("#rescueStartBtn").onclick=()=>{state.stage="rescue";save();renderRescue();}
$("#rescueQuitBtn").onclick=()=>{save();renderStart();}; $("#rescueBackBtn").onclick=rescueBack;
$("#finalistsRestartBtn").onclick=()=>{if(confirm("途中経過と結果を消して、最初からやり直しますか？"))startNew();}
$("#toFinalBtn").onclick=initFinal;
$("#finalStartBtn").onclick=()=>{state.stage="final";save();renderFinal();}
$("#finalQuitBtn").onclick=()=>{save();renderStart();};
$("#finalUndoBtn").onclick=undoFinal;
$("#submitAnonBtn").onclick=submitAnonymousResult;
$("#shareXBtn").onclick=shareX;
$("#copyResultBtn").onclick=copyResult;
$("#resultRestartBtn").onclick=()=>{if(confirm("途中経過と結果を消して、最初からやり直しますか？"))startNew();};

async function init(){
  try{
    [membersDoc,groupsDoc]=await Promise.all([
      fetch("./data/members.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`members.json HTTP ${r.status}`);return r.json()}),
      fetch("./data/groups.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`groups.json HTTP ${r.status}`);return r.json()})
    ]);
    members=membersDoc.members||[]; memberMap=new Map(members.map(m=>[m.id,m])); groupMap=new Map((groupsDoc.groups||[]).map(g=>[g.id,g]));
    const active=members.filter(m=>m.eligible&&m.enabled); if(active.length!==137)throw new Error(`有効メンバーが137人ではありません（${active.length}人）`);
    renderStart();
  }catch(e){$("#errorMessage").textContent=String(e?.message??e);showOnly($("#errorView"));}
}
init();
