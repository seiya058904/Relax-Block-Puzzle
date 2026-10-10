import { auditModuleUrl } from '../source-path.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {loadVersion} = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const {createMemoryStorage,installWxStorage} = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
const key='block_puzzle_best_scores_v1';
const initial={easy:12,normal:100,master:30};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const version of ['wechat','web','android']){
 test(`${version}: confirmed reset then one failed reconciliation read recovers before a new placement`,async()=>{
  const {GameState}=await loadVersion(version);
  const memory=createMemoryStorage({[key]:initial});const restore=installWxStorage(memory);
  try{
   const queue=[];
   if(version!=='wechat')wx.withStorageLock=(_,update)=>new Promise((resolve,reject)=>queue.push({update,resolve,reject}));
   const state=new GameState();state.startNewGame();
   const read=wx.getStorageSync;
   if(version==='wechat'){
    let reads=0;wx.getStorageSync=name=>{if(++reads===2)throw new Error('one reconcile read');return read(name);};
    await state.confirmResetBestScore();
   }else{
    const pending=state.confirmResetBestScore();const operation=queue.shift();const outcome=operation.update();
    wx.getStorageSync=()=>{throw new Error('one reconcile read');};
    operation.resolve(outcome);await pending;
   }
   assert.equal(memory.snapshot()[key].normal,0);
   wx.getStorageSync=read;
   state.scoreManager.applyPlacement(state,1);
   if(queue.length){const operation=queue.shift();operation.resolve(operation.update());await tick();}
   assert.deepEqual(memory.snapshot()[key],{...initial,normal:10});
   assert.equal(state.bestScore,10);
   assert.equal(state.startingHighScore,0);
   assert.equal(state.hasShownNewRecord,false);
  }finally{restore();}
 });
}
for(const version of ['web','android'])for(const updateBeforeReject of[false,true]){
 test(`${version}: reset rejects ${updateBeforeReject?'after':'before'} update and its read fails, next recovered score remains truthful`,async()=>{
  const {GameState}=await loadVersion(version);
  const memory=createMemoryStorage({[key]:initial});const restore=installWxStorage(memory);
  try{
   const queue=[];wx.withStorageLock=(_,update)=>new Promise((resolve,reject)=>queue.push({update,resolve,reject}));
   const state=new GameState();state.startNewGame();
   const pending=state.confirmResetBestScore();const reset=queue.shift();
   if(updateBeforeReject)reset.update();
   const read=wx.getStorageSync;wx.getStorageSync=()=>{throw new Error('one reconcile read');};
   reset.reject(new Error('coordinator failure'));await pending;
   assert.equal(memory.snapshot()[key].normal,updateBeforeReject?0:100);
   wx.getStorageSync=read;
   state.scoreManager.applyPlacement(state,1);
   const save=queue.shift();save.resolve(save.update());await tick();
   const expectedBest=updateBeforeReject?10:100;
   assert.deepEqual(memory.snapshot()[key],{...initial,normal:expectedBest});
   assert.equal(state.bestScore,expectedBest);
   assert.equal(state.startingHighScore,updateBeforeReject?0:100);
   assert.equal(state.hasShownNewRecord,false);
  }finally{restore();}
 });
}
for(const version of ['web','android'])for(const mode of ['success','reject-after-update','reject-before-update']){
 test(`${version}: own score queued before reset ${mode} settles still reconciles after one failed read`,async()=>{
  const {GameState}=await loadVersion(version);
  const memory=createMemoryStorage({[key]:initial});const restore=installWxStorage(memory);
  try{
   const queue=[];wx.withStorageLock=(_,update)=>new Promise((resolve,reject)=>queue.push({update,resolve,reject}));
   const state=new GameState();state.startNewGame();
   const pendingReset=state.confirmResetBestScore();
   state.scoreManager.applyPlacement(state,1); // Queued while there is not yet a failed reset reconciliation.
   const reset=queue.shift(),save=queue.shift();
   let resetResult;
   if(mode!=='reject-before-update')resetResult=reset.update();
   const read=wx.getStorageSync;wx.getStorageSync=()=>{throw new Error('one reconcile read');};
   if(mode==='success')reset.resolve(resetResult);else reset.reject(new Error('coordinator failure'));
   await pendingReset;
   wx.getStorageSync=read;
   save.resolve(save.update());await tick();
   const expectedBest=mode==='reject-before-update'?100:10;
   assert.equal(memory.snapshot()[key].normal,expectedBest);
   assert.equal(state.bestScore,expectedBest);
   assert.equal(state.startingHighScore,mode==='reject-before-update'?100:0);
   assert.equal(state.hasShownNewRecord,false);
   assert.equal(state.pendingBestScoreWrites,0);
  }finally{restore();}
 });
}
