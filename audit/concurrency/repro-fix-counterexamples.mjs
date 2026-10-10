import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
const { loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { createMemoryStorage, installWxStorage } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
const key='block_puzzle_best_scores_v1';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const version of ['web','android']) {
 const {GameState}=await loadVersion(version);
 const memory=createMemoryStorage({[key]:{easy:2,normal:5,master:3}});
 const restore=installWxStorage(memory);
 try{
  const queue=[];
  wx.withStorageLock=(_,update)=>new Promise(resolve=>queue.push(()=>resolve(update())));
  const state=new GameState();
  state.startNewGame();
  state.scoreManager.applyPlacement(state,1);
  state.confirmReturnHome();
  let renders=0;state.onBestScoreUpdated=()=>renders++;
  queue.shift()();await tick();
  assert.equal(memory.snapshot()[key].normal,10);
  assert.equal(state.bestScore,5);
  assert.equal(renders,1);
  console.log(`${version} R1: home same difficulty, stored normal=10, UI normal=${state.bestScore}, redraw=${renders}; obsolete apply dropped but no trusted reload`);
 }finally{restore();}
 const memory2=createMemoryStorage({[key]:{easy:20,normal:0,master:0}});
 const restore2=installWxStorage(memory2);
 try{
  let acquire,complete;
  wx.withStorageLock=(_,update)=>new Promise(resolve=>{acquire=()=>{const result=update();complete=()=>resolve(result);};});
  const state=new GameState();state.startNewGame();
  state.scoreManager.applyPlacement(state,1);
  acquire(); // IndexedDB get success performed synchronous update; completion still pending.
  assert.equal(state.bestScore,0);
  state.refreshBestScores(); // delayed easy-only storage event reads the latest normal own write.
  complete();await tick();
  assert.equal(state.startingHighScore,10);
  state.scoreManager.applyPlacement(state,1);acquire();complete();await tick();
  assert.equal(state.hasShownNewRecord,true);
  console.log(`${version} R2: late unrelated storage refresh between owned write and completion still changes first-round threshold 0→10`);
 }finally{restore2();}
}
