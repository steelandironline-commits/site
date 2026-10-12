import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { descentCameraDistance, descentViewOffset } from '../src/pages/landing/descent/framing.js';

function projectedSpan({ width, height, mobile, zoomed }) {
  const fov = mobile ? 24 : 22;
  const options = { width, height, fov, mobile };
  const tanH = Math.tan(fov * Math.PI / 360);
  const fw = mobile ? 22 / 0.98 : 22 / 0.55;
  const fh = mobile ? 14.5 / 0.44 : 14.5 / 0.8;
  const originalDistance = Math.max(fh / (2 * tanH), fw / (2 * tanH * (width / height)));
  const distance = zoomed ? descentCameraDistance(options) : originalDistance;
  const camera = new PerspectiveCamera(fov, width / height, 1, 400);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const left = new Vector3(-2, 0, 0).project(camera);
  const right = new Vector3(2, 0, 0).project(camera);
  return (right.x - left.x) * width / 2;
}

describe('presentation framing', () => {
  it.each([[1366, 768], [1920, 1080], [2560, 1440]])('projects desktop objects 60%% larger at %i × %i', (width, height) => {
    const options = { width, height, mobile: false };
    expect(projectedSpan({ ...options, zoomed: true }) / projectedSpan({ ...options, zoomed: false })).toBeCloseTo(1.6, 8);
  });

  it.each([[390, 844], [767, 1024], [820, 1180]])('preserves the original mobile/tablet camera at %i × %i', (width, height) => {
    const mobile = width <= 767;
    const fov = mobile ? 24 : 22;
    const tanH = Math.tan(fov * Math.PI / 360);
    const fw = mobile ? 22 / 0.98 : 22 / 0.55;
    const fh = mobile ? 14.5 / 0.44 : 14.5 / 0.8;
    const original = Math.max(fh / (2 * tanH), fw / (2 * tanH * (width / height)));
    expect(descentCameraDistance({ width, height, fov, mobile })).toBeCloseTo(original, 8);
  });

  it('brings the enlarged desktop scene inward while preserving the mobile offset', () => {
    expect(descentViewOffset({ width: 1920, height: 1080, mobile: false }).x).toBeCloseTo(-153.6);
    expect(descentViewOffset({ width: 390, height: 844, mobile: true })).toEqual({ x: 0, y: 151.92 });
  });
});
