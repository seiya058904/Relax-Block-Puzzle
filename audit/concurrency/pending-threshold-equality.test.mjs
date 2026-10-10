import { auditModuleUrl } from '../source-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {loadVersion} = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const {createMemoryStorage,installWxStorage} = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
const key='block_puzzle_best_scores_v1';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const version of ['web','android'])for(const alreadyQueued of [false,true]){
 test(`${version}: unrelated display refresh cannot hide unresolved reset threshold (${alreadyQueued?'queued':'next'} own score)`,async()=>{
  const {GameState}=await loadVersion(version);
  const memory=createMemoryStorage({[key]:{easy:12,normal:100,master:30}});const restore=installWxStorage(memory);
  try{
   const queue=[];wx.withStorageLock=(_,update)=>new Promise((resolve,reject)=>queue.push({update,resolve,reject}));
   const state=new GameState();state.startNewGame();const pending=state.confirmResetBestScore();
   if(alreadyQueued)state.scoreManager.applyPlacement(state,1);
   const reset=queue.shift();reset.update();
   const read=wx.getStorageSync;wx.getStorageSync=()=>{throw new Error('transient reconcile read failure');};
   reset.reject(new Error('IDB abort after update'));await pending;
   wx.getStorageSync=read;
   memory.setStorageSync(key,{easy:20,normal:0,master:30});
   // Exact GameState call made by the actual Main listener for an EASY-only event.
   state.refreshBestScores({updateRecordThreshold:false});
   assert.equal(state.bestScore,0);assert.equal(state.startingHighScore,100);
   if(!alreadyQueued)state.scoreManager.applyPlacement(state,1);
   const save=queue.shift();save.resolve(save.update());await tick();
   assert.equal(memory.snapshot()[key].normal,10);assert.equal(state.bestScore,10);
   assert.equal(state.startingHighScore,0,'trusted display became equal before recovery, but unresolved reset threshold still needs a downward correction');
   assert.equal(state.hasShownNewRecord,false);
  }finally{restore();}
 });
}
