const EFFECT_SOURCES = {
  pickup: { src: 'audio/pickup.mp3' },
  place: { src: 'audio/place.mp3' },
  clear: { src: 'audio/clear.mp3' },
  combo: { src: 'audio/combo.mp3' },
  combo3: { src: 'audio/combo3.mp3' },
  click: { src: 'audio/click.mp3' },
  gameover: { src: 'audio/gameover.mp3' }
};

const BGM_TRACKS = {
  1: { id: 1, file: 'audio/bgm_1.mp3', label: '音乐一 · 高亢', volume: 0.26 },
  2: { id: 2, file: 'audio/bgm_2.mp3', label: '音乐二 · 电子', volume: 0.32 },
  3: { id: 3, file: 'audio/bgm_3.mp3', label: '音乐三 · 兴奋', volume: 0.28 },
  4: { id: 4, file: 'audio/bgm_4.mp3', label: '音乐四 · 活跃', volume: 0.32 }
};

function normalizeTrackId(trackId) {
  const numericTrack = Number(trackId);
  return BGM_TRACKS[numericTrack] ? numericTrack : 2;
}

export default class SoundManager {
  constructor() {
    this.settings = {
      soundEnabled: true,
      bgmEnabled: false,
      bgmTrack: 2
    };
    this.effectContexts = {};
    this.bgmContext = null;
    this.warnedKeys = {};
    this.appHidden = false;
    this.currentBgmTrack = 2;
  }

  warnOnce(key, message) {
    if (this.warnedKeys[key]) {
      return;
    }
    this.warnedKeys[key] = true;
    console.warn(message);
  }

  setSettings(settings) {
    const previousEnabled = this.settings.bgmEnabled;
    const previousTrack = normalizeTrackId(this.settings.bgmTrack);
    const nextTrack = normalizeTrackId(settings.bgmTrack);

    this.settings = {
      ...this.settings,
      ...settings,
      bgmTrack: nextTrack
    };
    this.currentBgmTrack = nextTrack;

    if (previousTrack !== nextTrack) {
      this.switchBgmTrack(nextTrack);
      return;
    }

    if (previousEnabled !== this.settings.bgmEnabled) {
      this.setBgmEnabled(this.settings.bgmEnabled);
      return;
    }

    this.syncBgm();
  }

  setBgmEnabled(enabled) {
    this.settings.bgmEnabled = !!enabled;
    this.syncBgm();
  }

  getCurrentBgmTrack() {
    return normalizeTrackId(this.settings.bgmTrack);
  }

  getCurrentBgmLabel() {
    return BGM_TRACKS[this.getCurrentBgmTrack()].label;
  }

  createEffectAudio(key) {
    if (this.effectContexts[key]) {
      return this.effectContexts[key];
    }

    if (!wx.createInnerAudioContext || !EFFECT_SOURCES[key]) {
      return null;
    }

    try {
      const audio = wx.createInnerAudioContext();
      audio.src = EFFECT_SOURCES[key].src;
      audio.autoplay = false;
      audio.loop = false;
      if (audio.onError) {
        audio.onError(() => {
          this.warnOnce(`effect_${key}`, `effect playback failed: ${EFFECT_SOURCES[key].src}`);
        });
      }
      this.effectContexts[key] = audio;
      return audio;
    } catch (error) {
      this.warnOnce(`effect_${key}`, `effect init failed: ${key}`);
      return null;
    }
  }

  createBgmAudio(trackId) {
    const normalizedTrack = normalizeTrackId(trackId);
    const track = BGM_TRACKS[normalizedTrack];

    if (!wx.createInnerAudioContext || !track) {
      return null;
    }

    try {
      const audio = wx.createInnerAudioContext();
      audio.src = track.file;
      audio.autoplay = false;
      audio.loop = true;
      audio.volume = track.volume;
      if (audio.onError) {
        audio.onError(() => {
          this.warnOnce(`bgm_${normalizedTrack}`, `bgm playback failed: ${track.file}`);
        });
      }
      return audio;
    } catch (error) {
      this.warnOnce(`bgm_${normalizedTrack}`, `bgm init failed: ${track.file}`);
      return null;
    }
  }

  destroyBgmContext() {
    if (!this.bgmContext) {
      return;
    }

    try {
      this.bgmContext.stop();
    } catch (error) {
      this.warnOnce('bgm_stop', 'bgm stop failed');
    }

    if (this.bgmContext.destroy) {
      try {
        this.bgmContext.destroy();
      } catch (error) {
        this.warnOnce('bgm_destroy', 'bgm destroy failed');
      }
    }

    this.bgmContext = null;
  }

  playEffect(key) {
    if (!this.settings.soundEnabled) {
      return;
    }

    const audio = this.createEffectAudio(key);
    if (!audio) {
      return;
    }

    try {
      audio.stop();
      if (audio.seek) {
        audio.seek(0);
      }
      audio.play();
    } catch (error) {
      this.warnOnce(`effect_trigger_${key}`, `effect trigger failed: ${key}`);
    }
  }

  ensureBgmContext() {
    const trackId = this.getCurrentBgmTrack();
    if (this.bgmContext && this.currentBgmTrack === trackId) {
      return this.bgmContext;
    }

    this.destroyBgmContext();
    this.currentBgmTrack = trackId;
    this.bgmContext = this.createBgmAudio(trackId);
    return this.bgmContext;
  }

  playBgm() {
    if (!this.settings.bgmEnabled || this.appHidden) {
      return;
    }

    const audio = this.ensureBgmContext();
    if (!audio) {
      return;
    }

    try {
      audio.stop();
      if (audio.seek) {
        audio.seek(0);
      }
      audio.play();
    } catch (error) {
      this.warnOnce(`bgm_play_${this.currentBgmTrack}`, 'bgm play failed');
    }
  }

  stopBgm() {
    if (!this.bgmContext) {
      return;
    }

    try {
      this.bgmContext.stop();
    } catch (error) {
      this.warnOnce('bgm_stop', 'bgm stop failed');
    }
  }

  switchBgmTrack(trackId) {
    const normalizedTrack = normalizeTrackId(trackId);
    this.settings.bgmTrack = normalizedTrack;
    this.currentBgmTrack = normalizedTrack;

    this.destroyBgmContext();

    if (this.settings.bgmEnabled && !this.appHidden) {
      this.playBgm();
    }
  }

  syncBgm() {
    if (this.settings.bgmEnabled && !this.appHidden) {
      this.playBgm();
    } else {
      this.stopBgm();
    }
  }

  handleAppHide() {
    this.appHidden = true;
    this.stopBgm();
  }

  handleAppShow() {
    this.appHidden = false;
    if (this.settings.bgmEnabled) {
      this.playBgm();
    }
  }

  playPickup() {
    this.playEffect('pickup');
  }

  playPlace() {
    this.playEffect('place');
  }

  playClear() {
    this.playEffect('clear');
  }

  playCombo() {
    this.playEffect('combo');
  }

  playCombo3() {
    this.playEffect('combo3');
  }

  playInvalid() {
    this.playEffect('click');
  }

  playClick() {
    this.playEffect('click');
  }

  playGameOver() {
    this.playEffect('gameover');
  }
}
