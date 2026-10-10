import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { getVersionPath, loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { createMemoryStorage, installWxStorage, installBrowserEnvironment } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
const key = 'block_puzzle_best_scores_v1';
const legacy = 'block_puzzle_best_score_v1';
const original = {easy:12, normal:100, master:30};
for (const version of ['wechat', 'web', 'android']) {
  const {storage} = await loadVersion(version);
  const memory = createMemoryStorage({[key]: original});
  const restore = installWxStorage(memory);
  try {
    if (version !== 'wechat') wx.withStorageLock = (_, update) => Promise.resolve().then(update);
    const goodRead = wx.getStorageSync, goodWrite = wx.setStorageSync;
    let writes = 0;
    wx.setStorageSync = (name, value) => {writes++; goodWrite(name,value);};
    wx.getStorageSync = () => {throw new Error('transient read');};
    assert.equal(await storage.saveBestScore('normal',500), undefined);
    assert.equal(await storage.resetBestScore('normal'), undefined);
    assert.equal(writes,0);
    assert.deepEqual(memory.snapshot()[key], original);
    wx.getStorageSync = goodRead;
    await storage.saveBestScore('normal',500);
    assert.deepEqual(memory.snapshot()[key], {...original,normal:500});
    console.log(`${version}: exception reads refused all writes; later recovered write retained easy/master`);

    memory.delete(key); memory.setStorageSync(legacy,88); writes = 0;
    wx.getStorageSync = name => {
      if (name === legacy) throw new Error('legacy read');
      return goodRead(name);
    };
    assert.equal(await storage.saveBestScore('easy',20), undefined);
    assert.equal(writes,0);
    assert.equal(memory.snapshot()[key], undefined);
    wx.getStorageSync = goodRead;
    wx.setStorageSync = (name, value) => {
      writes++;
      if (writes === 1) throw new Error('first migration write quota');
      return goodWrite(name,value);
    };
    await storage.saveBestScore('easy',20);
    assert.deepEqual(memory.snapshot()[key], {easy:20, normal:88, master:0});
    console.log(`${version}: legacy read failure refused mutation; migration write retry retained legacy normal=88`);
  } finally {restore();}
}
for (const version of ['web','android']) {
  const {storage, GameState} = await loadVersion(version);
  const memory = createMemoryStorage({[key]: original});
  const restore = installWxStorage(memory);
  try {
    const queue=[];
    wx.withStorageLock=(_,update)=>new Promise(resolve=>queue.push(()=>resolve(update())));
    const state=new GameState(); state.startNewGame();
    state.scoreManager.applyPlacement(state,50);
    const pending=state.confirmResetBestScore();
    state.startNewGame();
    assert.equal(queue.length,2);
    queue.shift()(); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(memory.snapshot()[key].normal,500);
    queue.shift()(); await pending;
    assert.deepEqual(memory.snapshot()[key], {...original,normal:0});
    console.log(`${version}: old score → explicit reset share FIFO lock; final stored normal=0 after new game`);
  } finally {restore();}
  const environment=installBrowserEnvironment({[key]:JSON.stringify(original)});
  const previousIdb=globalThis.indexedDB;
  try {
    delete globalThis.indexedDB;
    await import(`${pathToFileURL(getVersionPath(version,'../browser-wx-shim.js')).href}?lockfault`);
    assert.equal(await storage.saveBestScore('normal',500),undefined);
    assert.equal(await storage.resetBestScore('normal'),undefined);
    assert.deepEqual(JSON.parse(localStorage.getItem(key)),original);
    navigator.locks={request:()=>Promise.reject(new Error('lock denied'))};
    assert.equal(await storage.saveBestScore('normal',500),undefined);
    assert.deepEqual(JSON.parse(localStorage.getItem(key)),original);
    console.log(`${version}: real shim no coordination / rejected Web Lock fail closed without uncoordinated overwrite`);
  } finally {
    if(previousIdb===undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB=previousIdb;
    environment.restore();
  }
}
