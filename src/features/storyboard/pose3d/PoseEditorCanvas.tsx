import React, { useEffect, useRef, useImperativeHandle, forwardRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { CANONICAL_BONE_ORDER, CANONICAL_BONE_PARENT, buildBoneNameMapping, normalizeBoneNamesOnImport, resolveModelBoneNameForPose, resolveRootBoneName } from '../../../constants/skeletonSpec';
import { CCDIKSolver, type IKS } from '../../../utils/CCDIKSolver';
import { getAssetPath } from '../../../utils/pathUtils';
import { createId } from '../../../utils/id';
import { applyLod0Only } from './modelLod';
import { stripModelTextures } from './stripModelTextures';

interface PoseEditorCanvasProps {
  shotId: string;
  modelPath?: string;
}

export interface Character {
  id: string;
  /** 角色根节点（带绑定时为模型根，不包 Group） */
  group: THREE.Object3D;
  transformControls: TransformControls;
  modelPath: string;
  /** 加载时的扩展名，用于判断 FBX（path 可能为 blob URL 无法用 endsWith 判断） */
  modelExt?: 'fbx' | 'glb' | 'gltf';
  name: string;
  skeleton?: THREE.Skeleton;
  /** 该角色下所有 SkinnedMesh 的 skeleton（多 mesh 时需全部归一化并同步根骨骼） */
  skeletons?: THREE.Skeleton[];
  boneMap?: Map<string, THREE.Bone>;
  /** 模型骨骼名 → 标准名（Humanoid/Mixamo 兼容），用于 applyPose 按标准名查骨 */
  boneNameToStandard?: Map<string, string>;
  rootBone?: THREE.Bone; // 根骨骼，用于控制角色移动
  /** CCD IK：手腕/脚踝目标（可拖动），拖拽时驱动整条链；缺链时对应项无 */
  ikTargets?: Partial<{ leftHand: THREE.Mesh; rightHand: THREE.Mesh; leftFoot: THREE.Mesh; rightFoot: THREE.Mesh }>;
  /** CCD IK 求解器，拖拽 target 时在渲染循环中 update */
  ikSolver?: CCDIKSolver;
  /** 根骨骼/Hips 处控制点（绿色三角形），点击可整体移动；无完整 IK 链时也显示 */
  rootTarget?: THREE.Mesh;
  /** 头部圆环控制器，点击后附着 Head 骨骼做旋转 */
  headRing?: THREE.Mesh;
  /** 肘、膝、肩、髋微调球，拖拽时旋转对应骨骼 */
  jointHandles?: THREE.Mesh[];
}

export interface SceneObject {
  id: string;
  group: THREE.Object3D;
  name: string;
  transformControls: TransformControls;
}

export interface PoseEditorCanvasRef {
  renderToImage: (options?: { includeGround?: boolean }) => Promise<string>;
  getCharacters: () => Character[];
  addCharacter: (modelPath: string, filename?: string) => string;
  removeCharacter: (id: string) => void;
  getObjects: () => SceneObject[];
  addObject: (modelPath: string, objectId?: string) => string;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  getSelectedObjectId: () => string | null;
  /** 将场景中指定物体（如虚拟摄像机）的位姿设为当前视图视角 */
  setViewFromObjectId: (objectId: string) => void;
  /** 将本地摄像机位置预设应用到指定物体（如 virtual camera） */
  applyCameraPositionPreset: (objectId: string, preset: { position: [number, number, number]; target: [number, number, number] }) => void;
  /** 将视角摄像机设为指定位置与目标（不依赖场景物体） */
  setViewerCamera: (position: [number, number, number], target: [number, number, number]) => void;
  applyPose: (characterId: string, poseData: any) => { applied: boolean; messageKey?: string };
  selectCharacter: (id: string | null) => void;
  getSelectedCharacterId: () => string | null;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  getTransformMode: () => 'translate' | 'rotate' | 'scale' | null;
  /** 当前选中角色 Hips 根骨缩放值，无选中时返回 null */
  getScaleValue: () => number | null;
  /** 通过数值设置当前选中角色 Hips 根骨缩放 (0.01～100) */
  setScaleByValue: (scale: number) => void;
  /** 将当前选中角色的 Hips 根骨移动到世界原点 (0,0,0) */
  moveSelectedToOrigin: () => void;
  setModelTint: (color: string, strength: number) => void;
}

export const POSE_EDITOR_APPLY_SCALE = 'pose-editor-apply-scale';
export const POSE_EDITOR_SCALE_APPLIED = 'pose-editor-scale-applied';

// 确保 TransformControls 在场景中（新版 three 可能用 _root，旧版直接是 Object3D）
function addTransformControlsToScene(scene: THREE.Scene, controls: TransformControls) {
  const anyControls = controls as any;
  const obj = anyControls._root ?? controls;
  if (obj instanceof THREE.Object3D && !scene.children.includes(obj)) {
    scene.add(obj);
  }
}

/** 控制器尺寸随模型包围盒自动匹配：取模型最大边长的约 3%，并限制在合理范围内 */
const IK_TARGET_SIZE_MIN = 0.015;
const IK_TARGET_SIZE_MAX = 0.08;
const IK_TARGET_SIZE_RATIO = 0.03;
const _worldPos = new THREE.Vector3();

/** 纯色、不受光照：未选中半透明，选中接近不透明 */
function makeGizmoMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function setGizmoHighlight(mesh: THREE.Mesh | undefined | null, active: boolean) {
  if (!mesh) return;
  const mat = mesh.material;
  if (!(mat instanceof THREE.MeshBasicMaterial)) return;
  mat.transparent = true;
  mat.opacity = active ? 1 : 0.35;
  mat.needsUpdate = true;
}

/** 方块 IK 目标：移动挂在目标上，旋转挂在对应手/脚骨骼上 */
function applyModeToIkAttachment(
  controls: TransformControls,
  mode: 'translate' | 'rotate' | 'scale',
  characters: Map<string, Character>
) {
  const obj = controls.object;
  if (!obj) {
    controls.setMode(mode);
    return;
  }

  for (const char of characters.values()) {
    const targets = char.ikTargets
      ? (Object.values(char.ikTargets).filter(Boolean) as THREE.Mesh[])
      : [];
    const asIkMesh = targets.find((t) => t === obj);
    const linkedTarget = targets.find((t) => t.userData.effectorBone === obj);

    if (asIkMesh || linkedTarget) {
      const target = asIkMesh ?? linkedTarget!;
      const effector = target.userData.effectorBone as THREE.Bone | undefined;
      if ((mode === 'rotate' || mode === 'scale') && effector) {
        controls.attach(effector);
        controls.setMode(mode === 'scale' ? 'rotate' : mode);
        controls.setSpace('local');
        return;
      }
      controls.attach(target);
      controls.setMode('translate');
      controls.setSpace('world');
      return;
    }
  }

  controls.setMode(mode);
  if (mode === 'rotate' || mode === 'scale') {
    controls.setSpace('local');
  } else if (obj instanceof THREE.Bone) {
    controls.setSpace('world');
  }
}

/** 从 boneMap 中按标准名或常见变体取骨骼 */
function getBone(boneMap: Map<string, THREE.Bone>, ...names: string[]): THREE.Bone | undefined {
  for (const n of names) {
    const b = boneMap.get(n);
    if (b) return b;
  }
  return undefined;
}

/** 为角色创建 IK 目标（手腕/脚踝）并构建 CCD IK 链；目标明显可见（大、不透明、优先绘制） */
function createIKForCharacter(
  group: THREE.Object3D,
  boneMap: Map<string, THREE.Bone>,
  rootBone?: THREE.Bone
): { ikTargets: Character['ikTargets']; ikSolver: CCDIKSolver; rootTarget?: THREE.Mesh; headRing?: THREE.Mesh; jointHandles: THREE.Mesh[] } | null {
  const headBone = getBone(boneMap, 'Head');
  const leftHand = getBone(boneMap, 'LeftHand', 'LeftWrist');
  const leftForeArm = getBone(boneMap, 'LeftForeArm', 'LeftLowerArm');
  const leftArm = getBone(boneMap, 'LeftArm', 'LeftUpperArm');
  const rightHand = getBone(boneMap, 'RightHand', 'RightWrist');
  const rightForeArm = getBone(boneMap, 'RightForeArm', 'RightLowerArm');
  const rightArm = getBone(boneMap, 'RightArm', 'RightUpperArm');
  const leftFoot = getBone(boneMap, 'LeftFoot', 'LeftAnkle');
  const leftLeg = getBone(boneMap, 'LeftLeg', 'LeftLowerLeg');
  const leftUpLeg = getBone(boneMap, 'LeftUpLeg', 'LeftUpperLeg');
  const rightFoot = getBone(boneMap, 'RightFoot', 'RightAnkle');
  const rightLeg = getBone(boneMap, 'RightLeg', 'RightLowerLeg');
  const rightUpLeg = getBone(boneMap, 'RightUpLeg', 'RightUpperLeg');

  const iks: IKS[] = [];
  const ikTargets: NonNullable<Character['ikTargets']> = {};

  if (rootBone) rootBone.updateMatrixWorld(true);

  // 根据模型包围盒自动匹配控制器大小
  let ikTargetSize = IK_TARGET_SIZE_MIN;
  if (rootBone) {
    const box = new THREE.Box3().setFromObject(group);
    const dim = new THREE.Vector3();
    box.getSize(dim);
    const maxDim = Math.max(dim.x, dim.y, dim.z, 0.01);
    ikTargetSize = Math.min(IK_TARGET_SIZE_MAX, Math.max(IK_TARGET_SIZE_MIN, maxDim * IK_TARGET_SIZE_RATIO));
  }

  function createTarget(name: string, effector: THREE.Bone, isRoot = false): THREE.Mesh {
    const size = ikTargetSize * 2;
    const geometry = isRoot
      ? new THREE.ConeGeometry(size * 0.8, size * 1.6, 3)
      : new THREE.BoxGeometry(size, size, size);
    const mesh = new THREE.Mesh(
      geometry,
      makeGizmoMaterial(isRoot ? 0x00aa44 : 0x0088ff)
    );
    mesh.userData.gizmo = true;
    mesh.userData.isIkTarget = !isRoot;
    mesh.userData.effectorBone = effector;
    mesh.name = name;
    mesh.renderOrder = 100;
    mesh.visible = true;
    if (isRoot) mesh.rotateX(-Math.PI / 2);
    effector.getWorldPosition(_worldPos);
    group.worldToLocal(mesh.position.copy(_worldPos));
    group.add(mesh);
    return mesh;
  }

  if (leftHand && leftForeArm && leftArm) {
    const target = createTarget('leftHandTarget', leftHand);
    ikTargets.leftHand = target;
    iks.push({
      target,
      effector: leftHand,
      links: [{ enabled: true, index: leftForeArm }, { enabled: true, index: leftArm }],
      iteration: 10,
      minAngle: 0,
      maxAngle: 1,
    });
  }
  if (rightHand && rightForeArm && rightArm) {
    const target = createTarget('rightHandTarget', rightHand);
    ikTargets.rightHand = target;
    iks.push({
      target,
      effector: rightHand,
      links: [{ enabled: true, index: rightForeArm }, { enabled: true, index: rightArm }],
      iteration: 10,
      minAngle: 0,
      maxAngle: 1,
    });
  }
  if (leftFoot && leftLeg && leftUpLeg) {
    const target = createTarget('leftFootTarget', leftFoot);
    ikTargets.leftFoot = target;
    iks.push({
      target,
      effector: leftFoot,
      links: [{ enabled: true, index: leftLeg }, { enabled: true, index: leftUpLeg }],
      iteration: 10,
      minAngle: 0,
      maxAngle: 1,
    });
  }
  if (rightFoot && rightLeg && rightUpLeg) {
    const target = createTarget('rightFootTarget', rightFoot);
    ikTargets.rightFoot = target;
    iks.push({
      target,
      effector: rightFoot,
      links: [{ enabled: true, index: rightLeg }, { enabled: true, index: rightUpLeg }],
      iteration: 10,
      minAngle: 0,
      maxAngle: 1,
    });
  }

  let rootTarget: THREE.Mesh | undefined;
  if (rootBone) {
    rootTarget = createTarget('rootTarget', rootBone, true);
  }

  let headRing: THREE.Mesh | undefined;
  if (headBone) {
    const ringRadius = ikTargetSize * 7.5;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, ringRadius * 0.08, 8, 32),
      makeGizmoMaterial(0xffaa00)
    );
    ring.userData.gizmo = true;
    ring.name = 'headRingTarget';
    ring.renderOrder = 100;
    ring.visible = true;
    headBone.getWorldPosition(_worldPos);
    group.worldToLocal(ring.position.copy(_worldPos));
    group.add(ring);
    headRing = ring;
  }

  const jointHandles: THREE.Mesh[] = [];
  const jointBones: Array<[string, THREE.Bone | undefined, number]> = [
    ['LeftArm', leftArm, 0x44ddff],
    ['RightArm', rightArm, 0x44ddff],
    ['LeftForeArm', leftForeArm, 0xff8800],
    ['RightForeArm', rightForeArm, 0xff8800],
    ['LeftUpLeg', leftUpLeg, 0xaa66ff],
    ['RightUpLeg', rightUpLeg, 0xaa66ff],
    ['LeftLeg', leftLeg, 0xffee44],
    ['RightLeg', rightLeg, 0xffee44],
  ];
  for (const [label, bone, color] of jointBones) {
    if (!bone) continue;
    bone.userData.jointFineTune = true;
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(ikTargetSize * 0.85, 12, 12),
      makeGizmoMaterial(color)
    );
    handle.name = `joint:${label}`;
    handle.userData.gizmo = true;
    handle.userData.jointBone = bone;
    handle.renderOrder = 110;
    bone.getWorldPosition(_worldPos);
    group.worldToLocal(handle.position.copy(_worldPos));
    group.add(handle);
    jointHandles.push(handle);
  }

  if (iks.length === 0 && !rootTarget && !headRing && jointHandles.length === 0) return null;
  const chainCount = iks.length;
  if (chainCount > 0 || rootTarget || headRing) {
    console.log(`✓ IK 控制点: ${rootTarget ? 'Hips(绿三角) ' : ''}${headRing ? '头环(橙) ' : ''}${chainCount ? `${chainCount} 条链（蓝）` : ''}`);
  }
  return { ikTargets, ikSolver: new CCDIKSolver(iks), rootTarget, headRing, jointHandles };
}

/**
 * 按 adult-male.glb 的父子关系重挂骨骼，且不改变任何骨骼的世界位置（重挂后重算 local 使 world 不变）
 * @param alreadyReparented 若传入，则跳过已在此 Set 中的骨骼（多 skeleton 共享同一批 bone 时只 reparent 一次）
 */
function applyCanonicalBoneHierarchyPreservingWorld(
  bones: THREE.Bone[],
  alreadyReparented?: Set<THREE.Bone>
): void {
  const byName = new Map<string, THREE.Bone>();
  bones.forEach((b) => byName.set(b.name, b));
  const oldWorld = new THREE.Matrix4();
  const invParentWorld = new THREE.Matrix4();
  for (const childName of CANONICAL_BONE_ORDER) {
    const parentName = CANONICAL_BONE_PARENT[childName];
    const child = byName.get(childName);
    if (!child) continue;
    if (alreadyReparented?.has(child)) continue;
    const wantParent = parentName ? byName.get(parentName) : null;
    const currentParent = child.parent as THREE.Bone | null;
    if (wantParent === null) continue;
    if (!wantParent || wantParent === currentParent) {
      if (alreadyReparented) alreadyReparented.add(child);
      continue;
    }
    child.updateMatrixWorld(true);
    oldWorld.copy(child.matrixWorld);
    child.removeFromParent();
    wantParent.add(child);
    wantParent.updateMatrixWorld(true);
    invParentWorld.copy(wantParent.matrixWorld).invert();
    child.matrix.copy(invParentWorld).multiply(oldWorld);
    child.matrix.decompose(child.position, child.quaternion, child.scale);
    child.updateMatrix();
    alreadyReparented?.add(child);
  }
}

export const PoseEditorCanvas = forwardRef<PoseEditorCanvasRef, PoseEditorCanvasProps>(
  ({ shotId }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const charactersRef = useRef<Map<string, Character>>(new Map());
    const objectsRef = useRef<Map<string, SceneObject>>(new Map());
    const selectedCharacterIdRef = useRef<string | null>(null);
    const selectedObjectIdRef = useRef<string | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const transformControlsRef = useRef<TransformControls | null>(null);
    const gridHelperRef = useRef<THREE.Object3D | null>(null);
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
    const cameraModelIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
      fetch(getAssetPath('/models/cameras/cameras.json'))
        .then((res) => res.ok ? res.json() : {})
        .then((data) => {
          cameraModelIdsRef.current = new Set(Object.keys(data || {}));
        })
        .catch(() => {});
    }, []);

    // UI 设置：是否显示安全框
    const showSafeFrame = useUIStore((state) => state.showSafeFrame);
    const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setContainerSize({ width, height });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const getShot = useProjectStore((state) => state.getShot);
    const project = useProjectStore((state) => state.project);
    const shot = getShot(shotId);

    // 避免相机参数更新（framing/cameraAngle）导致整个 three 场景重建而清空角色/姿态
    const shotRef = useRef(shot);
    useEffect(() => {
      shotRef.current = shot;
    }, [shot]);

    function applyCameraForShot(camera: THREE.PerspectiveCamera, controls: OrbitControls, s: any) {
      if (!s) return;
      const framingDistances: Record<string, number> = {
        CU: 2,
        MS: 4,
        WS: 8,
        ECU: 1,
        ELS: 12,
      };
      const distance = framingDistances[s.framing] || 4;
      camera.position.set(0, 1.6, distance);
      camera.lookAt(0, 1.6, 0);

      if (s.cameraAngle === 'low') {
        camera.position.y = 1.2;
      } else if (s.cameraAngle === 'high') {
        camera.position.y = 2.0;
      }

      controls.target.set(0, 1.6, 0);
      controls.update();
      camera.updateProjectionMatrix();
    }

    const doSelectObject = (id: string | null) => {
      objectsRef.current.forEach((o) => {
        o.transformControls.detach();
        (o.transformControls as any).visible = false;
      });
      if (id) {
        charactersRef.current.forEach((c) => { (c.transformControls as any).visible = false; });
        selectedCharacterIdRef.current = null;
        if (transformControlsRef.current) {
          transformControlsRef.current.detach();
          transformControlsRef.current = null;
        }
      }
      if (id && sceneRef.current) {
        const obj = objectsRef.current.get(id);
        if (obj) {
          addTransformControlsToScene(sceneRef.current, obj.transformControls);
          obj.transformControls.attach(obj.group);
          obj.transformControls.setMode('translate');
          obj.transformControls.setSpace('world');
          obj.transformControls.enabled = true;
          (obj.transformControls as any).visible = true;
          transformControlsRef.current = obj.transformControls;
          selectedObjectIdRef.current = id;
        }
      } else {
        selectedObjectIdRef.current = null;
      }
    };

    // 选中逻辑：有根骨骼时附加到根骨骼（必须为骷髅层级根），无骨骼时附加到 group
    const doSelectCharacter = (id: string | null) => {
      doSelectObject(null);
      charactersRef.current.forEach((char) => {
        if (char.transformControls) char.transformControls.detach();
      });
      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
        transformControlsRef.current = null;
      }
      if (id && sceneRef.current) {
        const character = charactersRef.current.get(id);
        if (character) {
          addTransformControlsToScene(sceneRef.current, character.transformControls);
          // 只控制 Hips 根骨骼才能控制角色，不绑 group
          const targetObject = character.rootBone ?? character.group;
          if (character.transformControls.object) character.transformControls.detach();
          if (character.rootBone) character.rootBone.updateMatrixWorld(true);
          character.group.updateMatrixWorld(true);
          character.transformControls.detach();
          character.transformControls.attach(targetObject);
          character.transformControls.setMode('translate');
          character.transformControls.setSpace('world');
          character.transformControls.enabled = true;
          (character.transformControls as any).visible = true;
          transformControlsRef.current = character.transformControls;
          selectedCharacterIdRef.current = id;
          if (targetObject) targetObject.updateMatrixWorld(true);
          const tcAny = character.transformControls as any;
          if (typeof tcAny?.updateMatrixWorld === 'function') tcAny.updateMatrixWorld(true);
          if (character.transformControls.object) character.transformControls.object.updateMatrixWorld(true);
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
          console.log('✓ 选中角色:', id, '控制轴已附加到', character.rootBone ? `根骨骼(${character.rootBone.name})` : 'group');
        }
      } else {
        charactersRef.current.forEach((char) => {
          (char.transformControls as any).visible = false;
        });
        selectedCharacterIdRef.current = null;
      }
    };

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      renderToImage: async (options) => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) {
          return '';
        }

        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;

        if (controlsRef.current) {
          controlsRef.current.update();
        }

        const hidden: THREE.Object3D[] = [];
        const hide = (obj?: THREE.Object3D | null) => {
          if (obj && obj.visible) {
            obj.visible = false;
            hidden.push(obj);
          }
        };
        if (!options?.includeGround) hide(gridHelperRef.current);
        charactersRef.current.forEach((char) => {
          hide(char.rootTarget);
          hide(char.headRing);
          char.jointHandles?.forEach((handle) => hide(handle));
          if (char.ikTargets) {
            Object.values(char.ikTargets).forEach((target) => hide(target));
          }
          const controlsRoot = (char.transformControls as unknown as { _root?: THREE.Object3D })._root
            ?? (char.transformControls as unknown as THREE.Object3D);
          hide(controlsRoot);
        });
        const previousBackground = scene.background;
        scene.background = null;
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, camera);

        const canvas = renderer.domElement;
        const { width, height } = canvas;

        // 解析项目的画幅比例字符串（例如 "16:9"、"2.39:1"）
        const ratioString = project?.aspectRatio || '16:9';
        const [wStr, hStr] = ratioString.split(':');
        const rw = parseFloat(wStr || '16');
        const rh = parseFloat(hStr || '9');
        const targetAspect = rh === 0 ? 16 / 9 : rw / rh;

        const canvasAspect = width / height;

        // 计算需要从原始画布中裁剪的区域（保证与安全框一致）
        let sx = 0;
        let sy = 0;
        let sWidth = width;
        let sHeight = height;

        if (canvasAspect > targetAspect) {
          // 画布更宽，以高度为准，左右裁掉
          sHeight = height;
          sWidth = height * targetAspect;
          sx = (width - sWidth) / 2;
          sy = 0;
        } else {
          // 画布更高，以宽度为准，上下裁掉
          sWidth = width;
          sHeight = width / targetAspect;
          sx = 0;
          sy = (height - sHeight) / 2;
        }

        // 使用离屏 canvas 生成裁剪后的图片
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.round(sWidth);
        offscreen.height = Math.round(sHeight);
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
          scene.background = previousBackground;
          renderer.setClearColor(0xf0f0f0, 1);
          hidden.forEach((obj) => {
            obj.visible = true;
          });
          return canvas.toDataURL('image/png');
        }

        ctx.drawImage(
          canvas,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          offscreen.width,
          offscreen.height
        );

        const image = offscreen.toDataURL('image/png');
        scene.background = previousBackground;
        renderer.setClearColor(0xf0f0f0, 1);
        hidden.forEach((obj) => {
          obj.visible = true;
        });
        renderer.render(scene, camera);
        return image;
      },
      getCharacters: () => Array.from(charactersRef.current.values()),
      addCharacter: (modelPath: string, filename?: string) => {
        return loadCharacter(modelPath, filename);
      },
      getObjects: () => Array.from(objectsRef.current.values()),
      addObject: (modelPath: string, objectId?: string) => {
        return loadObject(modelPath, objectId);
      },
      removeObject: (id: string) => {
        const obj = objectsRef.current.get(id);
        if (obj && sceneRef.current) {
          if (selectedObjectIdRef.current === id) {
            obj.transformControls.detach();
            transformControlsRef.current = null;
            selectedObjectIdRef.current = null;
          }
          const tcAny = obj.transformControls as any;
          const tcRoot = tcAny._root ?? obj.transformControls;
          if (tcRoot instanceof THREE.Object3D) sceneRef.current.remove(tcRoot);
          obj.transformControls.dispose();
          sceneRef.current.remove(obj.group);
          obj.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
              else child.material.dispose();
            }
          });
          objectsRef.current.delete(id);
        }
      },
      selectObject: (id: string | null) => doSelectObject(id),
      getSelectedObjectId: () => selectedObjectIdRef.current,
      setViewFromObjectId: (objectId: string) => {
        const obj = objectsRef.current.get(objectId);
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!obj || !camera || !controls) return;
        const cameraIds = cameraModelIdsRef.current;
        objectsRef.current.forEach((o) => {
          if (cameraIds.has(o.id)) o.group.visible = false;
        });
        obj.group.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        obj.group.getWorldPosition(pos);
        obj.group.getWorldQuaternion(quat);
        camera.position.copy(pos);
        camera.setRotationFromQuaternion(quat);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
        controls.target.copy(pos.clone().add(forward.multiplyScalar(2)));
        controls.update();
      },
      applyCameraPositionPreset: (objectId: string, preset: { position: [number, number, number]; target: [number, number, number] }) => {
        const obj = objectsRef.current.get(objectId);
        if (!obj) return;
        obj.group.position.set(preset.position[0], preset.position[1], preset.position[2]);
        obj.group.lookAt(preset.target[0], preset.target[1], preset.target[2]);
        obj.group.updateMatrixWorld(true);
      },
      setViewerCamera: (position: [number, number, number], target: [number, number, number]) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        camera.position.set(position[0], position[1], position[2]);
        controls.target.set(target[0], target[1], target[2]);
        controls.update();
      },
      removeCharacter: (id: string) => {
        const character = charactersRef.current.get(id);
        if (character && sceneRef.current) {
          // 如果这是当前选中的角色，先取消选中
          if (selectedCharacterIdRef.current === id) {
            if (transformControlsRef.current) {
              transformControlsRef.current.detach();
            }
            selectedCharacterIdRef.current = null;
          }

          // 移除 TransformControls
          const anyControls = character.transformControls as any;
          const objToRemove = anyControls._root || character.transformControls;
          if (objToRemove instanceof THREE.Object3D) {
            sceneRef.current.remove(objToRemove);
          }
          character.transformControls.dispose();
          // 移除角色模型
          sceneRef.current.remove(character.group);
          character.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
          charactersRef.current.delete(id);
        }
      },
      applyPose: (characterId: string, poseData: any) => {
        const character = charactersRef.current.get(characterId);
        if (!character || !poseData) {
          console.error('角色或姿态数据不存在', { characterId, poseData });
          return { applied: false, messageKey: 'pose3d.noPoseData' };
        }

        const group = character.group;
        console.log('应用姿态到角色:', characterId, poseData);

        // 如果没有骨骼映射，先尝试从模型构建
        if (!character.boneMap || !character.skeleton) {
          let skeleton: THREE.Skeleton | null = null;
          const boneMap = new Map<string, THREE.Bone>();

          // 从 SkinnedMesh 获取骨骼系统
          group.traverse((child) => {
            if (child instanceof THREE.SkinnedMesh && child.skeleton) {
              skeleton = child.skeleton;
              child.skeleton.bones.forEach((bone) => {
                boneMap.set(bone.name, bone);
              });
            }
          });

          if (skeleton && boneMap.size > 0) {
            character.skeleton = skeleton;
            character.boneMap = boneMap;
            character.boneNameToStandard = buildBoneNameMapping(Array.from(boneMap.keys()));
            console.log(`✓ 构建骨骼映射，找到 ${boneMap.size} 个骨骼`);
            console.log('✓ 骨骼名称:', Array.from(boneMap.keys()).join(', '));
          } else {
            // 无骨骼模型：标记并提示，不重复尝试
            character.skeleton = undefined;
            character.boneMap = undefined;
            character.boneNameToStandard = undefined;
            console.warn('✗ 该模型无骨骼，无法应用姿势');
            return { applied: false, messageKey: 'pose3d.noSkeleton' };
          }
        }

        // 姿态数据中无骨骼信息（body 或 hand 至少需其一）
        if ((!poseData.state?.skeleton && !poseData.state?.handSkeleton) || !character.boneMap) {
          return { applied: false, messageKey: 'pose3d.noPoseData' };
        }

        const applyBoneData = (
          boneData: { rotation?: { x?: number; y?: number; z?: number }; position?: { x?: number; y?: number; z?: number }; quaternion?: number[] },
          bone: THREE.Bone,
          useYXZ: boolean
        ) => {
          bone.rotation.order = useYXZ ? 'YXZ' : 'XYZ';
          if (boneData.quaternion != null && Array.isArray(boneData.quaternion) && boneData.quaternion.length >= 4) {
            bone.setRotationFromQuaternion(new THREE.Quaternion(
              boneData.quaternion[0] ?? 0, boneData.quaternion[1] ?? 0,
              boneData.quaternion[2] ?? 0, boneData.quaternion[3] ?? 1
            ));
          } else if (boneData.rotation != null) {
            bone.rotation.set(
              Number(boneData.rotation.x) || 0,
              Number(boneData.rotation.y) || 0,
              Number(boneData.rotation.z) || 0
            );
          }
          if (boneData.position != null) {
            bone.position.set(
              Number(boneData.position.x) ?? 0,
              Number(boneData.position.y) ?? 0,
              Number(boneData.position.z) ?? 0
            );
          }
        };

        // 仅通过骨骼控制姿态：对所有 skeleton 的骨骼按标准名写入 rotation/position，再统一 skeleton.update()
        {
          const skeletonData = poseData.state.skeleton ?? {};
          const handSkeletonData = poseData.state.handSkeleton ?? {};
          const mapping = character.boneNameToStandard;
          const boneNamesSet = new Set(character.boneMap!.keys());
          const poseBoneNames = Object.keys(skeletonData);
          const handBoneNames = Object.keys(handSkeletonData);
          const skeletonsToUpdate = character.skeletons?.length ? character.skeletons : (character.skeleton ? [character.skeleton] : []);
          const hasMixamorig = Array.from(boneNamesSet).some((n) => n.toLowerCase().includes('mixamorig'));
          const useYXZ = character.modelExt === 'fbx' || hasMixamorig;

          let bonesFound = 0;
          poseBoneNames.forEach((standardName) => {
            const boneData = skeletonData[standardName];
            if (!boneData) return;
            let appliedThisName = false;
            for (const skel of skeletonsToUpdate) {
              const bone = skel.bones.find((b) => b.name === standardName) ?? null;
              if (!bone) {
                if (skel === character.skeleton) console.warn(`⚠ 未匹配骨骼: ${standardName}`);
                continue;
              }
              appliedThisName = true;
              applyBoneData(boneData, bone, useYXZ);
            }
            if (appliedThisName) bonesFound++;
          });

          handBoneNames.forEach((standardName) => {
            const boneData = handSkeletonData[standardName];
            if (!boneData) return;
            for (const skel of skeletonsToUpdate) {
              const bone = skel.bones.find((b) => b.name === standardName) ?? null;
              if (!bone) continue;
              applyBoneData(boneData, bone, useYXZ);
              bonesFound++;
              break;
            }
          });

          if (poseBoneNames.length > 0 || handBoneNames.length > 0) {
            console.log(`✓ 姿态应用: 身体 ${Object.keys(skeletonData).length} 骨，手部 ${handBoneNames.length} 骨，共匹配 ${bonesFound} 个`);
          }

          // 按层级更新：根骨骼更新整棵骨骼树，再对「所有」skeleton 调用 update
          if (character.rootBone) {
            character.rootBone.updateMatrix();
            character.rootBone.updateMatrixWorld(true);
          }
          for (const skel of skeletonsToUpdate) {
            skel.bones.forEach((bone) => bone.updateMatrixWorld(true));
            skel.update();
          }
          group.traverse((child) => {
            if (child instanceof THREE.SkinnedMesh && child.skeleton) {
              child.skeleton.update();
            }
          });
          group.updateMatrixWorld(true);
          return { applied: true };
        }
      },
      selectCharacter: (id: string | null) => {
        doSelectCharacter(id);
      },
      getSelectedCharacterId: () => selectedCharacterIdRef.current,
      setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => {
        const activeControls = transformControlsRef.current;
        if (activeControls && (activeControls as any).visible) {
          applyModeToIkAttachment(activeControls, mode, charactersRef.current);
          console.log(`切换到${mode === 'translate' ? '平移' : mode === 'rotate' ? '旋转' : '缩放'}模式`);
        }
      },
      getTransformMode: () => {
        const activeControls = transformControlsRef.current;
        if (activeControls && (activeControls as any).visible) {
          return activeControls.getMode() as 'translate' | 'rotate' | 'scale';
        }
        return null;
      },
      getScaleValue: () => {
        let id = selectedCharacterIdRef.current;
        if (id == null && charactersRef.current.size === 1) {
          id = charactersRef.current.keys().next().value ?? null;
        }
        if (id == null) return null;
        const character = charactersRef.current.get(id);
        if (!character?.rootBone) return null;
        return character.rootBone.scale.x;
      },
      setScaleByValue: (scale: number) => {
        let id = selectedCharacterIdRef.current;
        if (id == null && charactersRef.current.size === 1) {
          id = charactersRef.current.keys().next().value ?? null;
        }
        if (id == null || !sceneRef.current) return;
        const character = charactersRef.current.get(id);
        if (!character) return;
        const s = Math.max(0.01, Math.min(100, Number(scale)));
        const list = character.skeletons ?? (character.skeleton ? [character.skeleton] : []);
        const scaledHips = new Set<THREE.Bone>();
        for (const skel of list) {
          const boneSet = new Set(skel.bones);
          const roots = skel.bones.filter((b) => !b.parent || !boneSet.has(b.parent as THREE.Bone));
          const hips = roots.find((b) => b.name === 'Hips');
          if (hips && !scaledHips.has(hips)) {
            hips.scale.set(s, s, s);
            hips.updateMatrix();
            scaledHips.add(hips);
          }
        }
        if (character.rootBone && !scaledHips.has(character.rootBone)) {
          character.rootBone.scale.set(s, s, s);
          character.rootBone.updateMatrix();
        }
        if (character.rootBone) {
          character.rootBone.updateMatrix();
          character.rootBone.updateMatrixWorld(true);
        }
        if (!character.rootBone && scaledHips.size === 0 && character.group) {
          character.group.scale.set(s, s, s);
        }
        character.group.updateMatrixWorld(true);
        list.forEach((sk) => sk.update());
        if (transformControlsRef.current === character.transformControls && character.rootBone) {
          character.transformControls.attach(character.rootBone);
        }
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      },
      moveSelectedToOrigin: () => {
        const id = selectedCharacterIdRef.current;
        if (id == null || !sceneRef.current) return;
        const character = charactersRef.current.get(id);
        if (!character?.rootBone) return;
        const rootBone = character.rootBone;
        const list = character.skeletons ?? (character.skeleton ? [character.skeleton] : []);
        const parent = rootBone.parent;
        if (parent) {
          parent.updateMatrixWorld(true);
          const invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
          const zero = new THREE.Vector3(0, 0, 0).applyMatrix4(invParent);
          rootBone.position.copy(zero);
        } else {
          rootBone.position.set(0, 0, 0);
        }
        rootBone.updateMatrixWorld(true);
        list.forEach((s) => s.update());
        character.group.updateMatrixWorld(true);
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      },
      setModelTint: (hex: string, strength: number) => {
        const selectedId = selectedCharacterIdRef.current;
        const selected = selectedId ? charactersRef.current.get(selectedId) : undefined;
        const targets = selected ? [selected] : Array.from(charactersRef.current.values());
        const tint = new THREE.Color(hex);
        const amount = Math.min(1, Math.max(0, strength));
        targets.forEach((char) => {
          char.group.traverse((child) => {
            if (!(child instanceof THREE.Mesh) || child.userData.gizmo) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat) => {
              if (!('color' in mat) || !(mat as THREE.MeshStandardMaterial).color?.isColor) return;
              const colored = mat as THREE.MeshStandardMaterial;
              const stored = mat.userData as { baseColor?: THREE.Color };
              if (!stored.baseColor) stored.baseColor = colored.color.clone();
              colored.color.copy(stored.baseColor).lerp(tint, amount);
            });
          });
        });
      },
    }));

    // 监听控制面板派发的数值缩放，执行一次缩放并回写输入框
    useEffect(() => {
      const handler = (e: Event) => {
        const scale = Number((e as CustomEvent).detail?.scale);
        if (Number.isNaN(scale) || !sceneRef.current) return;
        let id = selectedCharacterIdRef.current;
        if (id == null && charactersRef.current.size === 1) {
          id = charactersRef.current.keys().next().value ?? null;
        }
        if (id == null) return;
        const character = charactersRef.current.get(id);
        if (!character) return;
        const s = Math.max(0.01, Math.min(100, scale));
        const list = character.skeletons ?? (character.skeleton ? [character.skeleton] : []);
        const scaledHips = new Set<THREE.Bone>();
        for (const skel of list) {
          const boneSet = new Set(skel.bones);
          const roots = skel.bones.filter((b) => !b.parent || !boneSet.has(b.parent as THREE.Bone));
          const hips = roots.find((b) => b.name === 'Hips');
          if (hips && !scaledHips.has(hips)) {
            hips.scale.set(s, s, s);
            hips.updateMatrix();
            scaledHips.add(hips);
          }
        }
        if (character.rootBone && !scaledHips.has(character.rootBone)) {
          character.rootBone.scale.set(s, s, s);
          character.rootBone.updateMatrix();
        }
        if (character.rootBone) {
          character.rootBone.updateMatrix();
          character.rootBone.updateMatrixWorld(true);
        }
        if (!character.rootBone && scaledHips.size === 0 && character.group) {
          character.group.scale.set(s, s, s);
        }
        character.group.updateMatrixWorld(true);
        list.forEach((sk) => sk.update());
        if (transformControlsRef.current === character.transformControls && character.rootBone) {
          character.transformControls.attach(character.rootBone);
        }
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
        const appliedScale = character.rootBone?.scale.x ?? s;
        window.dispatchEvent(new CustomEvent(POSE_EDITOR_SCALE_APPLIED, { detail: { scale: appliedScale } }));
      };
      window.addEventListener(POSE_EDITOR_APPLY_SCALE, handler);
      return () => window.removeEventListener(POSE_EDITOR_APPLY_SCALE, handler);
    }, []);

    // 计算安全框样式（根据项目画幅比例），保证完整显示在容器内
    const safeFrameStyle = useMemo(() => {
      const ratioString = project?.aspectRatio || '16:9';
      const [wStr, hStr] = ratioString.split(':');
      const w = parseFloat(wStr || '16');
      const h = parseFloat(hStr || '9');
      const frameAspect = h === 0 ? 16 / 9 : w / h;

      const style: React.CSSProperties = {
        border: '3px solid rgba(200,200,200,0.9)', // 浅灰色安全框
        borderRadius: 4,
        backgroundColor: 'rgba(0,0,0,0.0)',
        boxSizing: 'border-box',
        flexShrink: 0,
        minWidth: 0,
        minHeight: 0,
      };

      if (containerSize && containerSize.width > 0 && containerSize.height > 0) {
        const cw = containerSize.width;
        const ch = containerSize.height;
        // 宽高都按「完全在容器内」计算：保持画幅比，整块安全框都在展示界面内
        // 先定高（受容器高与 容器宽/画幅比 约束），再由比例得宽，保证 width<=cw 且 height<=ch
        const frameH = Math.min(ch, cw / frameAspect);
        const frameW = frameAspect * frameH;
        style.width = frameW;
        style.height = frameH;
        style.maxWidth = '100%';
        style.maxHeight = '100%';
      } else {
        // 未测量到容器时使用百分比 + 约束，尽量完整显示
        style.maxWidth = '100%';
        style.maxHeight = '100%';
        (style as any).aspectRatio = `${w} / ${h}`;
        if (frameAspect < 1) {
          style.height = '100%';
          style.width = 'auto';
        } else {
          style.width = '100%';
          style.height = 'auto';
        }
      }

      return style;
    }, [project?.aspectRatio, containerSize]);

    // 加载角色模型（支持 .glb / .gltf / .fbx，filename 用于 blob URL 时提供扩展名）
    const loadCharacter = (path: string, filename?: string): string => {
      if (!sceneRef.current || !rendererRef.current || !cameraRef.current) {
        return '';
      }

      const id = createId();
      const ext = (filename || path).toLowerCase().match(/\.(fbx|glb|gltf)$/)?.[1] || 'glb';
      const modelNameForDisplay = filename
        ? filename.replace(/\.(fbx|glb|gltf)$/i, '')
        : path.split('/').pop()?.replace(/\.(glb|gltf|fbx)$/i, '') || '角色';

      const onLoaded = (loadedRoot: THREE.Object3D, loadedExt?: string) => {
        if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;

        // 带绑定的模型禁止增加 group，直接使用模型根
        let hasSkinnedMesh = false;
        loadedRoot.traverse((child) => {
          if (child instanceof THREE.SkinnedMesh) hasSkinnedMesh = true;
        });
        let character: THREE.Object3D;
        if (hasSkinnedMesh) {
          character = loadedRoot;
          character.name = character.name || loadedRoot.name || 'ModelRoot';
        } else if (loadedRoot instanceof THREE.Group && loadedRoot.children.length > 0) {
          character = loadedRoot;
        } else {
          const group = new THREE.Group();
          group.name = loadedRoot.name || 'ModelRoot';
          group.add(loadedRoot);
          character = group;
        }

          // 关键：确保所有对象的 matrixAutoUpdate 都是 true
          character.matrixAutoUpdate = true;
          character.matrixWorldAutoUpdate = true;
          
          // 遍历所有子对象，确保它们的 matrixAutoUpdate 都是 true
          character.traverse((child) => {
            if (child instanceof THREE.Object3D) {
              child.matrixAutoUpdate = true;
              child.matrixWorldAutoUpdate = true;
            }
          });
          
          // 确保角色的矩阵在加载时就正确设置
          character.updateMatrixWorld(true);
          
          // 调试：打印角色结构
          console.log('📦 角色模型结构:');
          console.log('  - 根节点类型:', character.type);
          console.log('  - 根节点名称:', character.name);
          console.log('  - 子对象数量:', character.children.length);
          character.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
              console.log(`  - Mesh: ${child.name || 'unnamed'}, 类型: ${child.type}`);
            }
          });

          // 检查并打印骨骼信息
          let boneCount = 0;
          let skinnedMeshCount = 0;
          const boneNames: string[] = [];
          const skeletonsList: THREE.Skeleton[] = [];
          let skeleton: THREE.Skeleton | null = null;
          const boneMap = new Map<string, THREE.Bone>();

          character.traverse((child) => {
            // 确保所有子对象可见（随后再按 LOD0 过滤）
            child.visible = true;
            
            if (child instanceof THREE.Bone) {
              boneCount++;
              boneNames.push(child.name);
            }
            
            if (child instanceof THREE.SkinnedMesh) {
              skinnedMeshCount++;
              if (child.skeleton) {
                // 收集所有不重复的 skeleton（多 mesh/merged 模型可能有多份）
                if (!skeletonsList.includes(child.skeleton)) {
                  skeletonsList.push(child.skeleton);
                }
                // 用「骨骼数最多」的 skeleton 构建 boneMap（merged 模型可能首 mesh 骨骼不全）
                const skel = child.skeleton;
                const n = skel.bones.length;
                if (skeleton === null || n > (skeleton as THREE.Skeleton).bones.length) {
                  skeleton = skel;
                  boneMap.clear();
                  skel.bones.forEach((bone) => boneMap.set(bone.name, bone));
                  console.log('✓ 找到 SkinnedMesh，骨骼数量:', n);
                  console.log('✓ 骨骼名称列表:', skel.bones.map((b) => b.name).join(', '));
                }
                child.visible = true;
              }
            }
            
            if (child instanceof THREE.Mesh) {
              // 单面渲染 + 非线框：强制 FrontSide，避免模型缩小后双面显示混乱、正反面异常
              const applyFrontSide = (mat: THREE.Material) => {
                if ('side' in mat) {
                  (mat as THREE.Material & { side: number }).side = THREE.FrontSide;
                }
                if (mat instanceof THREE.MeshStandardMaterial ||
                    mat instanceof THREE.MeshBasicMaterial ||
                    mat instanceof THREE.MeshPhongMaterial ||
                    mat instanceof THREE.MeshLambertMaterial) {
                  mat.wireframe = false;
                  mat.needsUpdate = true;
                }
              };
              if (Array.isArray(child.material)) {
                child.material.forEach(applyFrontSide);
              } else {
                applyFrontSide(child.material);
              }
              child.visible = true;
            }
          });

          // 同一绑定内多 LOD 时只显示 LOD0 高模
          applyLod0Only(character);

          // 关闭视锥裁切：缩小或拉远相机时仍完整渲染，避免部分模型不显示
          character.frustumCulled = false;
          character.traverse((c) => { (c as THREE.Object3D).frustumCulled = false; });

          // 骨骼名 → 标准名映射（FBX mixamorig*、GLB Armature_* / 标准名等 → 标准名）
          const boneNameToStandard = boneMap.size > 0 ? buildBoneNameMapping(Array.from(boneMap.keys())) : undefined;

          // FBX/GLB 导入时均规范化骨骼名：对所有 skeleton 重命名为标准名，避免多 mesh 时骨骼与模型分离
          if (skeleton && boneNameToStandard && boneNameToStandard.size > 0) {
            const bones = (skeleton as THREE.Skeleton).bones;
            normalizeBoneNamesOnImport(boneMap, boneNameToStandard, bones);
            const extLabel = loadedExt === 'fbx' ? 'FBX' : 'GLB';
            console.log(`✓ [${extLabel}] 主骨骼已规范为标准名:`, Array.from(boneMap.keys()).slice(0, 20).join(', ') + (boneMap.size > 20 ? '...' : ''));
            // 对其余 skeleton 的骨骼做同名规范化，使姿态与移动能作用到所有 SkinnedMesh
            for (const skel of skeletonsList) {
              if (skel === skeleton) continue;
              for (const bone of skel.bones) {
                const standard = boneNameToStandard.get(bone.name);
                if (standard) bone.name = standard;
              }
            }
            if (skeletonsList.length > 1) {
              console.log(`✓ 已规范化 ${skeletonsList.length} 个 skeleton 的骨骼名，避免骨骼与模型分离`);
            }
            // 补收：可能有个别 SkinnedMesh 的 skeleton 未在首次 traverse 中加入（不同引用），确保都处理到
            character.traverse((child) => {
              if (child instanceof THREE.SkinnedMesh && child.skeleton && !skeletonsList.includes(child.skeleton)) {
                skeletonsList.push(child.skeleton);
                if (boneNameToStandard) {
                  for (const bone of child.skeleton.bones) {
                    const standard = boneNameToStandard.get(bone.name);
                    if (standard) bone.name = standard;
                  }
                }
              }
            });
            // 按 adult-male.glb 的父子集重挂骨骼，保持世界位置不变；同一批 bone 只 reparent 一次
            const reparentedBones = new Set<THREE.Bone>();
            character.updateMatrixWorld(true);
            for (const skel of skeletonsList) {
              applyCanonicalBoneHierarchyPreservingWorld(skel.bones, reparentedBones);
              character.updateMatrixWorld(true);
              skel.bones.forEach((b) => b.updateMatrixWorld(true));
              skel.update();
            }
            // 若某 mesh（如 Jacket_Geo）未正确蒙皮，可改为绑定到主 skeleton（与首 mesh 共用骨骼）
            if (skeleton && skeletonsList.length > 1) {
              character.traverse((child) => {
                if (child instanceof THREE.SkinnedMesh && child.skeleton && child.skeleton !== skeleton) {
                  const name = (child.name || '').toLowerCase();
                  if (name.includes('jacket') || name.includes('jacket_geo')) {
                    (child as THREE.SkinnedMesh).skeleton = skeleton as THREE.Skeleton;
                    console.log(`✓ 已将 ${child.name} 绑定到主 skeleton 以修复蒙皮`);
                  }
                }
              });
            }
          }

          // 根骨骼（控制用）：必须是骨骼层级根，否则移动时模型分离；优先名称 Hips 系
          let rootBone: THREE.Bone | undefined = undefined;
          if (skeleton !== null && (skeleton as THREE.Skeleton).bones?.length > 0) {
            const bones = (skeleton as THREE.Skeleton).bones;
            const boneSet = new Set(bones);
            const boneNamesSet = new Set(boneMap.keys());
            // 层级根：parent 不在 skeleton.bones 中的骨骼（即骨骼层级顶层）
            const hierarchyRoots = bones.filter((b) => !b.parent || !boneSet.has(b.parent as THREE.Bone));
            // 优先 Hips 系名称（含 merged 模型常见的 Root/Armature），且必须是层级根之一
            const hipsName = resolveRootBoneName(boneNameToStandard, boneNamesSet);
            if (hipsName && hierarchyRoots.some((b) => b.name === hipsName)) {
              rootBone = boneMap.get(hipsName) ?? undefined;
            }
            if (!rootBone && hierarchyRoots.length > 0) {
              rootBone = hierarchyRoots[0];
              console.log(`✓ 根骨骼使用层级根: ${rootBone.name}（可应用 pose 的模型将显示控制器）`);
            }
            if (!rootBone) {
              // 兜底：非任何骨骼子节点的骨骼
              const isChildOf = (b: THREE.Bone) => bones.some((o) => o !== b && o.children.includes(b));
              rootBone = bones.find((b) => !isChildOf(b)) ?? bones[0];
            }
            console.log(`✓ 根骨骼(控制用): ${rootBone.name}，层级根候选: ${hierarchyRoots.map((b) => b.name).join(', ')}`);
          }

          // 导入位置默认，不移动
          character.updateMatrixWorld(true);
          skeletonsList.forEach((s) => s.update());
          character.position.set(0, 0, 0);
          character.updateMatrixWorld(true);

          console.log(`✓ 模型加载完成 - 骨骼数: ${boneCount}, SkinnedMesh数: ${skinnedMeshCount}`);
          if (boneMap.size > 0) {
            console.log(`✓ 骨骼映射已构建，包含 ${boneMap.size} 个骨骼`);
          } else {
            console.warn('⚠ 警告: 未找到骨骼系统，模型可能无法应用姿势');
          }

          // CCD IK：为手腕/脚踝创建可拖动目标并构建 IK 链；至少显示根骨骼处绿色控制点
          const ikResult = boneMap.size > 0 ? createIKForCharacter(character, boneMap, rootBone) : null;

          // 内置模型换成纯色材质（去贴图）；用户导入模型保留贴图
          const isImportedModel = Boolean(filename) || path.startsWith('blob:');
          if (!isImportedModel) {
            stripModelTextures(character);
          }

          // 添加角色到场景（带绑定时 character 即模型根，控制轴将附加到此对象以实现移动）
          sceneRef.current.add(character);

          // 创建 TransformControls（每个角色一个）
          const transformControls = new TransformControls(
            cameraRef.current,
            rendererRef.current.domElement
          );
          // 设置 TransformControls 为移动模式
          transformControls.setMode('translate');
          transformControls.setSpace('world'); // 使用世界空间，确保移动方向正确
          transformControls.showX = true;
          transformControls.showY = true;
          transformControls.showZ = true;
          transformControls.setSize(0.8); // 增大控制轴大小，更容易操作
          (transformControls as any).visible = false; // 初始不可见，选中后才显示
          
          // 确保 TransformControls 可以正确交互
          transformControls.enabled = true;
          
          // 确保 TransformControls 可以接收鼠标事件
          const jointDragRest = {
            bone: null as THREE.Bone | null,
            position: new THREE.Vector3(),
            rotation: new THREE.Euler(),
          };
          transformControls.addEventListener('mouseDown', () => {
            const obj = transformControls.object;
            if (obj instanceof THREE.Bone && obj.userData.jointFineTune) {
              jointDragRest.bone = obj;
              jointDragRest.position.copy(obj.position);
              jointDragRest.rotation.copy(obj.rotation);
            } else {
              jointDragRest.bone = null;
            }
          });
          transformControls.addEventListener('objectChange', () => {
            const obj = transformControls.object;
            if (!(obj instanceof THREE.Bone) || !obj.userData.jointFineTune || jointDragRest.bone !== obj) return;
            if (transformControls.mode === 'scale') {
              obj.scale.set(1, 1, 1);
              return;
            }
            if (transformControls.mode !== 'translate') return;
            const delta = obj.position.clone().sub(jointDragRest.position);
            obj.rotation.copy(jointDragRest.rotation);
            obj.rotateX(-delta.y * 6);
            obj.rotateZ(delta.x * 6);
            obj.rotateY(delta.z * 6);
            obj.position.copy(jointDragRest.position);
          });

          transformControls.addEventListener('mouseDown', () => {
            console.log('🖱️ TransformControls 鼠标按下');
          });
          
          transformControls.addEventListener('mouseUp', () => {
            console.log('🖱️ TransformControls 鼠标释放');
          });

          // 拖拽根骨骼时只更新当前 skeleton，不同步到其它 skeleton 的根骨
          const updateSkeletonsOnRootMove = () => {
            if (charData.rootBone) {
              charData.rootBone.updateMatrix();
              charData.rootBone.updateMatrixWorld(true);
            }
            const list = charData.skeletons ?? (charData.skeleton ? [charData.skeleton] : []);
            list.forEach((s) => s.update());
          };

          // 缩放轴操作后：用 rootBone 的 XYZ 均匀缩放值，只同步到「名为 Hips」的根骨，避免误缩放其它骨导致变形
          const syncScaleFromRootToAllHips = () => {
            if (!charData.rootBone) return;
            const sc = charData.rootBone.scale;
            const s = Math.max(0.01, Math.min(100, (sc.x + sc.y + sc.z) / 3));
            charData.rootBone.scale.set(s, s, s);
            const list = charData.skeletons ?? (charData.skeleton ? [charData.skeleton] : []);
            const scaledHips = new Set<THREE.Bone>();
            for (const skel of list) {
              const boneSet = new Set(skel.bones);
              const roots = skel.bones.filter((b) => !b.parent || !boneSet.has(b.parent as THREE.Bone));
              const hips = roots.find((b) => b.name === 'Hips');
              if (hips && !scaledHips.has(hips)) {
                hips.scale.set(s, s, s);
                scaledHips.add(hips);
              }
            }
            charData.group.updateMatrixWorld(true);
            list.forEach((sk) => sk.update());
          };

          // 当拖拽时禁用 OrbitControls，并添加调试信息
          let isDragging = false;
          transformControls.addEventListener('dragging-changed', (event: any) => {
            isDragging = Boolean(event.value);
            if (controlsRef.current) {
              controlsRef.current.enabled = !event.value;
            }
            const obj = transformControls.object;
            if (obj && (obj === charData.rootBone || obj === charData.group)) {
              obj.updateMatrix();
              obj.updateMatrixWorld(true);
              if (obj === charData.rootBone) {
                updateSkeletonsOnRootMove();
                if (!event.value && (transformControls as any).getMode?.() === 'scale') syncScaleFromRootToAllHips();
              } else charData.skeletons?.forEach((s) => s.update()) ?? charData.skeleton?.update();
            }
            if (event.value) {
              console.log('🎯 开始拖拽');
            } else {
              const pos = obj?.position ? obj.position.toArray() : charData.group.position.toArray();
              console.log('✅ 拖拽结束 - 位置:', pos);
            }
          });

          // 将 TransformControls 的 root 对象添加到场景中（兼容新版 three）
          addTransformControlsToScene(sceneRef.current, transformControls);

          // 监听变换事件：根骨/group 时更新 skeleton；附着到 IK target 或骨骼时也更新 skeleton
          transformControls.addEventListener('change', () => {
            const obj = transformControls.object;
            if (!obj) return;
            obj.updateMatrix();
            obj.updateMatrixWorld(true);
            if (obj === charData.rootBone) {
              updateSkeletonsOnRootMove();
              if ((transformControls as any).getMode?.() === 'scale') syncScaleFromRootToAllHips();
            } else if (obj === charData.group) {
              (charData.skeletons ?? (charData.skeleton ? [charData.skeleton] : [])).forEach((s) => s.update());
            } else {
              charData.group.updateMatrixWorld(true);
              (charData.skeletons ?? (charData.skeleton ? [charData.skeleton] : [])).forEach((s) => s.update());
            }
            charData.group.traverse((child) => {
              if (child instanceof THREE.SkinnedMesh && child.skeleton) {
                child.skeleton.update();
              }
            });
            charData.group.updateMatrixWorld(true);
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
          });

          // 添加到场景（但不立即附加到角色）
          addTransformControlsToScene(sceneRef.current, transformControls);

          const charData: Character = {
            id,
            group: character,
            transformControls,
            modelPath: path,
            modelExt: ext as 'fbx' | 'glb' | 'gltf',
            name: modelNameForDisplay,
            skeleton: skeleton || undefined,
            skeletons: skeletonsList.length > 0 ? skeletonsList : undefined,
            boneMap: boneMap.size > 0 ? boneMap : undefined,
            boneNameToStandard: boneNameToStandard,
            rootBone: rootBone,
            ...(ikResult && {
              ikTargets: ikResult.ikTargets,
              ikSolver: ikResult.ikSolver,
              rootTarget: ikResult.rootTarget,
              headRing: ikResult.headRing,
              jointHandles: ikResult.jointHandles,
            }),
          };

          charactersRef.current.set(id, charData);
          // 立即标记为选中，使本帧/下一帧渲染时控制器可见（否则 animate 先于 doSelectCharacter 会把控制器设为隐藏）
          selectedCharacterIdRef.current = id;

          // 确保模型在场景中可见并正确初始化
          character.updateMatrixWorld(true);
          
          // 初始化骨骼系统
          if (skeleton) {
            const skel = skeleton as THREE.Skeleton;
            skel.bones.forEach((bone: THREE.Bone) => {
              bone.updateMatrixWorld(true);
            });
            skel.update();
          }
          
          // 确保所有 SkinnedMesh 正确初始化
          character.traverse((child) => {
            if (child instanceof THREE.SkinnedMesh && child.skeleton) {
              child.skeleton.bones.forEach((bone) => {
                bone.updateMatrixWorld(true);
              });
              child.skeleton.update();
            }
          });

          // 下一帧再选中并附加控制轴，确保角色已在场景中且矩阵已更新，拖拽才能生效
          requestAnimationFrame(() => {
            doSelectCharacter(id);
          });
      };

      const onProgress = (progress: ProgressEvent) => {
        if (progress.lengthComputable) {
          console.log('加载进度:', ((progress.loaded / progress.total) * 100).toFixed(0) + '%');
        }
      };
      const onError = (error: unknown) => {
        console.error('加载模型失败:', error);
      };

      if (ext === 'fbx') {
        // FBX 不在此处缩放，传入 onLoaded 后统一按 STANDARD_CHARACTER_HEIGHT 缩放，保证根骨骼层级为 scale 1、可正常移动
        const loader = new FBXLoader();
        loader.load(path, (obj) => {
          onLoaded((obj as THREE.Object3D).clone(), ext);
        }, onProgress, onError);
      } else {
        const loader = new GLTFLoader();
        loader.load(path, (gltf) => onLoaded(gltf.scene.clone(), ext), onProgress, onError);
      }

      return id;
    };

    const loadObject = (path: string, objectId?: string): string => {
      if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return '';
      const id = objectId || createId();
      const ext = path.toLowerCase().match(/\.(glb|gltf|fbx)$/)?.[1] || 'glb';
      const name = path.split('/').pop()?.replace(/\.(glb|gltf|fbx)$/i, '') || 'object';

      const onLoaded = (loadedRoot: THREE.Object3D) => {
        if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
        const group = new THREE.Group();
        group.name = name;
        group.add(loadedRoot);
        group.traverse((child) => {
          child.visible = true;
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.Material;
            if ('side' in mat) (mat as any).side = THREE.FrontSide;
          }
        });
        // 内置道具/摄像机去掉贴图，保留材质颜色
        stripModelTextures(group);
        applyLod0Only(group);
        group.position.set(0, 0, 0);
        sceneRef.current.add(group);
        const tc = new TransformControls(cameraRef.current, rendererRef.current.domElement);
        tc.setMode('translate');
        tc.setSpace('world');
        tc.addEventListener('dragging-changed', (event: any) => {
          if (controlsRef.current) controlsRef.current.enabled = !event.value;
        });
        addTransformControlsToScene(sceneRef.current, tc);
        objectsRef.current.set(id, { id, group, name, transformControls: tc });
        doSelectObject(id);
      };

      if (ext === 'fbx') {
        const loader = new FBXLoader();
        loader.load(path, (obj) => onLoaded((obj as THREE.Object3D).clone()));
      } else {
        const loader = new GLTFLoader();
        loader.load(path, (gltf) => onLoaded(gltf.scene.clone()));
      }
      return id;
    };

    useEffect(() => {
      if (!containerRef.current) return;
      const initialShot = getShot(shotId);
      if (!initialShot) return;

      let scene: THREE.Scene;
      let camera: THREE.PerspectiveCamera;
      let renderer: THREE.WebGLRenderer;
      let controls: OrbitControls;

      // 初始化场景
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);
      sceneRef.current = scene;

      // 初始化相机（near 不宜过小否则缩小模型时深度精度不足导致闪烁、透出背面；far 足够大即可）
      camera = new THREE.PerspectiveCamera(
        50,
        containerRef.current.clientWidth / containerRef.current.clientHeight,
        0.001,
        1e7
      );

      // 初始化渲染器（注意：OrbitControls 需要 renderer.domElement，所以必须先创建 renderer）
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
      renderer.setClearColor(0xf0f0f0, 1);
      renderer.setSize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      );
      renderer.setPixelRatio(window.devicePixelRatio);
      // 确保渲染器正确更新
      renderer.shadowMap.enabled = false;
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // 初始化控制器（放在渲染器创建之后，避免 renderer 为空导致错误）
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.6, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

      // 初始化相机位置（只在切换 shotId 时做一次）
      // 后续 framing/cameraAngle 的变化由下面的 useEffect 只更新相机参数，不重建场景
      // @ts-ignore - initialShot 来自 store，结构与 Shot 一致
      applyCameraForShot(camera, controls, initialShot);

      cameraRef.current = camera;

      // 添加光源（增强光照以确保模型可见）
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
      scene.add(ambientLight);

      const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight1.position.set(5, 10, 5);
      scene.add(directionalLight1);

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
      directionalLight2.position.set(-5, 5, -5);
      scene.add(directionalLight2);

      // 添加半球光以提供更柔和的光照
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
      hemisphereLight.position.set(0, 10, 0);
      scene.add(hemisphereLight);

      // 添加网格辅助
      const gridHelper = new THREE.GridHelper(10, 10);
      gridHelperRef.current = gridHelper;
      scene.add(gridHelper);

      // 渲染循环
      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);
        
        // 更新控制器
        controls.update();
        
        // 若当前附着在 IK target 上，先跑 CCD IK 再更新骨骼
        const attached = transformControlsRef.current?.object;
        if (attached?.name?.endsWith('Target')) {
          for (const char of charactersRef.current.values()) {
            if (!char.ikSolver || !char.ikTargets) continue;
            const targets = Object.values(char.ikTargets).filter(Boolean);
            if (targets.includes(attached as THREE.Mesh)) {
              char.ikSolver.update();
              char.group.updateMatrixWorld(true);
              break;
            }
          }
        }
        
        // 更新骨骼系统（matrix 由 matrixAutoUpdate 自动同步，无需手动 updateMatrixWorld）
        charactersRef.current.forEach((char) => {
          if (char.skeleton) {
            char.skeleton.update();
          }
          char.skeletons?.forEach((s) => s.update());
        });

        // 仅当前选中角色：控制器可见并跟随骨骼；未选中角色的控制器隐藏且不可选（预设与符合绑定的导入模型一致）
        const selectedId = selectedCharacterIdRef.current;
        const _syncPos = new THREE.Vector3();
        charactersRef.current.forEach((char) => {
          const isActive = char.id === selectedId;
          if (char.rootTarget) char.rootTarget.visible = isActive;
          if (char.headRing) char.headRing.visible = isActive;
          if (char.ikTargets) {
            for (const t of Object.values(char.ikTargets)) if (t) t.visible = isActive;
          }
          char.jointHandles?.forEach((handle) => {
            handle.visible = isActive;
          });
          if (!isActive) {
            setGizmoHighlight(char.rootTarget, false);
            setGizmoHighlight(char.headRing, false);
            if (char.ikTargets) {
              for (const t of Object.values(char.ikTargets)) setGizmoHighlight(t, false);
            }
            char.jointHandles?.forEach((handle) => setGizmoHighlight(handle, false));
            return;
          }
          const headBone = char.boneMap?.get('Head') ?? char.skeleton?.bones.find((b) => b.name === 'Head');
          setGizmoHighlight(char.rootTarget, attached === char.rootBone || attached === char.rootTarget);
          setGizmoHighlight(char.headRing, attached === headBone || attached === char.headRing);
          if (char.ikTargets) {
            for (const t of Object.values(char.ikTargets)) {
              if (!t) continue;
              const effector = t.userData.effectorBone as THREE.Bone | undefined;
              setGizmoHighlight(t, attached === t || (!!effector && attached === effector));
            }
          }
          char.jointHandles?.forEach((handle) => {
            const bone = handle.userData.jointBone as THREE.Bone | undefined;
            setGizmoHighlight(handle, attached === handle || (!!bone && attached === bone));
          });
          if (char.rootBone) char.rootBone.updateMatrixWorld(true);
          char.group.updateMatrixWorld(true);
          if (char.rootTarget && char.rootBone) {
            char.rootBone.getWorldPosition(_syncPos);
            char.group.worldToLocal(char.rootTarget.position.copy(_syncPos));
          }
          if (char.headRing && char.headRing !== attached && headBone) {
            headBone.getWorldPosition(_syncPos);
            char.group.worldToLocal(char.headRing.position.copy(_syncPos));
          }
          char.jointHandles?.forEach((handle) => {
            const bone = handle.userData.jointBone as THREE.Bone | undefined;
            if (!bone) return;
            bone.getWorldPosition(_syncPos);
            char.group.worldToLocal(handle.position.copy(_syncPos));
          });
          if (char.ikSolver && char.ikTargets && char.ikSolver.iks) {
            for (const ik of char.ikSolver.iks) {
              if (ik.target !== attached) {
                (ik.effector as THREE.Bone).getWorldPosition(_syncPos);
                char.group.worldToLocal(ik.target.position.copy(_syncPos));
              }
            }
          }
        });

        renderer.render(scene, camera);
      };
      animate();

      // 处理容器/窗口大小变化（拖拽 controls 面板时仅容器尺寸变化，需用 ResizeObserver）
      const handleResize = () => {
        if (!containerRef.current || !camera || !renderer) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w <= 0 || h <= 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);
      const resizeObserver =
        containerRef.current &&
        new ResizeObserver(() => {
          handleResize();
        });
      if (resizeObserver && containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      // 添加键盘快捷键支持：
      // - T/R/S：切换 TransformControls 模式（移动/旋转/缩放）
      // - WASD / R/F：移动视图（前后左右、上下）
      // - Q/E：绕目标左右旋转
      // - T/G：绕目标上下旋转（仅在未选中骨骼/物体时生效，避免与 T 冲突）
      const handleKeyDown = (event: KeyboardEvent) => {
        // 检查是否按下了修饰键（避免与输入框冲突）
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        // 检查焦点是否在输入框或按钮上
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
          return;
        }

        const activeControls = transformControlsRef.current;
        const hasActiveTransform = !!(activeControls && (activeControls as any).visible);

        const key = event.key;
        const lower = key.toLowerCase();

        // 1) TransformControls 模式快捷键（仅在有选中对象时生效）
        if (hasActiveTransform) {
          if (lower === 't') {
            event.preventDefault();
            applyModeToIkAttachment(activeControls!, 'translate', charactersRef.current);
            console.log('切换到平移模式 (Translate)');
            return;
          }
          if (lower === 'r') {
            event.preventDefault();
            applyModeToIkAttachment(activeControls!, 'rotate', charactersRef.current);
            console.log('切换到旋转模式 (Rotate)');
            return;
          }
          if (lower === 's') {
            event.preventDefault();
            applyModeToIkAttachment(activeControls!, 'scale', charactersRef.current);
            console.log('切换到缩放模式 (Scale)');
            return;
          }
        }

        // 2) 视图导航快捷键（无选中对象或仅使用相机时生效）
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        if (!camera || !controls || !renderer || !scene) return;

        // 若有激活 TransformControls，则只允许 WASD/RF/QE/TG 在「未选中」状态下移动视图
        if (hasActiveTransform) {
          // 有激活 TransformControls 时，不再处理相机导航，避免干扰骨骼编辑
          return;
        }

        const moveStep = 0.4;
        const rotateStep = 0.08;
        let changed = false;

        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);

        // 平移：WASD + R/F
        if (['w', 'a', 's', 'd', 'r', 'f'].includes(lower)) {
          camera.getWorldDirection(forward);
          forward.y = 0;
          if (forward.lengthSq() === 0) forward.set(0, 0, -1);
          forward.normalize();
          right.crossVectors(forward, up).normalize();

          const delta = new THREE.Vector3();
          if (lower === 'w') delta.addScaledVector(forward, moveStep);
          if (lower === 's') delta.addScaledVector(forward, -moveStep);
          if (lower === 'a') delta.addScaledVector(right, -moveStep);
          if (lower === 'd') delta.addScaledVector(right, moveStep);
          if (lower === 'r') delta.addScaledVector(up, moveStep);
          if (lower === 'f') delta.addScaledVector(up, -moveStep);

          camera.position.add(delta);
          controls.target.add(delta);
          changed = true;
        }

        // 旋转：Q/E 水平旋转，T/G 垂直旋转
        if (['q', 'e', 't', 'g'].includes(lower)) {
          const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
          const spherical = new THREE.Spherical().setFromVector3(offset);

          if (lower === 'q') spherical.theta += rotateStep;
          if (lower === 'e') spherical.theta -= rotateStep;
          if (lower === 't') spherical.phi -= rotateStep;
          if (lower === 'g') spherical.phi += rotateStep;

          // 限制俯仰角，避免翻转
          const EPS = 0.01;
          spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, spherical.phi));

          offset.setFromSpherical(spherical);
          camera.position.copy(controls.target).add(offset);
          changed = true;
        }

        if (changed) {
          event.preventDefault();
          controls.update();
          renderer.render(scene, camera);
        }
      };
      document.addEventListener('keydown', handleKeyDown);

      // 画布点击：先单独检测 IK 目标（避免被身体网格挡住），再检测骨骼
      const handleCanvasClick = (event: MouseEvent) => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const scene = sceneRef.current;
        if (!renderer?.domElement || !camera || !scene) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const allGroups = Array.from(charactersRef.current.values()).map((c) => c.group);
        let foundId: string | null = null;
        let foundObj: THREE.Object3D | null = null;
        let foundIsIKTarget = false;
        // 仅当前选中角色的控制器参与射线检测（预设与导入模型一致，未选中不可点）
        const selectedId = selectedCharacterIdRef.current;
        const ikTargetList: THREE.Object3D[] = [];
        if (selectedId) {
          const c = charactersRef.current.get(selectedId);
          if (c?.rootTarget || c?.headRing || c?.ikTargets || c?.jointHandles?.length) {
            if (c.ikTargets) for (const t of Object.values(c.ikTargets)) if (t) ikTargetList.push(t);
            if (c.rootTarget) ikTargetList.push(c.rootTarget);
            if (c.headRing) ikTargetList.push(c.headRing);
            c.jointHandles?.forEach((handle) => ikTargetList.push(handle));
          }
        }
        const allHits = raycasterRef.current.intersectObjects(allGroups, true);
        if (ikTargetList.length > 0) {
          const targetHits = raycasterRef.current.intersectObjects(ikTargetList);
          const targetHit = targetHits.length > 0 ? targetHits[0] : null;
          if (targetHit) {
            const hitObj = targetHit.object;
            for (const [id, char] of charactersRef.current) {
              if (char.jointHandles?.includes(hitObj as THREE.Mesh)) {
                const bone = (hitObj as THREE.Mesh).userData.jointBone as THREE.Bone | undefined;
                if (bone) {
                  foundId = id;
                  foundObj = bone;
                  foundIsIKTarget = false;
                  break;
                }
              }
              if (char.rootTarget === hitObj && char.rootBone) {
                foundId = id;
                foundObj = char.rootBone;
                foundIsIKTarget = true;
                break;
              }
              if (char.headRing === hitObj) {
                const headBone = char.boneMap?.get('Head') ?? char.skeleton?.bones.find((b) => b.name === 'Head');
                if (headBone) {
                  foundId = id;
                  foundObj = headBone;
                  foundIsIKTarget = false;
                  break;
                }
              }
              if (char.ikTargets && Object.values(char.ikTargets).some((t) => t === hitObj)) {
                foundId = id;
                foundObj = hitObj;
                foundIsIKTarget = true;
                break;
              }
            }
          }
        }
        if (!foundObj) {
          for (const hit of allHits) {
            const hitObj = hit.object;
            for (const [id, char] of charactersRef.current) {
              let isPartOf = false;
              char.group.traverse((c) => { if (c === hitObj) isPartOf = true; });
              if (!isPartOf) continue;
              const isBone = hitObj instanceof THREE.Bone && (char.boneMap?.has(hitObj.name) || char.skeleton?.bones.includes(hitObj as THREE.Bone));
              if (isBone) {
                foundId = id;
                foundObj = hitObj;
                foundIsIKTarget = false;
                break;
              }
            }
            if (foundObj) break;
          }
        }
        if (!foundId || !foundObj) return;
        selectedObjectIdRef.current = null;
        objectsRef.current.forEach((o) => {
          o.transformControls.detach();
          (o.transformControls as any).visible = false;
        });
        const char = charactersRef.current.get(foundId)!;
        const tc = char.transformControls;
        charactersRef.current.forEach((c) => {
          (c.transformControls as any).visible = c.id === foundId;
        });
        addTransformControlsToScene(scene, tc);
        tc.attach(foundObj);
        tc.setMode(foundIsIKTarget ? 'translate' : 'rotate');
        tc.setSpace(foundIsIKTarget ? 'world' : 'local');
        tc.enabled = true;
        (tc as any).visible = true;
        transformControlsRef.current = tc;
        selectedCharacterIdRef.current = foundId;
        if (char.rootBone) char.rootBone.updateMatrixWorld(true);
        char.group.updateMatrixWorld(true);
        if (rendererRef.current && scene && camera) {
          rendererRef.current.render(scene, camera);
        }
      };
      renderer.domElement.addEventListener('click', handleCanvasClick);

      // 清理函数
      return () => {
        renderer.domElement.removeEventListener('click', handleCanvasClick);
        window.removeEventListener('resize', handleResize);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        document.removeEventListener('keydown', handleKeyDown);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        
        // 清理所有角色
        charactersRef.current.forEach((char) => {
          char.transformControls.dispose();
          char.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
            // 清理纹理
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || 
                    mat instanceof THREE.MeshBasicMaterial ||
                    mat instanceof THREE.MeshPhongMaterial ||
                    mat instanceof THREE.MeshLambertMaterial) {
                  if (mat.map) mat.map.dispose();
                  if (mat.envMap) mat.envMap.dispose();
                }
                // normalMap, roughnessMap, metalnessMap 只存在于 MeshStandardMaterial
                if (mat instanceof THREE.MeshStandardMaterial) {
                  if (mat.normalMap) mat.normalMap.dispose();
                  if (mat.roughnessMap) mat.roughnessMap.dispose();
                  if (mat.metalnessMap) mat.metalnessMap.dispose();
                }
              });
            }
          });
        });
        charactersRef.current.clear();

        objectsRef.current.forEach((obj) => {
          const tcAny = obj.transformControls as any;
          const tcRoot = tcAny._root ?? obj.transformControls;
          if (tcRoot instanceof THREE.Object3D && sceneRef.current) {
            sceneRef.current.remove(tcRoot);
          }
          obj.transformControls.dispose();
        });
        objectsRef.current.clear();

        // 清理控制器
        if (controls) {
          controls.dispose();
        }
        
        // 清理渲染器和 WebGL 上下文
        if (renderer) {
          // 清理所有纹理
          renderer.dispose();
          // 强制释放 WebGL 上下文
          const gl = renderer.getContext();
          if (gl) {
            const loseContext = (gl as any).getExtension?.('WEBGL_lose_context');
            if (loseContext) {
              loseContext.loseContext();
            }
          }
          // 移除 DOM 元素
          if (containerRef.current && renderer.domElement) {
            try {
              containerRef.current.removeChild(renderer.domElement);
            } catch (e) {
              // 忽略错误
            }
          }
        }
        
        // 清理引用
        sceneRef.current = null;
        rendererRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
      };
    }, [shotId, getShot]);

    // 仅更新相机参数，不要重建 three 场景（避免清空姿态内容）；切换景别/角度时恢复摄像机模型显示
    useEffect(() => {
      const cameraIds = cameraModelIdsRef.current;
      objectsRef.current.forEach((o) => {
        if (cameraIds.has(o.id)) o.group.visible = true;
      });
      if (!cameraRef.current || !controlsRef.current) return;
      const s = shotRef.current;
      if (!s) return;
      applyCameraForShot(cameraRef.current, controlsRef.current, s);
    }, [shot?.framing, shot?.cameraAngle]);

    return (
      <div ref={wrapperRef} className="w-full h-full relative min-h-0 min-w-0 overflow-hidden touch-none">
        <div ref={containerRef} className="w-full h-full min-h-0 min-w-0 touch-none" />
        {showSafeFrame && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <div style={safeFrameStyle} />
          </div>
        )}
      </div>
    );
  }
);

PoseEditorCanvas.displayName = 'PoseEditorCanvas';
