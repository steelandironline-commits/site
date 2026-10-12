export const DESKTOP_SCENE_SCALE = 1.6;
export const DESKTOP_SCENE_MIN_WIDTH = 960;

/** Zoom only the desktop presentation; touch/mobile framing keeps its original size. */
export function sceneScale(width, mobile) {
  return !mobile && width >= DESKTOP_SCENE_MIN_WIDTH ? DESKTOP_SCENE_SCALE : 1;
}

export function descentCameraDistance({ width, height, fov, mobile, dive = 0 }) {
  const tanH = Math.tan((fov * Math.PI) / 360);
  const fw = mobile ? 22 / 0.98 : 22 / 0.55;
  const fh = mobile ? 14.5 / 0.44 : 14.5 / 0.8;
  const fit = Math.max(fh / (2 * tanH), fw / (2 * tanH * (width / height)));
  return (fit * (1 + 0.32 * dive)) / sceneScale(width, mobile);
}

export function descentViewOffset({ width, height, mobile }) {
  // Move the enlarged city inward so its outer buildings stay away from the chapter rail.
  const desktop = sceneScale(width, mobile) > 1;
  return {
    x: mobile ? 0 : -(desktop ? 0.08 : 0.175) * width,
    y: mobile ? 0.18 * height : -0.02 * height,
  };
}
