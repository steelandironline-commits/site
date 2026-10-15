/*
 * Static batching for the descent islands.
 *
 * An island is built from hundreds of tiny meshes (one per box), which costs
 * one draw call each — twice with shadows. Once an island has finished rising,
 * every mesh that never moves again is baked into a handful of merged meshes:
 * plain colours become vertex colours, texture repeat/offset is baked into the
 * UVs, so all meshes that differ only in colour or tiling share one draw call.
 *
 * Opt-outs (the originals keep rendering):
 *   - `userData.dyn`   on any animated node (and so its whole subtree);
 *   - `userData.rigid` on an animated node whose subtree moves as one piece:
 *     its static descendants are merged in that node's local space;
 *   - `material.userData.live` on materials changed at runtime;
 *   - anything transparent, non-standard, ordered or partially drawn.
 */
import * as THREE from 'three';

const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _uvm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _uv = new THREE.Vector2();
const ONE = new THREE.Matrix3();

function supported(m) {
  return (
    m &&
    m.isMeshStandardMaterial &&
    !m.isMeshPhysicalMaterial &&
    !m.transparent &&
    m.opacity === 1 &&
    m.alphaTest === 0 &&
    m.depthTest &&
    m.depthWrite &&
    !m.vertexColors &&
    !m.userData.live &&
    !m.normalMap &&
    !m.bumpMap &&
    !m.alphaMap &&
    !m.displacementMap &&
    !m.roughnessMap &&
    !m.metalnessMap &&
    !m.aoMap &&
    !m.lightMap &&
    !m.envMap
  );
}

function texMatrix(t) {
  if (!t) return null;
  if (t.matrixAutoUpdate) t.updateMatrix();
  return t.matrix;
}

/** UV transform shared by map and emissiveMap, or false when they differ. */
function uvTransform(m) {
  const a = texMatrix(m.map);
  const b = texMatrix(m.emissiveMap);
  if (a && b && !a.equals(b)) return false;
  return a || b || ONE;
}

const texKey = (t) => (t ? `${t.source.uuid}:${t.wrapS}:${t.wrapT}:${t.magFilter}:${t.minFilter}:${t.colorSpace}:${t.anisotropy}` : '-');

/** Bucket key: everything that must match to share one draw call. */
function keyOf(m, mesh) {
  const flags = `${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}`;
  const uv = uvTransform(m);
  if (uv === false) return { key: `own|${m.uuid}|${flags}`, shared: false, uv: ONE };
  const emissive = m.emissive && m.emissiveIntensity > 0 ? `${m.emissive.getHexString()}*${m.emissiveIntensity.toFixed(3)}` : '0';
  const key = [
    'std',
    texKey(m.map),
    texKey(m.emissiveMap),
    emissive,
    m.roughness.toFixed(3),
    m.metalness.toFixed(3),
    m.flatShading ? 1 : 0,
    m.side,
    m.fog ? 1 : 0,
    m.toneMapped ? 1 : 0,
    flags,
  ].join('|');
  return { key, shared: true, uv };
}

const baked = new Map();
/** Same image and sampling as `t`, with the UV transform reset (it now lives in the UVs). */
function untiled(t) {
  if (!t) return null;
  const k = texKey(t);
  let out = baked.get(k);
  if (!out) {
    out = t.clone();
    out.repeat.set(1, 1);
    out.offset.set(0, 0);
    out.center.set(0, 0);
    out.rotation = 0;
    out.needsUpdate = true;
    baked.set(k, out);
  }
  return out;
}

function sharedMaterial(m) {
  const out = m.clone();
  out.color.set('#ffffff');
  out.vertexColors = true;
  out.map = untiled(m.map);
  out.emissiveMap = untiled(m.emissiveMap);
  out.userData = { merged: true };
  return out;
}

/** Triangle ranges of a mesh, one per material. Null when any part can't be merged. */
function parts(mesh) {
  const g = mesh.geometry;
  if (!g?.attributes?.position || g.morphAttributes?.position || g.drawRange.count !== Infinity || g.drawRange.start !== 0) return null;
  const total = g.index ? g.index.count : g.attributes.position.count;
  if (Array.isArray(mesh.material)) {
    if (!g.groups.length) return null;
    const out = [];
    for (const grp of g.groups) {
      const m = mesh.material[grp.materialIndex];
      if (!supported(m)) return null;
      out.push({ m, start: grp.start, count: Math.min(grp.count, total - grp.start) });
    }
    return out;
  }
  return supported(mesh.material) ? [{ m: mesh.material, start: 0, count: total }] : null;
}

function collect(root, buckets, hidden, roots) {
  const visit = (o, dyn) => {
    if (!o.visible || o.userData.merged) return;
    if (o !== root && o.userData.rigid) {
      roots.push(o);
      return;
    }
    const still = !dyn && !(o !== root && o.userData.dyn);
    if (still && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.renderOrder === 0) {
      const list = parts(o);
      if (list) {
        const rel = new THREE.Matrix4().multiplyMatrices(_inv, o.matrixWorld);
        for (const p of list) {
          const { key, shared, uv } = keyOf(p.m, o);
          let b = buckets.get(key);
          if (!b) {
            b = { shared, material: p.m, cast: o.castShadow, receive: o.receiveShadow, items: [], verts: 0 };
            buckets.set(key, b);
          }
          b.items.push({ g: o.geometry, rel, uv: uv.clone(), color: p.m.color, start: p.start, count: p.count });
          b.verts += p.count;
        }
        hidden.push(o);
      }
    }
    // rigid pieces can sit inside animated parents, so keep looking
    for (const c of o.children) visit(c, !still);
  };
  for (const c of root.children) visit(c, false);
}

function build(b) {
  const n = b.verts;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const col = b.shared ? new Float32Array(n * 3) : null;
  let w = 0;
  for (const it of b.items) {
    const { g, rel } = it;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const U = g.attributes.uv;
    const I = g.index;
    _nm.getNormalMatrix(rel);
    _uvm.copy(it.uv);
    const flip = rel.determinant() < 0;
    for (let k = 0; k < it.count; k++) {
      // keep the winding when the transform mirrors the mesh
      let kk = it.start + k;
      if (flip) {
        const r = k % 3;
        if (r === 1) kk += 1;
        else if (r === 2) kk -= 1;
      }
      const i = I ? I.getX(kk) : kk;
      _v.fromBufferAttribute(P, i).applyMatrix4(rel);
      pos[w * 3] = _v.x;
      pos[w * 3 + 1] = _v.y;
      pos[w * 3 + 2] = _v.z;
      if (N) {
        _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
        nor[w * 3] = _n.x;
        nor[w * 3 + 1] = _n.y;
        nor[w * 3 + 2] = _n.z;
      }
      if (U) {
        _uv.fromBufferAttribute(U, i).applyMatrix3(_uvm);
        uvs[w * 2] = _uv.x;
        uvs[w * 2 + 1] = _uv.y;
      }
      if (col) {
        col[w * 3] = it.color.r;
        col[w * 3 + 1] = it.color.g;
        col[w * 3 + 2] = it.color.b;
      }
      w += 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const material = b.shared ? sharedMaterial(b.material) : b.material;
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = b.cast;
  mesh.receiveShadow = b.receive;
  mesh.matrixAutoUpdate = false;
  mesh.userData.merged = true;
  return mesh;
}

/**
 * Merges the static meshes under `root` (and under every rigid node inside
 * it). Returns a disposer that removes the batches and shows the originals.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const made = [];
  const hiddenAll = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    _inv.copy(node.matrixWorld).invert();
    const buckets = new Map();
    const hidden = [];
    collect(node, buckets, hidden, pending);
    // Only worth it when it removes draw calls.
    if (hidden.length < 2) continue;
    for (const b of buckets.values()) {
      const mesh = build(b);
      node.add(mesh);
      made.push(mesh);
    }
    for (const o of hidden) o.visible = false;
    hiddenAll.push(...hidden);
  }
  return () => {
    for (const mesh of made) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      if (mesh.material.userData.merged) mesh.material.dispose();
    }
    for (const o of hiddenAll) o.visible = true;
  };
}
