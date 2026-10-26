import * as THREE from 'three';

/** Common material texture slots. */
const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
  'envMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
] as const;

function disposeMaterialTextures(mat: THREE.Material): void {
  const anyMat = mat as THREE.Material & Record<string, unknown>;
  for (const key of TEXTURE_KEYS) {
    const tex = anyMat[key];
    if (tex && typeof (tex as THREE.Texture).dispose === 'function') {
      (tex as THREE.Texture).dispose();
      anyMat[key] = null;
    }
  }
}

function solidColorFrom(mat: THREE.Material): THREE.Color {
  const colored = mat as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  // Texture-only materials usually leave color at white — use neutral gray instead
  if (colored.map && colored.color) {
    const { r, g, b } = colored.color;
    if (r > 0.95 && g > 0.95 && b > 0.95) {
      return new THREE.Color(0xc4c4c4);
    }
  }
  if (colored.color?.isColor) return colored.color.clone();
  return new THREE.Color(0xc4c4c4);
}

function toSolidMaterial(mat: THREE.Material): THREE.MeshStandardMaterial {
  const src = mat as THREE.Material & {
    metalness?: number;
    roughness?: number;
    transparent?: boolean;
    opacity?: number;
    vertexColors?: boolean;
  };
  const solid = new THREE.MeshStandardMaterial({
    color: solidColorFrom(mat),
    metalness: typeof src.metalness === 'number' ? src.metalness : 0.05,
    roughness: typeof src.roughness === 'number' ? src.roughness : 0.65,
    side: THREE.FrontSide,
    transparent: Boolean(src.transparent),
    opacity: typeof src.opacity === 'number' ? src.opacity : 1,
    vertexColors: Boolean(src.vertexColors),
  });
  solid.name = mat.name || 'Solid';
  return solid;
}

/**
 * Replace all mesh materials under `root` with solid (untextured) materials.
 * Uses `isMesh` duck-typing so it works even if multiple three.js copies are bundled.
 */
export function stripModelTextures(root: THREE.Object3D): void {
  const replaced = new Map<THREE.Material, THREE.MeshStandardMaterial>();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData?.gizmo) return;
    if (!mesh.material) return;

    const apply = (mat: THREE.Material): THREE.MeshStandardMaterial => {
      let solid = replaced.get(mat);
      if (!solid) {
        solid = toSolidMaterial(mat);
        replaced.set(mat, solid);
        disposeMaterialTextures(mat);
        mat.dispose();
      }
      return solid;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => (m ? apply(m) : m));
    } else {
      mesh.material = apply(mesh.material);
    }
  });
}
