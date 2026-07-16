import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderPerfStats } from '../../shared/js/game/RenderPerfStats.js';

test('render performance stats stay inert when debug mode is disabled', () => {
  const stats = createRenderPerfStats({ enabled: false, logger: () => { throw new Error('should not log'); } });
  stats.beginFrame(0);
  stats.recordParticles(4);
  stats.recordGradient();
  stats.recordLaser();
  stats.endFrame(20);
  stats.setActiveEffects(1);
  stats.setActiveEffects(0);
  assert.equal(stats.snapshot(), null);
});

test('render performance stats report a completed clear effect once', () => {
  const reports = [];
  const stats = createRenderPerfStats({ enabled: true, logger: (report) => reports.push(report) });
  stats.beginFrame(0);
  stats.recordParticles(4);
  stats.recordGradient(2);
  stats.recordLaser(1);
  stats.recordFullRender();
  stats.endFrame(20);
  stats.beginFrame(20);
  stats.endFrame(36);
  stats.setActiveEffects(1);
  stats.setActiveEffects(0);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].totalFrames, 2);
  assert.equal(reports[0].maxFrameMs, 20);
  assert.equal(reports[0].maxParticlesPerFrame, 4);
  assert.equal(reports[0].maxGradientCreatesPerFrame, 2);
  assert.equal(reports[0].maxLaserDrawsPerFrame, 1);
  assert.equal(reports[0].maxFullRendersPerFrame, 1);
  assert.equal(reports[0].maxActiveEffects, 1);
  assert.equal(Number.isFinite(reports[0].p95FrameMs), true);
});
