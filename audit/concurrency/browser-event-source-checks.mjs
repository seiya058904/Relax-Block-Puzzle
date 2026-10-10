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
const summaries=[];
try{
 for(const mode of ['unrelated','higher','reset']){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{
   Object.defineProperty(navigator,'locks',{value:undefined});
   window.qaTrace=[];
   window.addEventListener('storage',event=>{
    if(event.key!=='block_puzzle_best_scores_v1'||!window.qaMain)return;
    const s=qaMain.gameState;
    qaTrace.push({oldValue:event.oldValue,newValue:event.newValue,committed:localStorage.getItem(event.key),before:{score:s.score,best:s.bestScore,starting:s.startingHighScore,pending:s.pendingBestScoreWrites,screen:s.screen}});
   });
  });
  const a=await context.newPage(),b=await context.newPage();const errors=[];
  for(const p of[a,b]){p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>!!window.qaMain);}
  let critical=0,iterations=0;const evidence=[];
  while(iterations<300&&critical<5){
   await a.evaluate(initial=>{
    localStorage.setItem('block_puzzle_best_scores_v1',JSON.stringify({easy:0,normal:initial,master:0}));
    qaMain.gameState.startNewGame();window.qaTrace=[];
   },mode==='reset'?100:0);
   await Promise.all([
    b.evaluate(async mode=>{const storage=await import('./js/utils/storage.js');if(mode==='reset')await storage.resetBestScore('normal');else await storage.saveBestScore(mode==='higher'?'normal':'easy',20);},mode),
    a.evaluate(async cells=>{
     const state=qaMain.gameState;
     state.rackPieces=[{id:'fixture',cells:Array.from({length:cells},(_,x)=>({x,y:0})),color:'#abcdef',used:false,bounds:{width:cells,height:1},category:'rescue',baseId:'single',isSnake:false}];
     state.dragState.activePieceIndex=0;state.previewState={row:0,col:0,canPlace:true,visible:true};
     if(!state.tryPlaceDraggedPiece())throw new Error('placement failed');
     while(state.pendingBestScoreWrites)await new Promise(resolve=>setTimeout(resolve,0));
    },mode==='higher'?3:1)
   ]);
   const current=await a.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));return{score:qaMain.gameState.score,best:qaMain.gameState.bestScore,starting:qaMain.gameState.startingHighScore,record:qaMain.gameState.hasShownNewRecord,trace:qaTrace};});
   for(const e of current.trace){
    const before=JSON.parse(e.oldValue),after=JSON.parse(e.newValue),committed=JSON.parse(e.committed);
    const eventMatches=mode==='higher'?before?.normal===0&&after?.normal===20:mode==='reset'?before?.normal===100&&after?.normal===0:before?.easy===0&&after?.easy===20&&before?.normal===0&&after?.normal===0;
    if(eventMatches&&e.before.pending>0&&committed.normal===(mode==='higher'?30:10)){
     critical++;assert.equal(current.starting,mode==='higher'?20:0);
     assert.equal(current.best,mode==='higher'?30:10);
     assert.equal(current.record,mode==='higher');
     evidence.push({iteration:iterations,event:e,settled:{score:current.score,best:current.best,starting:current.starting,record:current.record}});
    }
   }
   if(mode==='unrelated')assert.equal(current.starting,0);
   iterations++;
  }
  assert.deepEqual(errors,[]);assert.ok(critical>0,`${mode}: no critical real-event interleaving observed`);
  summaries.push({mode,iterations,critical,evidence,errors});
  console.log(JSON.stringify({mode,iterations,critical,passed:true}));
  await context.close();
 }
 await writeFile(resolve(output,'event-source-checks.json'),JSON.stringify(summaries,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
