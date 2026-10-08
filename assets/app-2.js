import{initializeApp}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import{getDatabase,ref,set,get,update,onValue,onDisconnect,runTransaction}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig={apiKey:"AIzaSyBreTSe1m0-xlbF4aupnU5isRZCihR25IE",authDomain:"formwheel.firebaseapp.com",databaseURL:"https://formwheel-default-rtdb.firebaseio.com",projectId:"formwheel",storageBucket:"formwheel.firebasestorage.app",messagingSenderId:"431583088241",appId:"1:431583088241:web:74e0e34ea1e3e1170c55d0",measurementId:"G-T372YXDF8D"};
const app=initializeApp(firebaseConfig),db=getDatabase(app);
const MAX_ROUNDS=5,ROOT="diceDuel";

const DICE={
flame:{name:"화염 주사위",icon:"🔥",desc:"7 가중치 +10% · 바람에 강함",counter:"wind"},
ice:{name:"얼음 주사위",icon:"❄️",desc:"상대 0 가중치 +10% · 화염에 강함",counter:"flame"},
electric:{name:"전기 주사위",icon:"⚡",desc:"내 1 제거 · 얼음에 강함",counter:"ice"},
poison:{name:"독 주사위",icon:"☠️",desc:"상대 3~6 중 하나 봉쇄 · 전기에 강함",counter:"electric"},
wind:{name:"바람 주사위",icon:"🌪️",desc:"내 0 제거 · 독에 강함",counter:"poison"},
gold:{name:"황금 주사위",icon:"✨",desc:"5·6 가중치 +10% · 수정에 약함",counter:null},
rainbow:{name:"무지개 주사위",icon:"🌈",desc:"1~7 전체 +8% · 0 가중치 감소",counter:"shadow"},
shadow:{name:"그림자 주사위",icon:"🌑",desc:"6·7 가중치 +20% · 무지개에 강함",counter:"rainbow"},
crystal:{name:"수정 주사위",icon:"💎",desc:"2·4 가중치 +25% · 상대 1·2 감소",counter:"gold"},
lucky:{name:"행운 주사위",icon:"🍀",desc:"5·6·7 가중치 +18% · 0 가중치 대폭 감소",counter:"crystal"}
};

let myId="",myRole="",myNickname="",currentRoom="",roomData=null,roomListener=null,lastRollSeen="",resolvingRound=false,animating=false,winnerShown=false;
let animationRoundKey="",animationDone={1:false,2:false},animationStarted={1:false,2:false},revealedRoundKey="";
const $=id=>document.getElementById(id);
const lobby=$("lobby"),waiting=$("waiting"),game=$("game"),nickname=$("nickname"),roomInput=$("roomInput"),lobbyStatus=$("lobbyStatus"),joinBox=$("joinBox");
const createBtn=$("createBtn"),showJoinBtn=$("showJoinBtn"),joinBtn=$("joinBtn"),roomCodeText=$("roomCodeText"),copyRoomBtn=$("copyRoomBtn");
const player1Name=$("player1Name"),player2Name=$("player2Name"),player1Box=$("player1Box"),player2Box=$("player2Box"),waitingStatus=$("waitingStatus"),choiceSection=$("choiceSection"),dieGrid=$("dieGrid"),choiceStatus=$("choiceStatus"),startBtn=$("startBtn");
const miniRoomCode=$("miniRoomCode"),roundText=$("roundText"),gameName1=$("gameName1"),gameName2=$("gameName2"),gameScore1=$("gameScore1"),gameScore2=$("gameScore2"),dice1=$("dice1"),dice2=$("dice2"),diceName1=$("diceName1"),diceName2=$("diceName2"),dieType1=$("dieType1"),dieType2=$("dieType2"),rollState1=$("rollState1"),rollState2=$("rollState2"),result=$("result"),rollBtn=$("rollBtn"),roundResult=$("roundResult"),gameHelp=$("gameHelp");
const overlay=$("overlay"),modalEmoji=$("modalEmoji"),winnerTitle=$("winnerTitle"),winnerText=$("winnerText"),rematchBtn=$("rematchBtn"),leaveBtn=$("leaveBtn");

function randomRoom(){return String(Math.floor(1000+Math.random()*9000))}
function makeId(p){return p+"_"+Date.now()+"_"+Math.random().toString(36).slice(2)}
function roomRef(){return ref(db,ROOT+"/"+currentRoom)}
function nick(){return nickname.value.trim().replace(/\s+/g," ").slice(0,12)}
function status(el,msg,type=""){el.textContent=msg;el.className="status"+(type?" "+type:"")}
function playerNo(){return myRole==="host"?1:2}
function outcomeText(v){return v===0?"X":String(v)}
function setDice(el,v){
el.dataset.value=String(v);
el.setAttribute("aria-label","주사위 눈 "+String(v));
}

function renderDieChoices(){
dieGrid.innerHTML="";
Object.entries(DICE).forEach(([key,d])=>{
const card=document.createElement("div");card.className="dieCard";card.dataset.key=key;
card.innerHTML='<div class="dieTop"><span class="dieIcon">'+d.icon+'</span><span class="dieName">'+d.name+'</span><span class="selectedBadge" style="display:none">선택</span></div><div class="dieDesc">'+d.desc+'</div>';
card.onclick=()=>selectDie(key);dieGrid.appendChild(card);
});
}
async function selectDie(key){
if(!roomData||roomData.status!=="waiting")return;
try{await update(ref(db,ROOT+"/"+currentRoom+"/player"+playerNo()),{die:key})}
catch(e){console.error(e);status(choiceStatus,"주사위 선택에 실패했습니다.","error")}
}
function updateChoiceUI(){
if(!roomData)return;
const selected=roomData["player"+playerNo()]?.die;
document.querySelectorAll(".dieCard").forEach(c=>{const yes=!!selected&&c.dataset.key===selected;c.classList.toggle("selected",yes);c.querySelector(".selectedBadge").style.display=yes?"inline-block":"none"});
choiceStatus.textContent=selected?DICE[selected].icon+" "+DICE[selected].name+" 선택 완료!":"주사위를 선택하세요.";
choiceStatus.className="status"+(selected?" success":"");
}

function weightedRoll(selfDie,opponentDie){
const weights={0:1,1:1,2:1,3:1,4:1,5:1,6:1,7:1};
const self=DICE[selfDie];

if(selfDie==="flame")weights[7]*=1.10;
if(selfDie==="electric")weights[1]=0;
if(selfDie==="wind")weights[0]=0;
if(selfDie==="gold"){weights[5]*=1.10;weights[6]*=1.10}
if(selfDie==="rainbow"){for(let i=1;i<=7;i++)weights[i]*=1.08;weights[0]*=.80}
if(selfDie==="shadow"){weights[6]*=1.20;weights[7]*=1.20}
if(selfDie==="crystal"){weights[2]*=1.25;weights[4]*=1.25}
if(selfDie==="lucky"){weights[5]*=1.18;weights[6]*=1.18;weights[7]*=1.18;weights[0]*=.50}

if(opponentDie==="ice")weights[0]*=1.10;
if(opponentDie==="poison"){
  const blocked=[3,4,5,6][Math.floor(Math.random()*4)];
  weights[blocked]=0;
}
if(opponentDie==="crystal"){weights[1]*=.90;weights[2]*=.90}

if(self&&self.counter===opponentDie){
  [5,6,7].forEach(v=>weights[v]*=1.10);
}

const total=Object.values(weights).reduce((a,b)=>a+b,0);
let r=Math.random()*total;
for(const[k,w]of Object.entries(weights)){
  r-=w;
  if(r<0)return Number(k);
}
return 0;
}

function animateDice(el,finalValue){
return new Promise(resolve=>{
  el.classList.remove("rolling","reveal");
  void el.offsetWidth;
  el.classList.add("rolling");

  let count=0;
  const totalFrames=16;

  const timer=setInterval(()=>{
    setDice(el,Math.floor(Math.random()*8));
    count++;

    if(count>=totalFrames){
      clearInterval(timer);
      setDice(el,finalValue);
      el.classList.remove("rolling");
      el.classList.add("reveal");

      setTimeout(()=>{
        el.classList.remove("reveal");
        resolve();
      },650);
    }
  },78);
});
}
function showRoundAnimation(msg){
roundResult.style.display="block";roundResult.textContent=msg;
setTimeout(()=>{if(roundResult)roundResult.style.display="none"},1400);
}

function updateWaiting(){
if(!roomData)return;
player1Name.textContent=roomData.player1?.nickname||"대기 중";player2Name.textContent=roomData.player2?.nickname||"대기 중";
player1Box.classList.toggle("me",myRole==="host");player2Box.classList.toggle("me",myRole==="player");
const ready=!!roomData.player1&&!!roomData.player2;choiceSection.style.display=ready?"block":"none";
if(!ready){startBtn.disabled=true;status(waitingStatus,"친구에게 4자리 방 코드를 알려주세요.");return}
updateChoiceUI();
const bothChosen=!!roomData.player1.die&&!!roomData.player2.die;
if(myRole==="host"){startBtn.style.display="inline-block";startBtn.disabled=!bothChosen;status(waitingStatus,bothChosen?"두 플레이어의 주사위가 준비되었습니다!":"각자 사용할 주사위를 선택해주세요.",bothChosen?"success":"")}
else{startBtn.style.display="none";status(waitingStatus,bothChosen?"호스트가 게임을 시작하기를 기다리는 중...":"두 플레이어가 주사위를 선택해주세요.",bothChosen?"success":"")}
}

function updateGame(){
if(!roomData||!["playing","finished"].includes(roomData.status))return;
waiting.style.display="none";lobby.style.display="none";game.classList.add("show");
miniRoomCode.textContent=currentRoom;gameName1.textContent=roomData.player1?.nickname||"PLAYER 1";gameName2.textContent=roomData.player2?.nickname||"PLAYER 2";
gameScore1.textContent=roomData.player1?.score||0;gameScore2.textContent=roomData.player2?.score||0;
diceName1.textContent=roomData.player1?.nickname||"PLAYER 1";diceName2.textContent=roomData.player2?.nickname||"PLAYER 2";
dieType1.textContent=(DICE[roomData.player1?.die]?.icon||"")+" "+(DICE[roomData.player1?.die]?.name||"-");
dieType2.textContent=(DICE[roomData.player2?.die]?.icon||"")+" "+(DICE[roomData.player2?.die]?.name||"-");
roundText.textContent="ROUND "+(roomData.round||1)+" / "+MAX_ROUNDS;

const r=roomData.roundResults||{};
const currentRoundKey=String(roomData.round||1);

if(animationRoundKey!==currentRoundKey){
  animationRoundKey=currentRoundKey;
  animationDone={1:false,2:false};
  animationStarted={1:false,2:false};
  revealedRoundKey="";
  result.textContent="각자의 주사위를 굴려주세요!";
  roundResult.style.display="none";
}

rollState1.textContent=r["1"]==null?"아직 굴리지 않음":"결과 공개 준비 완료";
rollState2.textContent=r["2"]==null?"아직 굴리지 않음":"결과 공개 준비 완료";

const startAnimation=(who,value)=>{
  if(value===null||value===undefined||animationStarted[who])return;
  animationStarted[who]=true;

  animateDice(who===1?dice1:dice2,value).then(()=>{
    animationDone[who]=true;
    tryRevealRound();
  });
};

if(roomData.lastRollEvent&&roomData.lastRollEvent!==lastRollSeen){
  lastRollSeen=roomData.lastRollEvent;
  const who=roomData.lastRollPlayer;
  const value=who===1?roomData.dice1:roomData.dice2;
  startAnimation(who,value);
}

if(r["1"]!=null&&r["2"]!=null){
  // 새로고침/재접속 시에도 두 결과를 정상적으로 다시 연출한다.
  startAnimation(1,r["1"]);
  startAnimation(2,r["2"]);
}

if(!revealedRoundKey){
  result.textContent=(r["1"]!=null||r["2"]!=null)
    ?"🎲 주사위를 굴리는 중..."
    :"각자의 주사위를 굴려주세요!";
}
const me=playerNo(),mine=r[String(me)];
rollBtn.disabled=mine!=null||roomData.roundState==="resolving"||roomData.status==="finished";
gameHelp.textContent=roomData.roundState==="resolving"?"라운드 결과를 계산하는 중...":"두 플레이어가 모두 굴리면 라운드가 자동 처리됩니다.";

if(r["1"]!=null&&r["2"]!=null&&myRole==="host"&&roomData.roundState==="rolling")resolveRound();
if(roomData.status==="finished")showWinner();
}

function tryRevealRound(){
const r=roomData?.roundResults||{};
const key=String(roomData?.round||1);

if(r["1"]==null||r["2"]==null)return;
if(!animationDone[1]||!animationDone[2])return;
if(revealedRoundKey===key)return;

revealedRoundKey=key;

result.textContent=roomData.lastResult||("결과: "+outcomeText(r["1"])+" : "+outcomeText(r["2"]));
rollState1.textContent="결과: "+outcomeText(r["1"]);
rollState2.textContent="결과: "+outcomeText(r["2"]);

showRoundAnimation("🎉 ROUND "+roomData.round+" 결과 공개!");
}


async function createRoom(){
const n=nick();if(!n){status(lobbyStatus,"닉네임을 먼저 입력해주세요.","error");nickname.focus();return}
createBtn.disabled=true;status(lobbyStatus,"Firebase에 방을 만드는 중...");
try{
let code=null;for(let i=0;i<20;i++){const c=randomRoom(),s=await get(ref(db,ROOT+"/"+c));if(!s.exists()){code=c;break}}
if(!code)throw new Error("방 번호 생성 실패");
myId=makeId("host");myRole="host";myNickname=n;currentRoom=code;
await set(roomRef(),{status:"waiting",roundState:"waiting",roundWinner:0,hostId:myId,player1:{id:myId,nickname:n,score:0,die:null,connected:true},player2:null,round:1,dice1:null,dice2:null,roundResults:{"1":null,"2":null},lastResult:"",lastRollEvent:"",lastRollPlayer:0});
await onDisconnect(ref(db,ROOT+"/"+currentRoom+"/player1/connected")).set(false);enterWaiting();listen();
}catch(e){console.error(e);status(lobbyStatus,"Firebase 연결/권한을 확인해주세요. "+(e.message||""),"error");createBtn.disabled=false}
}

async function joinRoom(){
const n=nick(),code=roomInput.value.replace(/\D/g,"").slice(0,4);roomInput.value=code;
if(!n){status(lobbyStatus,"닉네임을 먼저 입력해주세요.","error");return}
if(!/^\d{4}$/.test(code)){status(lobbyStatus,"4자리 방 코드를 입력해주세요.","error");return}
joinBtn.disabled=true;status(lobbyStatus,"방을 확인하는 중...");
try{
const rr=ref(db,ROOT+"/"+code),s=await get(rr);if(!s.exists())throw new Error("존재하지 않는 방입니다.");
const d=s.val();if(d.status!=="waiting")throw new Error("이미 시작된 게임입니다.");if(d.player2)throw new Error("이미 2명이 참가한 방입니다.");
myId=makeId("player");myRole="player";myNickname=n;currentRoom=code;
const claim=await runTransaction(rr,d=>{
 if(d===null)return null;if(d.status!=="waiting"||d.player2)return;
 d.player2={id:myId,nickname:n,score:0,die:null,connected:true};return d;
},{applyLocally:false});
if(!claim.committed||claim.snapshot.val()?.player2?.id!==myId)throw new Error("다른 참가자가 먼저 입장했거나 게임이 시작되었습니다.");
await onDisconnect(ref(db,ROOT+"/"+currentRoom+"/player2/connected")).set(false);enterWaiting();listen();
}catch(e){console.error(e);status(lobbyStatus,e.message||"참가 실패","error");joinBtn.disabled=false}
}

function enterWaiting(){lobby.style.display="none";waiting.style.display="block";game.classList.remove("show");roomCodeText.textContent=currentRoom;renderDieChoices();updateWaiting()}
function listen(){
if(roomListener)roomListener();
roomListener=onValue(roomRef(),s=>{
if(!s.exists()){alert("방이 삭제되었습니다.");location.reload();return}
roomData=s.val();updateWaiting();updateGame();
},e=>{console.error(e);status(lobbyStatus,"Firebase 동기화 오류: "+e.message,"error")});
}

async function startGame(){
if(myRole!=="host"||!roomData?.player2?.die||!roomData?.player1?.die)return;
startBtn.disabled=true;
await update(roomRef(),{status:"playing",roundState:"rolling",roundWinner:0,round:1,dice1:null,dice2:null,roundResults:{"1":null,"2":null},lastResult:"ROUND 1 / 5 — 각자의 주사위를 굴려주세요!",lastRollEvent:"",lastRollPlayer:0,"player1/score":0,"player2/score":0});
}

async function rollMine(){
if(!roomData||roomData.status!=="playing"||roomData.roundState!=="rolling"||animating)return;
const n=playerNo(),key=String(n),expectedRound=roomData.round;
if(roomData.roundResults?.[key]!=null)return;
const self=roomData["player"+n]?.die,opp=roomData["player"+(n===1?2:1)]?.die;if(!self||!opp)return;
const value=weightedRoll(self,opp);animating=true;rollBtn.disabled=true;
const eventId=(roomData.round||1)+"-"+n+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
try{
await runTransaction(roomRef(),d=>{
 if(!d||d.status!=="playing"||d.round!==expectedRound||d.roundState!=="rolling"||d.roundResults?.[key]!=null)return;
 d["dice"+n]=value;d.roundResults=d.roundResults||{};d.roundResults[key]=value;
 d.lastRollEvent=eventId;d.lastRollPlayer=n;d.lastResult=d["player"+n].nickname+"이(가) 주사위를 굴렸습니다!";return d;
},{applyLocally:false});
}finally{setTimeout(()=>animating=false,700)}
}

async function resolveRound(){
 if(myRole!=="host"||resolvingRound||!roomData)return;
 resolvingRound=true;const expectedRound=roomData.round;
 try{
 const settled=await runTransaction(roomRef(),d=>{
  if(!d||d.status!=="playing"||d.round!==expectedRound||d.roundState!=="rolling")return;
  const a=d.roundResults?.["1"],b=d.roundResults?.["2"];if(a==null||b==null)return;
  d.roundWinner=a>b?1:b>a?2:0;
  if(a>b)d.player1.score=Number(d.player1.score||0)+1;
  if(b>a)d.player2.score=Number(d.player2.score||0)+1;
  d.lastResult=a===b?"🤝 라운드 무승부! "+outcomeText(a)+" : "+outcomeText(b):"🏆 "+d["player"+d.roundWinner].nickname+" 라운드 승리! "+outcomeText(a)+" : "+outcomeText(b);
  d.roundState="resolving";return d;
 },{applyLocally:false});
 if(!settled.committed)return;
 showRoundAnimation(settled.snapshot.val().lastResult);
 await new Promise(r=>setTimeout(r,2200));
 await runTransaction(roomRef(),d=>{
  if(!d||d.status!=="playing"||d.round!==expectedRound||d.roundState!=="resolving")return;
  if(expectedRound>=MAX_ROUNDS){d.status="finished";d.roundState="finished";d.finishedAt=Date.now();d.lastResult="최종 결과: "+d.player1.score+" : "+d.player2.score;}
  else{d.round=expectedRound+1;d.roundState="rolling";d.roundWinner=0;d.dice1=null;d.dice2=null;d.roundResults={};d.lastRollEvent="";d.lastRollPlayer=0;d.lastResult="ROUND "+d.round+" / "+MAX_ROUNDS+" — 각자의 주사위를 굴려주세요!";}
  return d;
 },{applyLocally:false});
 }catch(e){status(lobbyStatus,"라운드 저장 실패: "+e.message,"error");}finally{resolvingRound=false}
}

function showWinner(){
if(winnerShown)return;winnerShown=true;
const s1=roomData.player1.score||0,s2=roomData.player2.score||0;
if(s1>s2){modalEmoji.textContent=myRole==="host"?"🏆":"😢";winnerTitle.textContent=roomData.player1.nickname+" 승리!"}
else if(s2>s1){modalEmoji.textContent=myRole==="player"?"🏆":"😢";winnerTitle.textContent=roomData.player2.nickname+" 승리!"}
else{modalEmoji.textContent="🤝";winnerTitle.textContent="무승부!"}
winnerText.textContent="최종 점수 "+s1+" : "+s2+" · 총 "+MAX_ROUNDS+"라운드";
overlay.classList.add("show");
}

async function rematch(){
if(myRole!=="host"||!roomData?.player2){winnerText.textContent="호스트만 다시 대결을 시작할 수 있습니다.";return}
winnerShown=false;overlay.classList.remove("show");
await update(roomRef(),{status:"playing",roundState:"rolling",roundWinner:0,round:1,dice1:null,dice2:null,roundResults:{"1":null,"2":null},lastResult:"새로운 대결! ROUND 1 / 5",lastRollEvent:"",lastRollPlayer:0,"player1/score":0,"player2/score":0});
}

createBtn.onclick=createRoom;joinBtn.onclick=joinRoom;
showJoinBtn.onclick=()=>{joinBox.style.display=joinBox.style.display==="block"?"none":"block";if(joinBox.style.display==="block")roomInput.focus()};
copyRoomBtn.onclick=async()=>{try{await navigator.clipboard.writeText(currentRoom);copyRoomBtn.textContent="복사 완료!";setTimeout(()=>copyRoomBtn.textContent="코드 복사",1200)}catch{alert("방 코드: "+currentRoom)}};
startBtn.onclick=startGame;rollBtn.onclick=rollMine;rematchBtn.onclick=rematch;leaveBtn.onclick=()=>location.reload();
nickname.onkeydown=e=>{if(e.key==="Enter")createRoom()};roomInput.onkeydown=e=>{if(e.key==="Enter")joinRoom()};roomInput.oninput=()=>roomInput.value=roomInput.value.replace(/\D/g,"").slice(0,4);
