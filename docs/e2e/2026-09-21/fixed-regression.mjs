// Run against an isolated local server. Credentials stay in memory; only assertions are saved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const clients=[], results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,actual,detail={}) { assert.ok(actual,name); const r={name,pass:true,...detail};results.push(r);console.log(JSON.stringify(r)); }
async function client(name) {
 const c={name,messages:[],listeners:[],socket:new WebSocket(process.env.E2E_WS_URL||'ws://localhost:8080/ws')};clients.push(c);
 c.socket.onmessage=e=>{const m=JSON.parse(e.data);c.messages.push(m);for(const f of c.listeners)f(m);};
 c.send=(type,data={})=>c.socket.send(JSON.stringify({type,data}));
 c.wait=async(type,from=0,pred=()=>true,timeout=4000)=>{const until=Date.now()+timeout;while(Date.now()<until){const m=c.messages.slice(from).find(m=>m.type===type&&pred(m.data));if(m)return m.data;await delay(10);}throw Error(`${name}: timeout ${type}`);};
 await new Promise((resolve,reject)=>{c.socket.onopen=resolve;c.socket.onerror=reject;});return c;
}
async function request(c,type,data,reply,pred) { const from=c.messages.length;c.send(type,data);return c.wait(reply,from,pred); }
async function create(name,teams=['A','B','B']) {
 const owner=await client(name+'0'), created=await request(owner,'create_room',{nickname:owner.name},'room_created');owner.identity=created;
 const cs=[owner];for(const [i,team] of teams.entries()){const c=await client(name+(i+1));c.identity=await request(c,'join_room',{nickname:c.name,room_code:created.room_code},'room_created');if(team)await request(c,'select_team',{team},'room_state',s=>(team==='A'?s.team_a:s.team_b).some(p=>p.id===c.identity.my_player_id));cs.push(c);}return {cs,code:created.room_code};
}
try {
 const lobby=await create('lobby',['B','B','B','B']);const [owner,peer]=lobby.cs;
 check('four_decimal_digits',/^\d{4}$/.test(lobby.code));
 await request(owner,'select_team',{team:'B'},'error');const state=await request(owner,'request_sync',{},'full_sync');
 check('full_team_switch_preserves_original_seat',state.room.team_a.some(p=>p.id===owner.identity.my_player_id));
 await request(peer,'add_ai',{team:'A'},'error');check('nonowner_add_ai_rejected',true);
 await request(owner,'start_game',{},'error');check('insufficient_players_rejected',true);
 const from=peer.messages.length;owner.socket.close();const transferred=await peer.wait('room_state',from,s=>s.owner_id!==owner.identity.my_player_id);
 const nextOwner=lobby.cs.find(c=>c.identity.my_player_id===transferred.owner_id);
 check('owner_transferred_to_online_human',!!nextOwner);
 await request(nextOwner,'add_ai',{team:'A'},'room_state',s=>s.team_a.length===1);check('new_owner_can_manage',true);
 lobby.cs.forEach(c=>c.socket.close());
 const active=await create('guard',['A','B','B','']);const [a1,a2,b1,b2,observer]=active.cs;
 a1.send('start_game');const phase=await a1.wait('phase_change',0,d=>d.phase==='encrypting');
 const obs=await observer.wait('game_start');check('observer_no_team_or_words',obs.your_role==='observer'&&!obs.your_team&&!obs.words?.length);
 const obsSync=await request(observer,'request_sync',{},'full_sync');check('observer_sync_no_secrets',!obsSync.game.words?.length&&!obsSync.game.secret_digits?.length);
 for(const [name,c,type,data] of [
  ['duplicate_start',a1,'start_game',{}],
  ['early_enemy_decrypt',b1,'submit_decrypt',{round:1,guess:[1,2,3]}],
  ['observer_clues',observer,'submit_clues',{round:1,clues:['a','b','c']}],
  ['empty_clues',a1,'submit_clues',{round:1,clues:['','','']}],
  ['stale_round',a1,'submit_clues',{round:0,clues:['a','b','c']}],
  ['extra_clues',a1,'submit_clues',{round:1,clues:['a','b','c','d']}]
 ]) {await request(c,type,data,'error');check(name+'_rejected',true);}
 const bad=await client('invalid-resume');const err=await request(bad,'resume_room',{room_code:active.code,resume_token:'not-a-token'},'error');check('resume_requires_credential',err.code==='resume_expired');bad.socket.close();
 const restored=await client('restored');restored.send('resume_room',{room_code:active.code,resume_token:a1.identity.resume_token});const resumed=await restored.wait('room_resumed');const sync=await restored.wait('full_sync');
 check('active_seat_restored',resumed.my_player_id===a1.identity.my_player_id&&sync.game.phase==='encrypting'&&JSON.stringify(sync.game.secret_digits)===JSON.stringify(phase.secret_digits));
 check('deadline_not_reset_by_resume',sync.game.deadline===phase.deadline);
 const clueFrom=a2.messages.length;restored.send('submit_clues',{round:1,clues:['a','b','c']});await a2.wait('phase_change',clueFrom,d=>d.phase==='decrypt');
 for(const guess of [[1,1,3],[0,2,3],[1,2,9],[1,2,3,4]]) await request(a2,'submit_decrypt',{round:1,guess},'error');check('invalid_guesses_rejected',true);
 await request(a2,'submit_decrypt',{round:1,guess:phase.secret_digits},'round_result',d=>d.complete);check('valid_action_after_rejections_finishes_round',true);
 active.cs.forEach(c=>c.socket.close());restored.socket.close();
 const full=await create('full');const secrets=new Map(),acted=new Set();let end;
 for(const c of full.cs)c.listeners.push(m=>{
  if(m.type==='game_over'){end=m.data;return;}if(m.type!=='phase_change')return;const d=m.data;const key=`${d.round}:${d.phase}`;if(acted.has(key))return;
  if(d.phase==='encrypting'&&d.your_role==='encryptor'){acted.add(key);secrets.set(d.round,d.secret_digits);c.send('submit_clues',{round:d.round,clues:d.secret_digits.map(n=>'线索'+n)});}
  if(d.phase==='intercept'&&d.your_role==='opponent'){acted.add(key);const s=secrets.get(d.round);c.send('submit_intercept',{round:d.round,guess:[s[1],s[0],s[2]]});}
  if(d.phase==='decrypt'&&d.your_role==='teammate'){acted.add(key);c.send('submit_decrypt',{round:d.round,guess:secrets.get(d.round)});}
 });
 const started=Date.now();full.cs[0].send('start_game');while(!end&&Date.now()-started<180000)await delay(100);
 check('complete_16_round_game',end?.round===16&&!end.winner,{seconds:(Date.now()-started)/1000});
 check('final_round_in_archive',end.history.length===16&&end.history.at(-1).round===16);
 const final=await request(full.cs[0],'request_sync',{},'full_sync');check('final_sync_retained',final.game.phase==='game_over'&&final.game.history.length===16&&!!final.game.game_over);
 const returned=await client('final-resume');returned.send('resume_room',{room_code:full.code,resume_token:full.cs[0].identity.resume_token});const finalResume=await returned.wait('full_sync');check('finished_game_can_resume',finalResume.game.phase==='game_over'&&finalResume.game.history.length===16);
} catch(e) { results.push({name:'runner',pass:false,message:String(e)});console.error(String(e));process.exitCode=1; }
finally {clients.forEach(c=>c.socket.close());const output=process.env.E2E_OUTPUT_DIR||'/tmp/decrypto-fixed';fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/regression-results.json',JSON.stringify(results,null,2));}
