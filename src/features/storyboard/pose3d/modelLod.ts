import type * as THREE from 'three';

/** Mesh / node names like `adult-male_LOD0`, `child-LOD3`, `foo-LOD4.001` */
const LOD_RE = /[_-]LOD(\d+)/i;

/**
 * When a binding contains multiple LOD meshes, keep only LOD0 (high poly) visible.
 * No-op if the model has no LOD-named meshes.
 */
export function applyLod0Only(root: THREE.Object3D): void {
  const hits: { obj: THREE.Object3D; level: number }[] = [];
  root.traverse((child) => {
    const m = child.name.match(LOD_RE);
    if (!m) return;
    hits.push({ obj: child, level: parseInt(m[1], 10) });
  });
  if (hits.length === 0) return;
  for (const { obj, level } of hits) {
    obj.visible = level === 0;
  }
}

export function hasLodMeshes(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((child) => {
    if (found) return;
    if (LOD_RE.test(child.name)) found = true;
  });
  return found;
}
