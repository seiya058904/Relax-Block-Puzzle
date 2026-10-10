import { auditOutputDir, auditSourceRoot } from '../source-path.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const root=resolve(process.env.QA_DOCS_ROOT || resolve(auditSourceRoot, 'we xin xiao cheng xu-android-apk/docs'));
const output=resolve(process.env.QA_CONCURRENCY_OUTPUT || auditOutputDir('concurrency'));
await mkdir(output,{recursive:true});
const entry=await readFile(resolve(root,'game.js'),'utf8');
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  const file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const content=file===resolve(root,'game.js')?entry.replace('new Main();','window.qaMain = new Main();'):await readFile(file);
  const mime={'.html':'text/html','.js':'text/javascript','.mp3':'audio/mpeg','.wav':'audio/wav','.png':'image/png'};
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(content);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const results=[];
try{
 for(const coordination of ['web-locks','indexeddb']){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  if(coordination==='indexeddb')await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
  const a=await context.newPage(),b=await context.newPage();const errors=[];
  for(const page of[a,b])page.on('pageerror',e=>errors.push(e.message));
  await a.goto(origin);await a.waitForFunction(()=>!!window.qaMain);
  await a.evaluate(()=>localStorage.setItem('block_puzzle_best_scores_v1',JSON.stringify({easy:2,normal:5,master:3})));
  await a.reload();await a.waitForFunction(()=>!!window.qaMain);
  await b.goto(origin);await b.waitForFunction(()=>!!window.qaMain);
  await b.evaluate(async()=>{
   window.qaLocked=false;
   if(navigator.locks){navigator.locks.request('block_puzzle_best_scores_v1',()=>{window.qaLocked=true;return new Promise(resolve=>window.qaRelease=resolve);});}
   else{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('block-puzzle-storage-locks',1);r.onupgradeneeded=()=>r.result.createObjectStore('locks');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const tx=db.transaction('locks','readwrite');let released=false;window.qaRelease=()=>released=true;
    const pump=()=>{window.qaLocked=true;if(!released)tx.objectStore('locks').get('gate').onsuccess=pump;};tx.objectStore('locks').get('gate').onsuccess=pump;
   }
  });await b.waitForFunction(()=>window.qaLocked);
  await a.evaluate(()=>{
   const state=qaMain.gameState;state.startNewGame();
   state.rackPieces=[{id:'single',cells:[{x:0,y:0}],color:'#abcdef',used:false,bounds:{width:1,height:1},category:'rescue',baseId:'single',isSnake:false}];
   state.dragState.activePieceIndex=0;state.previewState={row:0,col:0,canPlace:true,visible:true};
   if(!state.tryPlaceDraggedPiece())throw new Error('legal placement rejected');
   state.openPause();state.requestReturnHome();state.confirmReturnHome();qaMain.requestImmediateRender();
  });
  assert.equal(await a.evaluate(()=>qaMain.gameState.pendingBestScoreWrites),1);
  await b.evaluate(()=>qaRelease());
  await a.waitForFunction(()=>!qaMain.gameState.pendingBestScoreWrites);
  const snapshot=await a.evaluate(()=>({score:qaMain.gameState.bestScore,screen:qaMain.gameState.screen,stored:JSON.parse(localStorage.getItem('block_puzzle_best_scores_v1')),canvas:document.getElementById('gameCanvas').getBoundingClientRect().toJSON(),bootError:getComputedStyle(document.getElementById('bootError')).display}));
  assert.equal(snapshot.stored.normal,10);assert.equal(snapshot.screen,'home');assert.ok(snapshot.canvas.width>0);assert.equal(snapshot.bootError,'none');assert.deepEqual(errors,[]);
  await a.screenshot({path:resolve(output,`r1-${coordination}.png`)});
  results.push({coordination,origin,title:await a.title(),...snapshot,errors});
  console.log(JSON.stringify({case:'R1',coordination,persisted:snapshot.stored.normal,displayed:snapshot.score,correct:snapshot.score===10}));
  await context.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
