import { auditOutputDir, auditSourceRoot } from '../source-path.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const mode=process.argv.includes('--fixed')?'fixed':'baseline';
const inputOnly=process.argv.includes('--input-only');
if(mode==='baseline' && !process.env.QA_INPUT_ROOT) throw new Error('Baseline mode requires QA_INPUT_ROOT pointing to the original Web assets; use --fixed for this source.');
const root=resolve(process.env.QA_INPUT_ROOT || resolve(auditSourceRoot, 'we xin xiao cheng xu-android-apk/docs'));
const output=resolve(process.env.QA_INPUT_OUTPUT || auditOutputDir(`input/${mode}`));
const exe=process.env.QA_CHROMIUM_EXECUTABLE;
await mkdir(output,{recursive:true});
const entry=await readFile(resolve(root,'game.js'),'utf8');
assert.equal(entry.split('new Main();').length-1,1,'instrument the one original Main instance only');
const mime={'.html':'text/html','.js':'application/javascript','.png':'image/png','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 const file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 const body=file===resolve(root,'game.js')?entry.replace('new Main();','window.qaMain = new Main();'):await readFile(file);
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const results={mode,root,url,reason:'Browser plugin not available; existing Playwright and existing Chromium used without installing dependencies',checks:[],cases:[]};
const browser=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox']});
results.browser=browser.version();
const check=(name,pass,evidence)=>{results.checks.push({name,pass:!!pass,evidence});if(!pass)console.log(`FAIL ${name}: ${JSON.stringify(evidence)}`);};
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
const clickRect=async(page,expression)=>{const r=await page.evaluate(expression);assert.ok(r,'target rectangle exists');const p=center(r);await page.mouse.click(p.x,p.y);};
const idle=page=>page.waitForFunction(()=>qaMain.aniId===0,{timeout:4000});
async function openPage(viewport){
 const context=await browser.newContext({viewport,deviceScaleFactor:1.25,hasTouch:true});
 const page=await context.newPage();const errors=[];const warnings=[];
 page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
 page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`);if(m.type()==='warning')warnings.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.qaMain);await idle(page);
 await page.evaluate(()=>{window.qaRenderCount=0;window.qaLastRendered={};window.qaFrameText=[];const render=qaMain.renderer.render.bind(qaMain.renderer);
   const ctx=qaMain.renderer.ctx;const fill=ctx.fillText.bind(ctx);ctx.fillText=function(text,...args){qaFrameText.push(String(text));return fill(text,...args);};
   qaMain.renderer.render=function(state){qaRenderCount++;qaFrameText=[];qaLastRendered={membershipInput:state.membershipInput,membershipError:state.membershipError,screen:state.screen,score:state.score};return render(state);};});
 return {context,page,errors,warnings};
}
async function identity(page,label,errors){const evidence=await page.evaluate(()=>({title:document.title,canvas:{width:canvas.width,height:canvas.height},bootError:{display:getComputedStyle(document.getElementById('bootError')).display,text:document.getElementById('bootError').textContent},screen:qaMain.gameState.screen,raf:qaMain.aniId}));
 check(`${label}: page identity and Canvas`,evidence.title.includes('方块')&&evidence.canvas.width>0&&evidence.canvas.height>0,evidence);
 check(`${label}: no boot overlay`,evidence.bootError.display==='none',evidence.bootError);
 return evidence;
}
try{
 // Actual Canvas input field -> actual DOM focus -> keyboard events -> visual state.
 {
 const {context,page,errors,warnings}=await openPage({width:1280,height:900});
 await identity(page,'input',errors);await page.screenshot({path:resolve(output,'input-home.png')});
 await clickRect(page,()=>qaMain.renderer.homeActionRects.settings);await idle(page);
 await clickRect(page,()=>qaMain.renderer.settingsActionRects['tab:account']);await idle(page);
 await clickRect(page,()=>qaMain.renderer.settingsActionRects.openMembership);await idle(page);
 await clickRect(page,()=>qaMain.renderer.membershipActionRects.input);
 const mouseFocus=await page.evaluate(()=>document.activeElement?.id);
 check('mouse field focus',mode==='baseline'?mouseFocus==='':mouseFocus==='wxKeyboard',{mouseFocus});
 const codeRect=await page.evaluate(()=>qaMain.renderer.membershipActionRects.input);
 const codePoint=center(codeRect);await page.touchscreen.tap(codePoint.x,codePoint.y);
 const focused=await page.evaluate(()=>document.activeElement?.id);check('native keyboard receives focus',focused==='wxKeyboard',focused);
 const before=await page.evaluate(()=>qaRenderCount);
 await page.keyboard.type('INVALID-AUDIT');await page.waitForTimeout(100);
 const typed=await page.evaluate(()=>({state:qaMain.gameState.membershipInput,rendered:qaLastRendered.membershipInput,renderCount:qaRenderCount,raf:qaMain.aniId}));
 await page.screenshot({path:resolve(output,'native-keyboard-typed.png')});
 check('native keyboard updates idle Canvas',mode==='baseline'?typed.renderCount===before&&typed.rendered!==typed.state:typed.rendered===typed.state&&typed.state==='INVALID-AUDIT',typed);
 if(mode==='fixed'){
  await page.setViewportSize({width:568,height:320});await page.waitForTimeout(100);
  const blockedKeyboard=await page.evaluate(()=>({state:qaMain.gameState.membershipInput,blocked:qaMain.gameState.viewportBlocked,focused:document.activeElement?.id,frameText:qaFrameText}));
  await page.keyboard.type('Z');await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(100);
  const recoveredKeyboard=await page.evaluate(()=>({state:qaMain.gameState.membershipInput,rendered:qaLastRendered.membershipInput,blocked:qaMain.gameState.viewportBlocked,open:qaMain.gameState.ui.isMembershipPanelOpen}));
  check('native input survives short viewport and recovery',blockedKeyboard.blocked&&recoveredKeyboard.state==='INVALID-AUDITZ'&&recoveredKeyboard.rendered===recoveredKeyboard.state&&!recoveredKeyboard.blocked&&recoveredKeyboard.open,{blockedKeyboard,recoveredKeyboard});
  await page.screenshot({path:resolve(output,'keyboard-resize-recovered.png')});
 }
 const confirmRect=await page.evaluate(()=>qaMain.renderer.membershipActionRects.confirm);const confirmPoint=center(confirmRect);await page.touchscreen.tap(confirmPoint.x,confirmPoint.y);await idle(page);
 const invalid=await page.evaluate(()=>({error:qaMain.gameState.membershipError,rendered:qaLastRendered.membershipError,open:qaMain.gameState.ui.isMembershipPanelOpen,focused:document.activeElement?.id}));
 await page.screenshot({path:resolve(output,'native-keyboard-invalid-confirm.png')});
 check('invalid native keyboard code retains error',mode==='baseline'?invalid.error==='':!!invalid.error&&invalid.rendered===invalid.error,invalid);
 await clickRect(page,()=>qaMain.renderer.membershipActionRects.cancel);await idle(page);
 await clickRect(page,()=>qaMain.renderer.settingsActionRects.continue);await idle(page);
 await clickRect(page,()=>qaMain.renderer.homeActionRects.start);await idle(page);
 const pickup=await page.evaluate(()=>qaMain.renderer.rackHitAreas[0]);const p=center(pickup);
 await page.mouse.move(p.x,p.y);await page.mouse.down();
 const beforeBlur=await page.evaluate(()=>({score:qaMain.gameState.score,board:qaMain.gameState.board.getSnapshot(),drag:qaMain.gameState.dragState.isDragging}));
 assert.equal(beforeBlur.drag,true);
 const target=await page.evaluate(()=>{const s=qaMain.gameState;return {x:s.layout.boardRect.x+s.dragState.pieceWidth/2,y:s.layout.boardRect.y+s.dragState.pieceHeight+s.dragState.dragFingerOffsetY};});
 // Headless OS-window focus changes cannot be reproduced; dispatch the real browser
 // blur signal and real CDP movement with buttons=0 to reproduce the lost-release adapter path.
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y,button:'none',buttons:0});
 await page.waitForTimeout(50);
 const stale=await page.evaluate(()=>({drag:qaMain.gameState.dragState.isDragging,paused:qaMain.isPaused,score:qaMain.gameState.score,hidden:document.hidden}));
 await page.screenshot({path:resolve(output,'mouse-lost-release.png')});
 await page.mouse.click(target.x,target.y);await page.waitForTimeout(30);
 const afterClick=await page.evaluate(()=>({score:qaMain.gameState.score,drag:qaMain.gameState.dragState.isDragging,filled:qaMain.gameState.board.getSnapshot().flat().filter(Boolean).length}));
 check('lost release cancellation leaves no stale drag',mode==='baseline'?stale.drag:!stale.drag,{beforeBlur,stale,afterClick});
 check('next ordinary click cannot place stale piece',mode==='baseline'?afterClick.score>beforeBlur.score:afterClick.score===beforeBlur.score,afterClick);
 check('window blur preserves actual visibility lifecycle',!stale.paused&&!stale.hidden,stale);
 check('input flow console health',errors.length===0,{errors,warnings});
 results.cases.push({label:'input',typed,invalid,stale,afterClick,errors,warnings});await context.close();
 }
 for(const [w,h] of (inputOnly?[]:[[1280,900],[390,844],[320,568],[568,320],[640,360]])){
  const short=h<400;const label=`viewport-${w}x${h}`;
  const {context,page,errors,warnings}=await openPage(short?{width:390,height:844}:{width:w,height:h});
  await clickRect(page,()=>qaMain.renderer.homeActionRects.start);await idle(page);
  const before=await page.evaluate(()=>({board:qaMain.gameState.board.getSnapshot(),score:qaMain.gameState.score,rack:structuredClone(qaMain.gameState.rackPieces)}));
  if(short)await page.setViewportSize({width:w,height:h});
  await page.waitForTimeout(100);
  const basic=await identity(page,label,errors);
  const layout=await page.evaluate(()=>({cellSize:qaMain.renderer.layout.cellSize,board:qaMain.renderer.layout.boardRect,rack:qaMain.renderer.rackHitAreas.length,tools:Object.keys(qaMain.renderer.toolActionRects),stateBlocked:qaMain.gameState.viewportBlocked,rendererBlocked:qaMain.renderer.layout.viewportBlocked,frameText:qaFrameText,raf:qaMain.aniId,screen:qaMain.gameState.screen}));
  await page.screenshot({path:resolve(output,`${label}.png`)});
  if(short){
   if(mode==='baseline'){
    const r=await page.evaluate(()=>qaMain.renderer.layout.rackSlots[0]);const p=center(r);await page.mouse.click(p.x,p.y);await page.waitForTimeout(20);
    const interaction=await page.evaluate(()=>({drag:qaMain.gameState.dragState.isDragging,score:qaMain.gameState.score}));
    check(`${label}: baseline records invalid or unusable geometry`,layout.cellSize<5,{layout,errors});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
    const afterRecovery=await page.evaluate(()=>({boot:getComputedStyle(document.getElementById('bootError')).display,canvas:getComputedStyle(canvas).display}));
    results.cases.push({label,basic,layout,before,interaction,afterRecovery,errors,warnings});
   }else{
    check(`${label}: blocks rack and tools`,layout.rack===0&&layout.tools.length===0,layout);
    check(`${label}: explains how to restore view`,layout.frameText.some(text=>text.includes('请转为竖屏或增大窗口')),layout.frameText);
    check(`${label}: stops idle frames`,layout.raf===0,layout);
    await page.mouse.click(w/2,h/2);await page.waitForTimeout(250);
    const still=await page.evaluate(()=>({board:qaMain.gameState.board.getSnapshot(),score:qaMain.gameState.score,rack:qaMain.gameState.rackPieces}));
    check(`${label}: fallback interactions preserve round`,JSON.stringify(still)===JSON.stringify(before),{before,still});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
    const restored=await page.evaluate(()=>({board:qaMain.gameState.board.getSnapshot(),score:qaMain.gameState.score,rack:qaMain.gameState.rackPieces,hitAreas:qaMain.renderer.rackHitAreas.length,cellSize:qaMain.renderer.layout.cellSize}));
    check(`${label}: restores original playable round`,restored.hitAreas===3&&restored.cellSize>0&&JSON.stringify(restored.board)===JSON.stringify(before.board)&&JSON.stringify(restored.rack)===JSON.stringify(before.rack),restored);
    await page.screenshot({path:resolve(output,`${label}-restored.png`)});
    check(`${label}: console health`,errors.length===0,{errors,warnings});
    results.cases.push({label,basic,layout,before,still,restored,errors,warnings});
   }
  }else{
   check(`${label}: normal viewport remains playable`,layout.cellSize>8&&layout.rack===3,layout);
   check(`${label}: console health`,errors.length===0,{errors,warnings});
   results.cases.push({label,basic,layout,errors,warnings});
  }
  await context.close();
 }
 if(mode==='fixed'&&!inputOnly){
  const {context,page,errors,warnings}=await openPage({width:390,height:844});
  await clickRect(page,()=>qaMain.renderer.homeActionRects.start);await idle(page);
  await page.evaluate(()=>{const s=qaMain.gameState;s.board.grid=Array.from({length:10},(_,r)=>Array.from({length:10},(_,c)=>r===0&&c>0?{color:'#7EC8EB'}:null));
    s.rackPieces=Array.from({length:3},(_,i)=>({baseId:'single',id:'qa-single-'+i,cells:[{x:0,y:0}],bounds:{width:1,height:1},color:'#7EC8EB',used:false}));qaMain.requestImmediateRender();});
  const pickup=await page.evaluate(()=>qaMain.renderer.rackHitAreas[0]);const p=center(pickup);
  await page.mouse.move(p.x,p.y);await page.mouse.down();
  const target=await page.evaluate(()=>{const s=qaMain.gameState;return{x:s.layout.boardRect.x+s.dragState.pieceWidth/2,y:s.layout.boardRect.y+s.dragState.pieceHeight+s.dragState.dragFingerOffsetY};});
  await page.mouse.move(target.x,target.y);await page.mouse.up();await page.setViewportSize({width:568,height:320});
  const frozenBefore=await page.evaluate(()=>({pending:structuredClone(qaMain.gameState.pendingClear),board:qaMain.gameState.board.getSnapshot(),score:qaMain.gameState.score,raf:qaMain.aniId}));
  check('fallback reached during live clear wait',!!frozenBefore.pending,frozenBefore);
  await page.waitForTimeout(500);
  const frozenAfter=await page.evaluate(()=>({pending:structuredClone(qaMain.gameState.pendingClear),board:qaMain.gameState.board.getSnapshot(),score:qaMain.gameState.score,raf:qaMain.aniId}));
  check('fallback freezes pending clear without losing progress',!!frozenAfter.pending&&JSON.stringify(frozenAfter)===JSON.stringify(frozenBefore),{frozenBefore,frozenAfter});
  await page.screenshot({path:resolve(output,'fallback-frozen-clear.png')});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!qaMain.gameState.pendingClear);await idle(page);
  const resumed=await page.evaluate(()=>({score:qaMain.gameState.score,row:qaMain.gameState.board.grid[0],inputLocked:qaMain.gameState.inputLocked,hitAreas:qaMain.renderer.rackHitAreas.length}));
  check('restored viewport finishes original clear exactly once',resumed.score===160&&resumed.row.every(x=>x===null)&&!resumed.inputLocked,resumed);
  await page.screenshot({path:resolve(output,'fallback-clear-resumed.png')});
  check('fallback animation flow console health',errors.length===0,{errors,warnings});
  results.cases.push({label:'fallback-live-clear',frozenBefore,frozenAfter,resumed,errors,warnings});await context.close();
 }

} catch(error){results.failure=error.stack||String(error);console.log(results.failure);} finally {
 results.passed=results.checks.filter(x=>x.pass).length;results.failed=results.checks.filter(x=>!x.pass).length;
 await writeFile(resolve(output,'report.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({mode,browser:results.browser,passed:results.passed,failed:results.failed,failure:results.failure,output}));
 await browser.close();await new Promise(done=>server.close(done));
}
if(results.failure||results.failed)process.exitCode=1;
