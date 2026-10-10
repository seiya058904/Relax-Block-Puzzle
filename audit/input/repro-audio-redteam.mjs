import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { getVersionPath } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
for (const version of ['wechat','web','android']) {
  const previous=globalThis.wx;
  const audio=[];
  globalThis.wx={createInnerAudioContext(){const item={src:'',playing:false,stops:0,seeks:0,plays:0,onError(){},
    stop(){this.playing=false;this.stops++;}, seek(){this.seeks++;}, play(){this.playing=true;this.plays++;}, destroy(){this.playing=false;}};audio.push(item);return item;}};
  try {
    const {default:SoundManager}=await import(pathToFileURL(getVersionPath(version,'game/SoundManager.js')).href);
    const manager=new SoundManager();
    manager.playCombo3();const effect=manager.effectContexts.combo3;
    const beforeMute=effect.stops;
    manager.setSettings({...manager.settings,soundEnabled:false});
    console.log(JSON.stringify({version,case:'mute active effect',playing:effect.playing,stopDelta:effect.stops-beforeMute}));
    assert.equal(effect.playing,true,'baseline: mute leaves active effects running');
    manager.setSettings({...manager.settings,soundEnabled:true,bgmEnabled:true});
    const beforeToggle={stops:manager.bgmContext.stops,seeks:manager.bgmContext.seeks,plays:manager.bgmContext.plays};
    manager.setSettings({...manager.settings,vibrationEnabled:false});
    console.log(JSON.stringify({version,case:'change vibration while BGM on',stopDelta:manager.bgmContext.stops-beforeToggle.stops,seekDelta:manager.bgmContext.seeks-beforeToggle.seeks,playDelta:manager.bgmContext.plays-beforeToggle.plays}));
    const beforeHide=effect.stops;manager.handleAppHide();
    console.log(JSON.stringify({version,case:'hide active effect',playing:effect.playing,stopDelta:effect.stops-beforeHide}));
    const beforeHiddenPlay=effect.plays;manager.playCombo3();
    console.log(JSON.stringify({version,case:'play request while hidden',playDelta:effect.plays-beforeHiddenPlay}));
  }finally{if(previous===undefined)delete globalThis.wx;else globalThis.wx=previous;}
}
