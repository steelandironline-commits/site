/** Screen footprint of one island (tip to tip), in world units. */
export const ISLAND_W = 22;
export const ISLAND_H = 14.5;

const NAV = 76; // header plus breathing room
const CUE = 56; // scroll cue at the bottom
const RAIL = 28; // chapter rail dots on the right
const GAP = 32; // space between the caption and the island
const MIN_COPY_H = 440; // tallest caption (title + text + buttons) on desktop

function mobileFrame({ width, height, tanH }) {
  const fw = ISLAND_W / 0.98;
  const fh = ISLAND_H / 0.44;
  const distance = Math.max(fh / (2 * tanH), fw / (2 * tanH * (width / height)));
  return { distance, offset: { x: 0, y: 0.18 * height } };
}

/**
 * Screen rectangle the island may use on desktop: right of the caption or,
 * on tall screens (a phone in desktop mode), above it, whichever is roomier.
 */
export function desktopRegion({ width, height, copy }) {
  const c = copy || { right: Math.min(460, 0.38 * width) + 24, center: 0.52 * height, height: MIN_COPY_H };
  const copyH = Math.max(c.height || 0, MIN_COPY_H);
  const copyTop = c.center - copyH / 2;
  const right = width - RAIL;
  const regions = [
    { x0: c.right + GAP, x1: right, y0: NAV, y1: height - CUE },
    { x0: 24, x1: right, y0: NAV, y1: copyTop - GAP },
  ].map((r) => ({ ...r, ppu: Math.min((r.x1 - r.x0) / ISLAND_W, (r.y1 - r.y0) / ISLAND_H) }));
  return regions.reduce((best, r) => (r.ppu > best.ppu ? r : best));
}

/** Camera distance (before the dive) and view offset that keep the island clear of the caption. */
export function descentFrame({ width, height, fov, mobile, copy }) {
  const tanH = Math.tan((fov * Math.PI) / 360);
  if (mobile) return mobileFrame({ width, height, tanH });
  const r = desktopRegion({ width, height, copy });
  const ppu = Math.max(r.ppu, 1);
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  return {
    distance: height / (2 * tanH * ppu),
    offset: { x: width / 2 - cx, y: height / 2 - cy },
  };
}

export function descentCameraDistance({ width, height, fov, mobile, copy, dive = 0 }) {
  return descentFrame({ width, height, fov, mobile, copy }).distance * (1 + 0.32 * dive);
}

export function descentViewOffset({ width, height, fov = 22, mobile, copy }) {
  return descentFrame({ width, height, fov, mobile, copy }).offset;
}
