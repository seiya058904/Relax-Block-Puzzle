// GENERATED FILE - edit shared/js source and run npm run sync.
function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

function createEmptyStats() {
  return {
    frameDurations: [],
    totalFrames: 0,
    maxFrameMs: 0,
    maxParticlesPerFrame: 0,
    maxGradientCreatesPerFrame: 0,
    maxLaserDrawsPerFrame: 0,
    maxFullRendersPerFrame: 0,
    maxActiveEffects: 0,
    frameParticles: 0,
    frameGradientCreates: 0,
    frameLaserDraws: 0,
    frameFullRenders: 0,
    activeEffects: 0,
    frameStart: null
  };
}

export function createRenderPerfStats({ enabled = false, logger = console.log } = {}) {
  let stats = createEmptyStats();

  function snapshot() {
    if (!enabled || stats.totalFrames === 0) {
      return enabled ? {
        totalFrames: 0,
        p95FrameMs: 0,
        maxFrameMs: 0,
        maxParticlesPerFrame: 0,
        maxGradientCreatesPerFrame: 0,
        maxLaserDrawsPerFrame: 0,
        maxFullRendersPerFrame: 0,
        maxActiveEffects: stats.maxActiveEffects
      } : null;
    }

    return {
      totalFrames: stats.totalFrames,
      p95FrameMs: percentile(stats.frameDurations, 0.95),
      maxFrameMs: stats.maxFrameMs,
      maxParticlesPerFrame: stats.maxParticlesPerFrame,
      maxGradientCreatesPerFrame: stats.maxGradientCreatesPerFrame,
      maxLaserDrawsPerFrame: stats.maxLaserDrawsPerFrame,
      maxFullRendersPerFrame: stats.maxFullRendersPerFrame,
      maxActiveEffects: stats.maxActiveEffects
    };
  }

  function resetFrameCounters() {
    stats.frameParticles = 0;
    stats.frameGradientCreates = 0;
    stats.frameLaserDraws = 0;
    stats.frameFullRenders = 0;
  }

  return {
    beginFrame(timestamp) {
      if (!enabled) return;
      resetFrameCounters();
      stats.frameStart = Number(timestamp) || 0;
    },

    endFrame(timestamp) {
      if (!enabled || stats.frameStart === null) return;
      const duration = Math.max(0, (Number(timestamp) || 0) - stats.frameStart);
      stats.frameDurations.push(duration);
      stats.totalFrames += 1;
      stats.maxFrameMs = Math.max(stats.maxFrameMs, duration);
      stats.maxParticlesPerFrame = Math.max(stats.maxParticlesPerFrame, stats.frameParticles);
      stats.maxGradientCreatesPerFrame = Math.max(stats.maxGradientCreatesPerFrame, stats.frameGradientCreates);
      stats.maxLaserDrawsPerFrame = Math.max(stats.maxLaserDrawsPerFrame, stats.frameLaserDraws);
      stats.maxFullRendersPerFrame = Math.max(stats.maxFullRendersPerFrame, stats.frameFullRenders);
      stats.frameStart = null;
    },

    recordParticles(count = 1) {
      if (enabled) stats.frameParticles += Math.max(0, Number(count) || 0);
    },

    recordGradient(count = 1) {
      if (enabled) stats.frameGradientCreates += Math.max(0, Number(count) || 0);
    },

    recordLaser(count = 1) {
      if (enabled) stats.frameLaserDraws += Math.max(0, Number(count) || 0);
    },

    recordFullRender() {
      if (enabled) stats.frameFullRenders += 1;
    },

    setActiveEffects(count) {
      if (!enabled) return;
      const nextCount = Math.max(0, Number(count) || 0);
      stats.activeEffects = nextCount;
      stats.maxActiveEffects = Math.max(stats.maxActiveEffects, nextCount);
      if (nextCount === 0 && stats.totalFrames > 0 && stats.maxActiveEffects > 0) {
        logger(snapshot());
        stats = createEmptyStats();
      }
    },

    snapshot
  };
}
