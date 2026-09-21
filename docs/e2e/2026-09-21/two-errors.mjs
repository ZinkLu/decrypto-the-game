// Diagnostic probe for an isolated local test server.
import fs from 'node:fs';
const outDir=process.env.E2E_OUTPUT_DIR || '/tmp/decrypto-e2e'; fs.mkdirSync(outDir,{recursive:true});
const results=[];const events=[];const clients=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function record(name,pass,detail){const r={name,pass,detail}; results.push(r);console.log(JSON.stringify(r));}
async function client(name){const c={name,ws:new WebSocket(process.env.E2E_WS_URL || 'ws://localhost:8080/ws'),messages:[],listeners:[]};clients.push(c);c.send=(type,data={})=>c.ws.send(JSON.stringify({type,data}));c.ws.onmessage=e=>{const m=JSON.parse(e.data);m.at=Date.now();c.messages.push(m);events.push({client:name,...m});for(const f of c.listeners)f(m);};await new Promise((r,j)=>{c.ws.onopen=r;c.ws.onerror=j;});c.wait=async(pred,after=0,timeout=4000)=>{const start=Date.now();while(Date.now()-start<timeout){const m=c.messages.slice(after).find(pred);if(m)return m;await delay(20);}throw Error(name+' wait timed out');};return c;}
async function sendWait(c,type,data,reply,pred=()=>true){const from=c.messages.length;c.send(type,data);return c.wait(m=>m.type===reply&&pred(m.data),from);}
async function room(prefix,teams=['A','B','B']){const cs=[await client(prefix+'-owner')];const created=await sendWait(cs[0],'create_room',{nickname:cs[0].name},'room_created');const code=created.data.room_code;await cs[0].wait(m=>m.type==='room_state');for(let i=0;i<teams.length;i++){const c=await client(prefix+'-'+i);await sendWait(c,'join_room',{nickname:c.name,room_code:code},'room_state');await sendWait(c,'select_team',{team:teams[i]},'room_state');cs.push(c);}return {cs,code};}

try{
 const r=await room('two-errors');const secrets=new Map(),acted=new Set();let end;const start=Date.now();
 for(const c of r.cs)c.listeners.push(m=>{if(m.type==='game_over')end=m.data;if(m.type!=='phase_change')return;const d=m.data;if(d.phase==='encrypting'&&d.your_role==='encryptor'){secrets.set(d.round,d.secret_digits);c.send('submit_clues',{clues:['线索甲','线索乙','线索丙']});}if(d.phase==='intercept'&&d.your_role==='opponent'&&!acted.has(d.round+':i')){acted.add(d.round+':i');const s=secrets.get(d.round);c.send('submit_intercept',{guess:[s[1],s[0],s[2]]});}if(d.phase==='decrypt'&&d.your_role==='teammate'){const s=secrets.get(d.round);c.send('submit_decrypt',{guess:d.round%2?[s[1],s[0],s[2]]:s});}});
 r.cs[0].send('start_game');while(!end&&Date.now()-start<30000)await delay(50);record('two_decrypt_errors_end_game',end?.winner==='B'&&end?.score_a.decrypt_failures===2,{seconds:(Date.now()-start)/1000,rounds:secrets.size,end});
} catch(err){record('runner_error',false,{message:String(err)});}finally{clients.forEach(c=>c.ws.close());fs.writeFileSync(outDir+'/two-errors-results.json',JSON.stringify(results,null,2));}
