import { auditModuleUrl } from '../source-path.mjs';
import {pathToFileURL} from 'node:url';
const {getVersionPath,loadVersion} = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const {createMemoryStorage,installWxStorage} = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
for(const version of ['wechat','web','android']){
 const restore=installWxStorage(createMemoryStorage());Object.assign(wx,{onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){}});
 try{
  const {default:Renderer}=await import(pathToFileURL(getVersionPath(version,'game/Renderer.js')).href);
  const {GameState,InputManager}=await loadVersion(version);
  for(const [w,h] of [[844,390],[640,360],[568,320],[360,300]]){
   const state=new GameState();state.startNewGame();
   const ctx=new Proxy({measureText:s=>({width:String(s).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getTransform:()=>({a:1})},{get:(t,k)=>k in t?t[k]:()=>{}});
   const renderer=new Renderer(ctx,{screenWidth:w,screenHeight:h},{menuButton:null,safeArea:null});renderer.render(state);
   const input=new InputManager(state,renderer,{playClick(){}},()=>{});
   const area=renderer.layout.rackSlots[0];
   const finger={identifier:0,clientX:area.x+area.width/2,clientY:area.y+area.height/2};
   let error=null;try{input.handleTouchStart({touches:[finger],changedTouches:[finger]});}catch(e){error=e.message;}
   console.log(JSON.stringify({version,w,h,cell:renderer.layout.cellSize,boardWidth:renderer.layout.boardRect.width,rackHit:!!renderer.getRackHitArea(finger.clientX,finger.clientY),drag:state.dragState.isDragging,error}));
  }
 }finally{restore();}
}
