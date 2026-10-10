import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { getVersionPath, loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { installBrowserEnvironment, installWxStorage, createMemoryStorage } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));

function attachEvents(target) {
  const events = new Map();
  target.addEventListener = (type, callback) => {
    if (!events.has(type)) events.set(type, []);
    events.get(type).push(callback);
  };
  target.removeEventListener = (type, callback) => events.set(type, (events.get(type) || []).filter(x => x !== callback));
  return (type, event = {}) => { for (const handler of events.get(type) || []) handler(event); };
}

for (const version of ['web', 'android']) {
  const env = installBrowserEnvironment();
  const dispatchWindow = attachEvents(globalThis);
  attachEvents(document);
  const surface = document.getElementById('gameCanvas');
  const keyboard = document.getElementById('wxKeyboard');
  const inputLayer = { style: {} };
  const dispatchCanvas = attachEvents(surface);
  const dispatchInput = attachEvents(inputLayer);
  const dispatchKeyboard = attachEvents(keyboard);
  const getById = document.getElementById.bind(document);
  document.getElementById = id => id === 'inputLayer' ? inputLayer : getById(id);
  const dispatchPointer = version === 'web' ? dispatchInput : dispatchCanvas;
  let renderCount = 0;
  const context = new Proxy({
    measureText: text => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    setTransform() {}, getTransform: () => ({ a: 2 })
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  surface.getContext = () => context;
  const frames = new Map();
  let nextId = 0, now = 1;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const tick = () => { const pending = [...frames.values()]; frames.clear(); now += 16; for (const f of pending) f(now); };
  const settle = () => { for (let i = 0; i < 300 && frames.size; i++) tick(); assert.equal(frames.size, 0); };
  try {
    await import(`${pathToFileURL(getVersionPath(version, '../browser-wx-shim.js')).href}?input-audit`);
    const { default: Main } = await import(pathToFileURL(getVersionPath(version, 'main.js')).href);
    const main = new Main();
    const render = main.renderer.render.bind(main.renderer);
    main.renderer.render = state => { renderCount++; return render(state); };
    settle();
    main.gameState.openSettings(); main.gameState.openMembershipPanel(); main.requestImmediateRender(); settle();
    const rendersBeforeInput = renderCount;
    keyboard.value = 'TEST-AUDIT';
    dispatchKeyboard('input');
    assert.equal(main.gameState.membershipInput, 'TEST-AUDIT');
    console.log(JSON.stringify({version, bug:'keyboard update does not wake idle renderer', state:main.gameState.membershipInput, renderDelta:renderCount-rendersBeforeInput, pendingFrames:frames.size}));
    assert.equal(frames.size, 0, 'baseline bug: keyboard callback schedules no frame');
    assert.equal(renderCount, rendersBeforeInput, 'baseline bug: keyboard callback does not render');

    main.gameState.closeMembershipPanel(); main.gameState.closeSettings(); main.gameState.startNewGame(); main.requestImmediateRender(); settle();
    const state = main.gameState;
    const slot = main.renderer.rackHitAreas[0];
    dispatchPointer('mousedown', { button:0, buttons:1, clientX:slot.x+slot.width/2, clientY:slot.y+slot.height/2 });
    assert.equal(state.dragState.isDragging, true);
    const cellsBefore = state.board.getSnapshot().flat().filter(Boolean).length;
    dispatchWindow('blur'); // release happens outside the visible browser window; mouseup is not delivered.
    const target = { clientX:state.layout.boardRect.x+state.dragState.pieceWidth/2,
      clientY:state.layout.boardRect.y+state.dragState.pieceHeight+state.dragState.dragFingerOffsetY, button:0, buttons:0 };
    dispatchPointer('mousemove', target);
    tick();
    assert.equal(state.dragState.isDragging, true, 'baseline bug: focus-loss/no-buttons move leaves drag active');
    assert.equal(state.previewState.canPlace, true);
    dispatchPointer('mousedown', { ...target, buttons:1 });
    dispatchWindow('mouseup', target);
    const cellsAfter = state.board.getSnapshot().flat().filter(Boolean).length;
    console.log(JSON.stringify({version, bug:'lost mouseup after window blur persists drag and next unrelated click places piece', cellsBefore, cellsAfter, score:state.score}));
    assert.ok(cellsAfter > cellsBefore, 'baseline bug: later click places the stale dragged piece');
    main.handleAppBackground();
  } finally {
    delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    delete globalThis.ANDROID_APP_BACKGROUND; delete globalThis.ANDROID_APP_FOREGROUND;
    env.restore();
  }
}

for (const version of ['wechat', 'web', 'android']) {
  const restore = installWxStorage(createMemoryStorage());
  Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
  try {
    const { GameState, InputManager, feedback } = await loadVersion(version);
    const state = new GameState(); state.startNewGame();
    const input = new InputManager(state, {}, {}, () => {});
    input.activeTouchIdentifier = 0;
    state.dragState.isDragging = true;
    state.openPause(); // external navigation can close the drag while its physical touch is still owned.
    const before = structuredClone(state.feedbackState.uiMotion.modal);
    input.reconcileInputSession();
    console.log(JSON.stringify({version, bug:'reconcile of a cancelled drag erases unrelated modal animation', beforeActive:before.active, afterActive:state.feedbackState.uiMotion.modal.active}));
  } finally { restore(); }
}

for (const version of ['web','android']) {
  const restore=installWxStorage(createMemoryStorage());
  const callbacks={};
  Object.assign(wx,{onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){},
    onKeyboardInput(fn){callbacks.input=fn;}, onKeyboardConfirm(fn){callbacks.confirm=fn;},
    onKeyboardComplete(fn){callbacks.complete=fn;}, hideKeyboard(){ callbacks.complete({value:'INVALID-AUDIT'}); }});
  try {
    const {GameState,InputManager}=await loadVersion(version);
    const state=new GameState(); state.openSettings(); state.openMembershipPanel(); state.setMembershipInput('INVALID-AUDIT');
    assert.equal(state.submitMembershipCode(),false);
    const initialError=state.membershipError;
    const input=new InputManager(state,{getMembershipKeyHit(){return null;},getMembershipAction(){return 'confirm';}},{playClick(){}},()=>{});
    input.handleMembershipTouch({x:0,y:0});
    console.log(JSON.stringify({version,bug:'native keyboard blur clears an invalid membership-code error on confirm',initialError,afterConfirm:state.membershipError}));
    assert.equal(state.membershipError,'');
  } finally {restore();}
}

for (const version of ['wechat','web','android']) {
 const restore=installWxStorage(createMemoryStorage()); Object.assign(wx,{onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){}});
 try {
  const {GameState,InputManager}=await loadVersion(version);
  const state=new GameState();state.startNewGame();
  state.setLayout({boardRect:{x:10,y:100,width:300,height:300},cellSize:30});
  state.rackPieces=Array.from({length:3},()=>({cells:[{x:0,y:0}],bounds:{width:1,height:1},color:'#abcdef',used:false}));
  const hitArea={index:0,x:20,y:500,width:20,height:20,cellSize:20};
  state.startDrag(0,30,510,hitArea);
  state.moveDrag(10+state.dragState.pieceWidth/2,100+state.dragState.pieceHeight+state.dragState.dragFingerOffsetY);
  assert.equal(state.endDrag(),true);
  assert.equal(state.feedbackState.gain.active,true);
  const scoreBefore=state.score;
  state.startDrag(1,60,510,{...hitArea,index:1});
  const input=new InputManager(state,{}, {},()=>{});input.activeTouchIdentifier=0;
  input.handleTouchCancel({changedTouches:[{identifier:0,clientX:60,clientY:510}]});
  console.log(JSON.stringify({version,bug:'quick next pickup then touchcancel truncates preceding score feedback',scoreBefore,scoreAfter:state.score,gainAfterCancel:state.feedbackState.gain.active}));
 }finally{restore();}
}
