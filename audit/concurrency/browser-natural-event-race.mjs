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
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'locks',{value:undefined});
  window.qaTrace=[];
  window.addEventListener('storage',event=>{
   if(event.key!=='block_puzzle_best_scores_v1'||!window.qaMain)return;
   const s=qaMain.gameState;
   const record={type:'real storage event',oldValue:event.oldValue,newValue:event.newValue,committed:localStorage.getItem(event.key),before:{score:s.score,best:s.bestScore,starting:s.startingHighScore,pending:s.pendingBestScoreWrites,screen:s.screen}};
   qaTrace.push(record);
   queueMicrotask(()=>record.after={best:s.bestScore,starting:s.startingHighScore,pending:s.pendingBestScoreWrites,record:s.hasShownNewRecord});
  });
 });
 const a=await context.newPage(),b=await context.newPage();
 for(const p of[a,b]){await p.goto(origin);await p.waitForFunction(()=>!!window.qaMain);}
 for(let iteration=0;iteration<500;iteration++){
  await a.evaluate(()=>{
   localStorage.setItem('block_puzzle_best_scores_v1',JSON.stringify({easy:0,normal:0,master:0}));
   const state=qaMain.gameState;state.startNewGame();window.qaTrace=[];
  });
  await Promise.all([
   b.evaluate(async()=>{const {saveBestScore}=await import('./js/utils/storage.js');await saveBestScore('easy',20);}),
   a.evaluate(async()=>{
    const state=qaMain.gameState;
    state.rackPieces=[{id:'single',cells:[{x:0,y:0}],color:'#abcdef',used:false,bounds:{width:1,height:1},category:'rescue',baseId:'single',isSnake:false}];
    state.dragState.activePieceIndex=0;state.previewState={row:0,col:0,canPlace:true,visible:true};
    if(!state.tryPlaceDraggedPiece())throw new Error('placement failed');
    while(state.pendingBestScoreWrites)await new Promise(resolve=>setTimeout(resolve,0));
   })
  ]);
  const current=await a.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));return{score:qaMain.gameState.score,best:qaMain.gameState.bestScore,starting:qaMain.gameState.startingHighScore,trace:qaTrace};});
  if(current.starting!==0){
   const second=await a.evaluate(async()=>{
    const state=qaMain.gameState;
    state.rackPieces=[{id:'single',cells:[{x:0,y:0}],color:'#abcdef',used:false,bounds:{width:1,height:1},category:'rescue',baseId:'single',isSnake:false}];
    state.dragState.activePieceIndex=0;state.previewState={row:0,col:1,canPlace:true,visible:true};
    if(!state.tryPlaceDraggedPiece())throw new Error('second placement failed');
    while(state.pendingBestScoreWrites)await new Promise(resolve=>setTimeout(resolve,0));
    return{score:state.score,starting:state.startingHighScore,record:state.hasShownNewRecord};
   });
   results.push({iteration,...current,second});console.log(JSON.stringify({iteration,best:current.best,starting:current.starting,trace:current.trace,second}));break;
  }
  if(iteration%100===99)console.log(`completed ${iteration+1} natural concurrent easy/normal events without violation`);
 }
 await writeFile(resolve(output,'natural-event-race.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({naturalCounterexamples:results.length}));
 await context.close();
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
