/**
 * Pose library thumbnails: render each pose with the first built-in character
 * (adult-male.glb), cache in IndexedDB, and prefer static files when present.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BUILT_IN_CHARACTERS } from './builtInCharacters';
import { buildBoneNameMapping, normalizeBoneNamesOnImport } from '../../../constants/skeletonSpec';
import { getAssetPath } from '../../../utils/pathUtils';
import { applyLod0Only } from './modelLod';
import { stripModelTextures } from './stripModelTextures';

const THUMB_SIZE = 160;
const DB_NAME = 'yingge-pose-thumbs';
const DB_STORE = 'thumbs';
const DB_VERSION = 2; // bump: built-in models render without textures
const STATIC_EXT = ['.webp', '.png', '.jpg'];

type PoseLike = {
  id?: string;
  name?: string;
  state?: {
    skeleton?: Record<string, BonePoseData>;
    handSkeleton?: Record<string, BonePoseData>;
  };
};

type BonePoseData = {
  rotation?: { x?: number; y?: number; z?: number };
  position?: { x?: number; y?: number; z?: number };
  quaternion?: number[];
};

type RestBone = {
  bone: THREE.Bone;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

type Listener = (id: string, url: string | null) => void;

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const listeners = new Set<Listener>();
/** After a few consecutive static 404s, skip static probes (empty thumbs/). */
let staticFailStreak = 0;
const STATIC_SKIP_AFTER = 3;
let rendererReady: Promise<ThumbRenderer> | null = null;
let genQueue: PoseLike[] = [];
let genRunning = false;
let genPaused = false;
/** Serialize WebGL capture — one pose at a time on the shared renderer. */
let renderChain: Promise<unknown> = Promise.resolve();

function withRendererLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderChain.then(fn, fn);
  renderChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function poseKey(pose: PoseLike): string {
  return String(pose.id || pose.name || '');
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(DB_STORE)) {
        db.deleteObjectStore(DB_STORE);
      }
      db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore quota / private mode
  }
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function tryStaticThumb(id: string): Promise<string | null> {
  if (staticFailStreak >= STATIC_SKIP_AFTER) return null;
  for (const ext of STATIC_EXT) {
    const url = getAssetPath(`/models/poses/thumbs/${id}${ext}`);
    if (await probeImage(url)) {
      staticFailStreak = 0;
      return url;
    }
  }
  staticFailStreak += 1;
  return null;
}

function notify(id: string, url: string | null) {
  listeners.forEach((fn) => {
    try {
      fn(id, url);
    } catch {
      // ignore
    }
  });
}

export function subscribePoseThumbs(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCachedPoseThumb(id: string): string | null {
  return memoryCache.get(id) || null;
}

class ThumbRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Object3D;
  skeletons: THREE.Skeleton[];
  rest: RestBone[];
  useYXZ: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    root: THREE.Object3D,
    skeletons: THREE.Skeleton[],
    rest: RestBone[],
    useYXZ: boolean
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.root = root;
    this.skeletons = skeletons;
    this.rest = rest;
    this.useYXZ = useYXZ;
  }

  resetPose() {
    for (const r of this.rest) {
      r.bone.position.copy(r.position);
      r.bone.quaternion.copy(r.quaternion);
      r.bone.scale.copy(r.scale);
    }
    this.root.updateMatrixWorld(true);
    for (const skel of this.skeletons) skel.update();
  }

  applyPose(pose: PoseLike) {
    this.resetPose();
    const skeletonData = pose.state?.skeleton ?? {};
    const handData = pose.state?.handSkeleton ?? {};
    const applyBone = (name: string, data: BonePoseData) => {
      for (const skel of this.skeletons) {
        const bone = skel.bones.find((b) => b.name === name);
        if (!bone) continue;
        bone.rotation.order = this.useYXZ ? 'YXZ' : 'XYZ';
        if (data.quaternion && data.quaternion.length >= 4) {
          bone.setRotationFromQuaternion(
            new THREE.Quaternion(
              data.quaternion[0] ?? 0,
              data.quaternion[1] ?? 0,
              data.quaternion[2] ?? 0,
              data.quaternion[3] ?? 1
            )
          );
        } else if (data.rotation) {
          bone.rotation.set(
            Number(data.rotation.x) || 0,
            Number(data.rotation.y) || 0,
            Number(data.rotation.z) || 0
          );
        }
        if (data.position) {
          bone.position.set(
            Number(data.position.x) || 0,
            Number(data.position.y) || 0,
            Number(data.position.z) || 0
          );
        }
        break;
      }
    };
    Object.entries(skeletonData).forEach(([n, d]) => applyBone(n, d));
    Object.entries(handData).forEach(([n, d]) => applyBone(n, d));
    this.root.updateMatrixWorld(true);
    for (const skel of this.skeletons) {
      skel.bones.forEach((b) => b.updateMatrixWorld(true));
      skel.update();
    }
  }

  capture(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.82);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}

function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const dist = maxDim * 1.55;
  camera.position.set(center.x + dist * 0.35, center.y + dist * 0.15, center.z + dist);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
  camera.lookAt(center.x, center.y + size.y * 0.05, center.z);
  camera.updateProjectionMatrix();
}

async function createRenderer(): Promise<ThumbRenderer> {
  const modelPath = BUILT_IN_CHARACTERS[0]?.path;
  if (!modelPath) throw new Error('no default character');

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xf3f4f6, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f4f6);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-2, 1.5, -1);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelPath);
  const root = gltf.scene;
  root.traverse((child) => {
    child.frustumCulled = false;
    child.visible = true;
    if (child instanceof THREE.Mesh) {
      const apply = (mat: THREE.Material) => {
        if ('side' in mat) (mat as THREE.Material & { side: number }).side = THREE.FrontSide;
      };
      if (Array.isArray(child.material)) child.material.forEach(apply);
      else if (child.material) apply(child.material);
    }
  });
  stripModelTextures(root);
  applyLod0Only(root);
  scene.add(root);

  const skeletons: THREE.Skeleton[] = [];
  let primary: THREE.Skeleton | null = null;
  const boneMap = new Map<string, THREE.Bone>();
  root.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && child.skeleton) {
      if (!skeletons.includes(child.skeleton)) skeletons.push(child.skeleton);
      if (!primary || child.skeleton.bones.length > primary.bones.length) {
        primary = child.skeleton;
        boneMap.clear();
        child.skeleton.bones.forEach((b) => boneMap.set(b.name, b));
      }
    }
  });

  if (primary) {
    const mapping = buildBoneNameMapping(Array.from(boneMap.keys()));
    normalizeBoneNamesOnImport(boneMap, mapping, primary.bones);
    for (const skel of skeletons) {
      if (skel === primary) continue;
      for (const bone of skel.bones) {
        const standard = mapping.get(bone.name);
        if (standard) bone.name = standard;
      }
    }
  }

  root.updateMatrixWorld(true);
  frameCamera(camera, root);

  const rest: RestBone[] = [];
  const seen = new Set<THREE.Bone>();
  for (const skel of skeletons) {
    for (const bone of skel.bones) {
      if (seen.has(bone)) continue;
      seen.add(bone);
      rest.push({
        bone,
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      });
    }
  }

  const boneNames = Array.from(boneMap.keys());
  const useYXZ = boneNames.some((n) => n.toLowerCase().includes('mixamorig'));

  return new ThumbRenderer(renderer, scene, camera, root, skeletons, rest, useYXZ);
}

function getRenderer(): Promise<ThumbRenderer> {
  if (!rendererReady) {
    rendererReady = createRenderer().catch((err) => {
      rendererReady = null;
      throw err;
    });
  }
  return rendererReady;
}

async function renderOne(pose: PoseLike): Promise<string | null> {
  const id = poseKey(pose);
  if (!id) return null;
  if (memoryCache.has(id)) return memoryCache.get(id)!;
  if (inflight.has(id)) return inflight.get(id)!;

  const job = (async () => {
    const staticUrl = await tryStaticThumb(id);
    if (staticUrl) {
      memoryCache.set(id, staticUrl);
      notify(id, staticUrl);
      return staticUrl;
    }
    const cached = await idbGet(id);
    if (cached) {
      memoryCache.set(id, cached);
      notify(id, cached);
      return cached;
    }
    try {
      const dataUrl = await withRendererLock(async () => {
        const r = await getRenderer();
        r.applyPose(pose);
        await new Promise((res) => requestAnimationFrame(() => res(undefined)));
        return r.capture();
      });
      memoryCache.set(id, dataUrl);
      void idbSet(id, dataUrl);
      notify(id, dataUrl);
      return dataUrl;
    } catch (e) {
      console.warn('[poseThumb] render failed', id, e);
      notify(id, null);
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, job);
  return job;
}

async function pumpQueue() {
  if (genRunning || genPaused) return;
  genRunning = true;
  try {
    while (genQueue.length > 0 && !genPaused) {
      const pose = genQueue.shift()!;
      const id = poseKey(pose);
      if (!id || memoryCache.has(id)) continue;
      await renderOne(pose);
      // yield so UI stays responsive
      await new Promise((res) => setTimeout(res, 0));
    }
  } finally {
    genRunning = false;
  }
}

/** Prefetch / generate thumbs for a list of poses (priority = array order). */
export function enqueuePoseThumbGeneration(poses: PoseLike[]) {
  const pending = poses.filter((p) => {
    const id = poseKey(p);
    return id && !memoryCache.has(id) && !inflight.has(id);
  });
  // Put requested poses at the front, keep existing queue after
  const seen = new Set(pending.map(poseKey));
  genQueue = [...pending, ...genQueue.filter((p) => !seen.has(poseKey(p)))];
  void pumpQueue();
}

/** Resolve a single pose thumb (static → IndexedDB → render). */
export async function resolvePoseThumb(pose: PoseLike): Promise<string | null> {
  const id = poseKey(pose);
  if (!id) return null;
  if (memoryCache.has(id)) return memoryCache.get(id)!;
  return renderOne(pose);
}

/** Warm memory cache from IndexedDB for known ids (no WebGL yet). */
export async function warmPoseThumbCache(ids: string[]): Promise<void> {
  await Promise.all(
    ids.slice(0, 64).map(async (id) => {
      if (!id || memoryCache.has(id)) return;
      const cached = await idbGet(id);
      if (cached) {
        memoryCache.set(id, cached);
        notify(id, cached);
      }
    })
  );
}

export function pausePoseThumbGeneration() {
  genPaused = true;
}

export function resumePoseThumbGeneration() {
  genPaused = false;
  void pumpQueue();
}
