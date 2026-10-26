/**
 * Prop / object library thumbnails: offscreen GLB capture, IndexedDB cache,
 * optional static files under /models/characters/thumbs/{id}.{webp|png|jpg}.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAssetPath } from '../../../utils/pathUtils';
import { applyLod0Only } from './modelLod';
import { stripModelTextures } from './stripModelTextures';

const THUMB_SIZE = 160;
const DB_NAME = 'yingge-object-thumbs';
const DB_STORE = 'thumbs';
const DB_VERSION = 2; // bump: built-in models render without textures
const STATIC_EXT = ['.webp', '.png', '.jpg'];

type Listener = (id: string, url: string | null) => void;

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const listeners = new Set<Listener>();
let staticFailStreak = 0;
const STATIC_SKIP_AFTER = 3;
let genQueue: string[] = [];
let genRunning = false;
let genPaused = false;
let renderChain: Promise<unknown> = Promise.resolve();

type SharedRenderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  holder: THREE.Group;
};

let shared: SharedRenderer | null = null;

function withRendererLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderChain.then(fn, fn);
  renderChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
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
    /* ignore */
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
    const url = getAssetPath(`/models/characters/thumbs/${id}${ext}`);
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
      /* ignore */
    }
  });
}

export function subscribeObjectThumbs(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCachedObjectThumb(id: string): string | null {
  return memoryCache.get(id) || null;
}

function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const dist = maxDim * 1.65;
  camera.position.set(center.x + dist * 0.45, center.y + dist * 0.35, center.z + dist);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
  camera.lookAt(center.x, center.y + size.y * 0.05, center.z);
  camera.updateProjectionMatrix();
}

function clearHolder(holder: THREE.Group) {
  while (holder.children.length) {
    const child = holder.children[0];
    holder.remove(child);
    child.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}

function getShared(): SharedRenderer {
  if (shared) return shared;
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
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-2, 1.5, -1);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  const holder = new THREE.Group();
  scene.add(holder);

  shared = { renderer, scene, camera, holder };
  return shared;
}

async function captureObject(id: string): Promise<string | null> {
  const path = getAssetPath(`/models/characters/${id}.glb`);
  const loader = new GLTFLoader();
  let gltf: Awaited<ReturnType<typeof loader.loadAsync>>;
  try {
    gltf = await loader.loadAsync(path);
  } catch (e) {
    console.warn('[objectThumb] load failed', id, e);
    return null;
  }

  return withRendererLock(async () => {
    const { renderer, scene, camera, holder } = getShared();
    clearHolder(holder);
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
    holder.add(root);
    root.updateMatrixWorld(true);
    frameCamera(camera, root);
    await new Promise((res) => requestAnimationFrame(() => res(undefined)));
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.82);
    clearHolder(holder);
    return dataUrl;
  });
}

async function renderOne(id: string): Promise<string | null> {
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
      const dataUrl = await captureObject(id);
      if (dataUrl) {
        memoryCache.set(id, dataUrl);
        void idbSet(id, dataUrl);
        notify(id, dataUrl);
      } else {
        notify(id, null);
      }
      return dataUrl;
    } catch (e) {
      console.warn('[objectThumb] render failed', id, e);
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
      const id = genQueue.shift()!;
      if (!id || memoryCache.has(id)) continue;
      await renderOne(id);
      await new Promise((res) => setTimeout(res, 0));
    }
  } finally {
    genRunning = false;
  }
}

export function enqueueObjectThumbGeneration(ids: string[]) {
  const pending = ids.filter((id) => id && !memoryCache.has(id) && !inflight.has(id));
  const seen = new Set(pending);
  genQueue = [...pending, ...genQueue.filter((id) => !seen.has(id))];
  void pumpQueue();
}

export async function resolveObjectThumb(id: string): Promise<string | null> {
  if (!id) return null;
  if (memoryCache.has(id)) return memoryCache.get(id)!;
  return renderOne(id);
}

export async function warmObjectThumbCache(ids: string[]): Promise<void> {
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

export function pauseObjectThumbGeneration() {
  genPaused = true;
}

export function resumeObjectThumbGeneration() {
  genPaused = false;
  void pumpQueue();
}
