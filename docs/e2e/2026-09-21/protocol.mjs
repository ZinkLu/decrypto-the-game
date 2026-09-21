// Diagnostic probes for an isolated local test server; failures document observed defects.
import fs from 'node:fs';
const outDir=process.env.E2E_OUTPUT_DIR || '/tmp/decrypto-e2e'; fs.mkdirSync(outDir,{recursive:true});
const results=[];const events=[];const clients=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function record(name,pass,detail){const r={name,pass,detail}; results.push(r);console.log(JSON.stringify(r));}
async function client(name){const c={name,ws:new WebSocket(process.env.E2E_WS_URL || 'ws://localhost:8080/ws'),messages:[],listeners:[]};clients.push(c);c.send=(type,data={})=>c.ws.send(JSON.stringify({type,data}));c.ws.onmessage=e=>{const m=JSON.parse(e.data);m.at=Date.now();c.messages.push(m);events.push({client:name,...m});for(const f of c.listeners)f(m);};await new Promise((r,j)=>{c.ws.onopen=r;c.ws.onerror=j;});c.wait=async(pred,after=0,timeout=4000)=>{const start=Date.now();while(Date.now()-start<timeout){const m=c.messages.slice(after).find(pred);if(m)return m;await delay(20);}throw Error(name+' wait timed out');};return c;}
async function sendWait(c,type,data,reply,pred=()=>true){const from=c.messages.length;c.send(type,data);return c.wait(m=>m.type===reply&&pred(m.data),from);}
async function room(prefix,teams=['A','B','B']){const cs=[await client(prefix+'-owner')];const created=await sendWait(cs[0],'create_room',{nickname:cs[0].name},'room_created');const code=created.data.room_code;await cs[0].wait(m=>m.type==='room_state');for(let i=0;i<teams.length;i++){const c=await client(prefix+'-'+i);await sendWait(c,'join_room',{nickname:c.name,room_code:code},'room_state');await sendWait(c,'select_team',{team:teams[i]},'room_state');cs.push(c);}return {cs,code};}
try {
 const a=await room('limits',['B','B','B','B']);const [owner,other]=a.cs;
 let m=await sendWait(other,'add_ai',{team:'A'},'error');record('nonowner_cannot_add_ai',/only the room owner/.test(m.data.message),m.data);
 m=await sendWait(other,'start_game',{},'error');record('nonowner_cannot_start',/only the room owner/.test(m.data.message),m.data);
 m=await sendWait(owner,'start_game',{},'error');record('insufficient_team_start_rejected',/not enough/.test(m.data.message),m.data);
 m=await sendWait(owner,'select_team',{team:'B'},'error');const sync=await sendWait(owner,'request_sync',{},'full_sync');record('failed_full_team_switch_preserves_seat',sync.data.room.team_a.some(p=>p.nickname===owner.name),{error:m.data.message,teamA:sync.data.room.team_a,teamBCount:sync.data.room.team_b.length});
 a.cs.forEach(c=>c.ws.close());
 const r=await room('complete');const phases=new Set();const secrets=new Map();const roles=new Map();const acted=new Set();let gameOver;
 for(const c of r.cs){c.listeners.push(m=>{if(m.type==='phase_change'){const d=m.data;phases.add(d.round+':'+d.phase);roles.set(c.name,d.your_role);const k=c.name+':'+d.round+':'+d.phase;if(acted.has(k))return;if(d.phase==='encrypting'&&d.your_role==='encryptor'){acted.add(k);secrets.set(d.round,d.secret_digits);c.send('submit_clues',{clues:d.secret_digits.map(n=>'测试线索'+n)});}if(d.phase==='intercept'&&d.your_role==='opponent'){const teamKey=d.round+':intercept';if(acted.has(teamKey))return;acted.add(teamKey);const s=secrets.get(d.round);c.send('submit_intercept',{guess:[s[1],s[0],s[2]]});}if(d.phase==='decrypt'&&d.your_role==='teammate'){const teamKey=d.round+':decrypt';if(acted.has(teamKey))return;acted.add(teamKey);c.send('submit_decrypt',{guess:secrets.get(d.round)});}}if(m.type==='game_over')gameOver=m;});}
 const start=Date.now();r.cs[0].send('start_game');while(!gameOver&&Date.now()-start<210000)await delay(100);
 record('complete_16_round_game',!!gameOver&&secrets.size===16,{seconds:(Date.now()-start)/1000,rounds:secrets.size,gameOver:gameOver?.data,phaseCount:phases.size});
 const finalSync=await sendWait(r.cs[0],'request_sync',{},'full_sync');record('finished_game_sync_contains_result',!!finalSync.data.game,{room:finalSync.data.room?.room_code,game:finalSync.data.game});
 r.cs.forEach(c=>c.ws.close());
 const p=await room('phase');const phaseOwner=p.cs[0];const enemy=p.cs[2];const from=phaseOwner.messages.length;phaseOwner.send('start_game');const enc=await phaseOwner.wait(m=>m.type==='phase_change'&&m.data.phase==='encrypting',from);
 const attackFrom=enemy.messages.length;enemy.send('submit_decrypt',{guess:enc.data.secret_digits});await delay(150);phaseOwner.send('submit_clues',{clues:['一','二','三']});const rr=await phaseOwner.wait(m=>m.type==='round_result',from);record('opponent_early_decrypt_rejected',enemy.messages.slice(attackFrom).some(m=>m.type==='error'),{opponentErrors:enemy.messages.slice(attackFrom).filter(m=>m.type==='error'),result:rr.data});
 p.cs.forEach(c=>c.ws.close());
} catch(err){record('runner_error',false,{message:String(err)});} finally{clients.forEach(c=>c.ws.close());fs.writeFileSync(outDir+'/protocol-results.json',JSON.stringify(results,null,2));fs.writeFileSync(outDir+'/protocol-events.jsonl',events.map(x=>JSON.stringify(x)).join('\n'));}
