import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ISLAND_H, ISLAND_W, descentCameraDistance, descentFrame, descentViewOffset } from '../src/pages/landing/descent/framing.js';

/** Screen box (px) of an island-sized rectangle centred on the camera target. */
function islandBox({ width, height, mobile, copy }) {
  const fov = mobile ? 24 : 22;
  const frame = descentFrame({ width, height, fov, mobile, copy });
  const camera = new PerspectiveCamera(fov, width / height, 1, 800);
  camera.position.set(0, 0, frame.distance);
  camera.lookAt(0, 0, 0);
  camera.setViewOffset(width, height, frame.offset.x, frame.offset.y, width, height);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const px = (v) => {
    const p = v.project(camera);
    return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
  };
  const tl = px(new Vector3(-ISLAND_W / 2, ISLAND_H / 2, 0));
  const br = px(new Vector3(ISLAND_W / 2, -ISLAND_H / 2, 0));
  return { left: tl.x, right: br.x, top: tl.y, bottom: br.y };
}

const caption = (width, height) => ({ right: Math.max(24, (width - 1200) / 2 + 24) + Math.min(460, 0.38 * width), center: 0.52 * height - 50, height: 470 });

describe('presentation framing', () => {
  it.each([[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]])('keeps the desktop island clear of the caption at %i × %i', (width, height) => {
    const copy = caption(width, height);
    const box = islandBox({ width, height, mobile: false, copy });
    expect(box.left).toBeGreaterThanOrEqual(copy.right);
    expect(box.right).toBeLessThanOrEqual(width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(height);
    // Still uses most of the free area.
    expect(box.right - box.left).toBeGreaterThan(0.45 * width);
  });

  it('puts the island above the caption on tall desktop-mode screens', () => {
    const width = 980;
    const height = 1900;
    const copy = caption(width, height);
    const box = islandBox({ width, height, mobile: false, copy });
    expect(box.bottom).toBeLessThanOrEqual(copy.center - copy.height / 2);
    expect(box.right - box.left).toBeGreaterThan(0.8 * width);
  });

  it.each([[390, 844], [430, 932]])('preserves the original phone camera at %i × %i', (width, height) => {
    const fov = 24;
    const tanH = Math.tan((fov * Math.PI) / 360);
    const original = Math.max(14.5 / 0.44 / (2 * tanH), 22 / 0.98 / (2 * tanH * (width / height)));
    expect(descentCameraDistance({ width, height, fov, mobile: true })).toBeCloseTo(original, 8);
    expect(descentViewOffset({ width, height, fov, mobile: true })).toEqual({ x: 0, y: 0.18 * height });
  });

  it('pulls the camera back while diving between islands', () => {
    const opts = { width: 1366, height: 768, fov: 22, mobile: false };
    expect(descentCameraDistance({ ...opts, dive: 1 }) / descentCameraDistance(opts)).toBeCloseTo(1.32, 8);
  });
});
