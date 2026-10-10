import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
const {loadVersion} = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const {createMemoryStorage,installWxStorage} = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
const key='block_puzzle_best_scores_v1';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const version of ['web','android']){
 const {GameState}=await loadVersion(version);
 const memory=createMemoryStorage({[key]:{easy:12,normal:100,master:30}});
 const restore=installWxStorage(memory);
 try{
  const queue=[];wx.withStorageLock=(_,update)=>new Promise((resolve,reject)=>queue.push({update,resolve,reject}));
  const release=()=>{const next=queue.shift();next.resolve(next.update());};
  const state=new GameState();state.startNewGame();
  let reset=state.confirmResetBestScore();
  state.startNewGame();state.scoreManager.applyPlacement(state,1);
  release();await reset;assert.equal(state.bestScore,0);assert.equal(state.startingHighScore,0);
  release();await tick();assert.equal(state.bestScore,10);assert.equal(state.startingHighScore,0);assert.equal(state.hasShownNewRecord,false);
  state.setSettings({difficulty:'easy'});reset=state.confirmResetBestScore();release();await reset;
  assert.equal(state.bestScore,10);assert.equal(state.activeDifficulty,'normal');assert.deepEqual(memory.snapshot()[key],{easy:0,normal:10,master:30});
  console.log(`${version}: PASS reset→new game→score queued before reset settles; selected-other difficulty reset retains active score`);
  state.setSettings({difficulty:'normal'});
  reset=state.confirmResetBestScore();
  const op=queue.shift();op.update();op.reject(new Error('IDB transaction aborted after synchronous storage update'));
  await reset;assert.equal(state.bestScore,0);assert.equal(state.startingHighScore,0);
  assert.equal(memory.snapshot()[key].normal,0);
  console.log(`${version}: PASS post-update coordinator rejection refreshes real committed score safely`);
  memory.setStorageSync(key,{easy:12,normal:100,master:30});state.refreshBestScores();state.startNewGame();
  reset=state.confirmResetBestScore();
  const failedRefresh=queue.shift();const result=failedRefresh.update();
  const read=wx.getStorageSync;wx.getStorageSync=()=>{throw new Error('one transient reconciliation read failure');};
  failedRefresh.resolve(result);await reset;
  assert.equal(memory.snapshot()[key].normal,0);assert.equal(state.bestScore,100);
  wx.getStorageSync=read;
  state.scoreManager.applyPlacement(state,1);release();await tick();
  assert.equal(memory.snapshot()[key].normal,10);
  console.log(`${version}: R3 observed after successful reset + one failed reconcile read + recovered next score: stored=10, UI=${state.bestScore}, threshold=${state.startingHighScore}`);
 }finally{restore();}
}
{
 const {GameState}=await loadVersion('wechat');
 const memory=createMemoryStorage({[key]:{easy:0,normal:0,master:0}});const restore=installWxStorage(memory);
 try{
  const state=new GameState();let finish;
  state.setAuthClient({verifyAdmin:()=>new Promise(resolve=>finish=resolve)});
  assert.equal(state.openAdminPanel(),true);state.setAdminInput('audit-fixture');
  const request=state.submitAdminCode();
  // The real background route cancels input / drag, not the still-open admin panel.
  state.cancelDrag();
  finish({adminMode:true});assert.equal(await request,true);assert.equal(state.isAdminModeActive(),true);
  assert.equal(state.ui.isAdminPanelOpen,false);
  state.startNewGame();assert.equal(state.bestScoreEligible,false);
  state.scoreManager.applyPlacement(state,1);assert.equal(memory.snapshot()[key].normal,0);
  console.log('wechat: PASS normal still-current admin verification can complete during background cancellation; next game remains excluded from records');
 }finally{restore();}
}
