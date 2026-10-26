/**
 * Humanoid / Mixamo / GLB 兼容的骨骼规范
 * - 动作库（poses.json）与模型骨骼名统一使用「标准名」作为 key
 * - GLB 角色常用标准名（Hips, Spine, LeftArm 等）
 * - FBX/Mixamo 常带前缀 mixamorig，如 mixamorigHips -> Hips
 */

/** 标准骨骼名列表（与 poses.json、GLB 角色、Mixamo/FBX 逻辑名对齐，含手指等） */
export const STANDARD_BONE_NAMES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Neck1',          // Mixamo/FBX 有 mixamorigNeck1
  'Head',
  'HeadTop_End',    // Mixamo/FBX 有 mixamorigHeadTop_End
  'LeftShoulder',
  'RightShoulder',
  'LeftArm',
  'RightArm',
  'LeftForeArm',
  'RightForeArm',
  'LeftHand',
  'RightHand',
  'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3', 'LeftHandThumb4',
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3', 'LeftHandIndex4',
  'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3', 'LeftHandMiddle4',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3', 'LeftHandRing4',
  'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3', 'LeftHandPinky4',
  'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3', 'RightHandThumb4',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3', 'RightHandIndex4',
  'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3', 'RightHandMiddle4',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3', 'RightHandRing4',
  'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3', 'RightHandPinky4',
  'LeftUpLeg',
  'RightUpLeg',
  'LeftLeg',
  'RightLeg',
  'LeftFoot',
  'RightFoot',
  'LeftToeBase', 'LeftToe_End',   // Mixamo/FBX 有 mixamorigLeftToeBase, mixamorigLeftToe_End
  'RightToeBase', 'RightToe_End',
  'LeftEye', 'RightEye',         // Mixamo/FBX 有 mixamorigLeftEye, mixamorigRightEye
] as const;

export type StandardBoneName = (typeof STANDARD_BONE_NAMES)[number];

/** 标准名 Set，用于快速判断 */
export const STANDARD_BONE_NAMES_SET = new Set<string>(STANDARD_BONE_NAMES);

/** Mixamo/FBX 常见前缀（strip 后得到标准名候选；Three 的 sanitizeNodeName 可能把 : 换成 _） */
export const MIXAMO_PREFIXES = ['mixamorig:', 'mixamorig_', 'mixamorig'] as const;

/** 标准名小写 → 标准名，用于大小写不敏感匹配 */
const STANDARD_BONE_NAMES_LOWER = new Map<string, string>(
  STANDARD_BONE_NAMES.map((n) => [n.toLowerCase(), n])
);

/** 标准化名称：去空格、下划线后小写，用于模糊匹配 */
function normalizeBoneName(s: string): string {
  return s.replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
}

/** 去掉末尾 _数字 后缀（如 Hips_10 -> Hips），多角色/克隆时 DCC 常加此类后缀 */
function stripTrailingNumberSuffix(s: string): string {
  return s.replace(/_\d+$/i, '');
}

/** GLB/Unity 骨骼名 → 标准名映射（不同命名约定） */
const GLB_BONE_ALIASES: Record<string, string> = {
  LeftUpperLeg: 'LeftUpLeg',
  LeftLowerLeg: 'LeftLeg',
  RightUpperLeg: 'RightUpLeg',
  RightLowerLeg: 'RightLeg',
  LeftUpperArm: 'LeftArm',
  LeftLowerArm: 'LeftForeArm',
  RightUpperArm: 'RightArm',
  RightLowerArm: 'RightForeArm',
  Chest: 'Spine2',
  UpperChest: 'Spine2',
  LeftThumbProximal: 'LeftHandThumb1',
  LeftThumbIntermediate: 'LeftHandThumb2',
  LeftThumbDistal: 'LeftHandThumb3',
  LeftIndexProximal: 'LeftHandIndex1',
  LeftIndexIntermediate: 'LeftHandIndex2',
  LeftIndexDistal: 'LeftHandIndex3',
  RightThumbProximal: 'RightHandThumb1',
  RightThumbIntermediate: 'RightHandThumb2',
  RightThumbDistal: 'RightHandThumb3',
  RightIndexProximal: 'RightHandIndex1',
  RightIndexIntermediate: 'RightHandIndex2',
  RightIndexDistal: 'RightHandIndex3',
  LeftToes: 'LeftToeBase',
  RightToes: 'RightToeBase',
};

/** 所有需 strip 的前缀（Mixamo + GLB/Armature + 常见 DCC 导出，长前缀优先） */
const ALL_PREFIXES = [
  'mixamorig:',
  'mixamorig_',
  'mixamorig',
  'Armature_',
  'Bone_',
  'CC_Base_',
];

/**
 * 从模型骨骼名得到标准名（若可识别）
 * - 若已是标准名，直接返回
 * - 去掉空格/下划线后匹配标准名（兼容 "Left Arm"、"Left_Arm"）
 * - 若带 Mixamo/GLB/Armature 前缀，去掉前缀后若在标准表中则返回
 * - 支持 Unity Humanoid 命名（LeftUpperLeg -> LeftUpLeg 等）
 */
export function modelBoneNameToStandard(name: string): string | null {
  const trimmed = name.trim();
  if (STANDARD_BONE_NAMES_SET.has(trimmed)) return trimmed;
  const alias = GLB_BONE_ALIASES[trimmed];
  if (alias) return alias;
  const normalized = normalizeBoneName(trimmed);
  const byNorm = STANDARD_BONE_NAMES_LOWER.get(normalized);
  if (byNorm) return byNorm;
  // 先尝试去掉末尾 _数字 后缀（mixamorigHips_10、LeftToeBase_9 等）
  const withoutSuffix = stripTrailingNumberSuffix(trimmed);
  if (withoutSuffix !== trimmed && STANDARD_BONE_NAMES_SET.has(withoutSuffix)) return withoutSuffix;
  if (withoutSuffix !== trimmed) {
    const stdNorm = STANDARD_BONE_NAMES_LOWER.get(normalizeBoneName(withoutSuffix));
    if (stdNorm) return stdNorm;
    const aliasNorm = GLB_BONE_ALIASES[withoutSuffix];
    if (aliasNorm) return aliasNorm;
  }

  const nameLower = trimmed.toLowerCase();
  for (const prefix of ALL_PREFIXES) {
    const pLower = prefix.toLowerCase();
    if (nameLower.startsWith(pLower)) {
      let candidate = trimmed.slice(prefix.length).trim();
      if (STANDARD_BONE_NAMES_SET.has(candidate)) return candidate;
      const std = candidate ? STANDARD_BONE_NAMES_LOWER.get(normalizeBoneName(candidate)) ?? null : null;
      if (std) return std;
      const aliasCandidate = GLB_BONE_ALIASES[candidate];
      if (aliasCandidate) return aliasCandidate;
      // 去掉末尾 _数字 再试（mixamorigHips_10 -> Hips_10 -> Hips）
      candidate = stripTrailingNumberSuffix(candidate);
      if (STANDARD_BONE_NAMES_SET.has(candidate)) return candidate;
      const std2 = STANDARD_BONE_NAMES_LOWER.get(normalizeBoneName(candidate)) ?? null;
      if (std2) return std2;
      const alias2 = GLB_BONE_ALIASES[candidate];
      if (alias2) return alias2;
    }
  }
  return null;
}

/**
 * 根据模型实际骨骼名列表，构建「模型骨骼名 → 标准名」映射
 * 用于 applyPose 时用标准名查 pose、用映射查模型里的 Bone
 */
export function buildBoneNameMapping(boneNames: string[]): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const name of boneNames) {
    const standard = modelBoneNameToStandard(name);
    if (standard) mapping.set(name, standard);
  }
  return mapping;
}

/**
 * 导入时规范化骨骼名称：将模型中所有可识别的骨骼重命名为标准名
 * @param boneMap 原「模型名 → Bone」映射，会被清空并填入「标准名 → Bone」
 * @param modelToStandard 模型名 → 标准名 映射（buildBoneNameMapping 的结果）
 * @param bones 骨骼数组（skeleton.bones），用于遍历并重命名
 * @returns 重命名后的 boneMap（key 为标准名）
 */
export function normalizeBoneNamesOnImport<T extends { name: string }>(
  boneMap: Map<string, T>,
  modelToStandard: Map<string, string> | undefined,
  bones: T[]
): Map<string, T> {
  if (!modelToStandard || modelToStandard.size === 0) return boneMap;
  for (const bone of bones) {
    const standard = modelToStandard.get(bone.name);
    if (standard) bone.name = standard;
  }
  boneMap.clear();
  for (const bone of bones) {
    boneMap.set(bone.name, bone);
  }
  return boneMap;
}

/**
 * 根据「模型骨骼名 → 标准名」映射，由标准名反查模型骨骼名
 * 若映射中没有，则假定模型骨骼名就是标准名（兼容已用标准名命名的模型）
 * 标准名比较不区分大小写，以兼容 poses 中 "Hips"/"hips" 等写法
 */
export function getModelBoneNameFromStandard(
  standardName: string,
  modelToStandard: Map<string, string>
): string | null {
  const want = standardName.toLowerCase();
  for (const [modelName, std] of modelToStandard) {
    if (std.toLowerCase() === want) return modelName;
  }
  return standardName;
}

/** 标准名 → Unity Humanoid 等 GLB 常见骨骼名（用于反向查找） */
const STANDARD_TO_GLB_ALIASES: Record<string, string[]> = {
  LeftUpLeg: ['LeftUpperLeg', 'Left Up Leg'],
  RightUpLeg: ['RightUpperLeg', 'Right Up Leg'],
  LeftLeg: ['LeftLowerLeg', 'Left Leg'],
  RightLeg: ['RightLowerLeg', 'Right Leg'],
  LeftArm: ['LeftUpperArm', 'Left Arm'],
  RightArm: ['RightUpperArm', 'Right Arm'],
  LeftForeArm: ['LeftLowerArm', 'Left Fore Arm'],
  RightForeArm: ['RightLowerArm', 'Right Fore Arm'],
  Spine2: ['Chest', 'UpperChest'],
  LeftToeBase: ['LeftToes'],
  RightToeBase: ['RightToes'],
};

/** 每个标准名在 FBX/Mixamo/GLB 中可能出现的骨骼名（按尝试顺序，与 poses.json 标准名对齐） */
const STANDARD_TO_VARIANTS: Record<string, string[]> = {};
function getPossibleModelNamesForStandard(standardName: string): string[] {
  if (STANDARD_TO_VARIANTS[standardName]) return STANDARD_TO_VARIANTS[standardName];
  const glbAliases = STANDARD_TO_GLB_ALIASES[standardName] ?? [];
  const v = [
    standardName,
    ...glbAliases,
    `mixamorig${standardName}`,
    `Mixamorig${standardName}`,
    `mixamorig:${standardName}`,
    `mixamorig_${standardName}`,
    `Armature_${standardName}`,
    `Bone_${standardName}`,
    `CC_Base_${standardName}`,
    `${standardName}.001`,
    `${standardName}_bone`,
    ...glbAliases.map((a) => `Armature_${a}`),
    ...glbAliases.map((a) => `Bone_${a}`),
    ...glbAliases.map((a) => `mixamorig${a}`),
  ];
  STANDARD_TO_VARIANTS[standardName] = v;
  return v;
}

/**
 * 从模型实际骨骼名集合中解析出与「标准名」一一对应的模型骨骼名
 * 用于 applyPose：poses.json 使用标准名（Hips, RightArm 等），需映射到各类模型的骨骼名
 * 优先级：已有映射表 > 标准名/mixamorig 直接匹配 > 常见变体 > 遍历 modelBoneNameToStandard
 */
export function resolveModelBoneNameForPose(
  standardName: string,
  modelToStandard: Map<string, string> | undefined,
  boneNames: Set<string>
): string | null {
  const want = standardName.toLowerCase();
  // 1. 已有映射表时优先用（buildBoneNameMapping 已解析所有模型骨骼）
  if (modelToStandard && modelToStandard.size > 0) {
    const fromMapping = getModelBoneNameFromStandard(standardName, modelToStandard);
    if (fromMapping && boneNames.has(fromMapping)) return fromMapping;
  }
  // 2. 直接匹配（adult-male.glb 等 GLB 标准名、mixamorig* FBX）
  if (boneNames.has(standardName)) return standardName;
  const direct = `mixamorig${standardName}`;
  if (boneNames.has(direct)) return direct;
  // 3. 常见变体（Armature_*, Bone_*, Unity Humanoid 等）
  const byLower = new Map<string, string>();
  boneNames.forEach((n) => byLower.set(n.toLowerCase(), n));
  for (const possible of getPossibleModelNamesForStandard(standardName)) {
    if (boneNames.has(possible)) return possible;
    const found = byLower.get(possible.toLowerCase());
    if (found) return found;
  }
  // 4. 遍历所有骨骼，按 modelBoneNameToStandard 反推
  for (const name of boneNames) {
    const std = modelBoneNameToStandard(name);
    if (std && std.toLowerCase() === want) return name;
  }
  // 5. 根骨骼专用：merged/导出模型常用名（Root、Armature、Pelvis 等）
  if (standardName === 'Hips') {
    const rootCandidates = ['Root', 'Armature', 'Pelvis', 'Hip', 'Bone', 'CC_Base_Hip', 'mixamorigHips', 'Hips'];
    for (const cand of rootCandidates) {
      if (boneNames.has(cand)) return cand;
      const found = byLower.get(cand.toLowerCase());
      if (found) return found;
    }
  }
  return byLower.get(want) ?? null;
}

/** 根骨骼常用名（Hips 系），用于选择控制用根骨骼 */
export const ROOT_BONE_STANDARD_NAMES = ['Hips'] as const;

/**
 * 标准骨骼父子关系（以 public/models/characters/adult-male.glb 为准）
 * 键为骨骼标准名，值为父骨骼标准名；无键或父为 null 表示根（Hips 的父为 Armature，不在 skeleton.bones 内）
 */
export const CANONICAL_BONE_PARENT: Record<string, string | null> = {
  Hips: null, // 根，父为 Armature 不在 bones 中
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  LeftHandThumb1: 'LeftHand',
  LeftHandThumb2: 'LeftHandThumb1',
  LeftHandThumb3: 'LeftHandThumb2',
  LeftHandIndex1: 'LeftHand',
  LeftHandIndex2: 'LeftHandIndex1',
  LeftHandIndex3: 'LeftHandIndex2',
  LeftHandMiddle1: 'LeftHand',
  LeftHandMiddle2: 'LeftHandMiddle1',
  LeftHandMiddle3: 'LeftHandMiddle2',
  LeftHandRing1: 'LeftHand',
  LeftHandRing2: 'LeftHandRing1',
  LeftHandRing3: 'LeftHandRing2',
  LeftHandPinky1: 'LeftHand',
  LeftHandPinky2: 'LeftHandPinky1',
  LeftHandPinky3: 'LeftHandPinky2',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  RightHandThumb1: 'RightHand',
  RightHandThumb2: 'RightHandThumb1',
  RightHandThumb3: 'RightHandThumb2',
  RightHandIndex1: 'RightHand',
  RightHandIndex2: 'RightHandIndex1',
  RightHandIndex3: 'RightHandIndex2',
  RightHandMiddle1: 'RightHand',
  RightHandMiddle2: 'RightHandMiddle1',
  RightHandMiddle3: 'RightHandMiddle2',
  RightHandRing1: 'RightHand',
  RightHandRing2: 'RightHandRing1',
  RightHandRing3: 'RightHandRing2',
  RightHandPinky1: 'RightHand',
  RightHandPinky2: 'RightHandPinky1',
  RightHandPinky3: 'RightHandPinky2',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
  RightToeBase: 'RightFoot',
  LeftEye: 'Head',
  RightEye: 'Head',
};

/** 按 adult-male 层级顺序（父在子前），用于重挂父子时逐骨处理 */
export const CANONICAL_BONE_ORDER = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
  'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
  'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
  'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
  'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'LeftEye', 'RightEye',
] as const;

/** 从骨骼名集合中解析根骨骼名（优先 Hips 系，用于控制位移） */
export function resolveRootBoneName(
  modelToStandard: Map<string, string> | undefined,
  boneNames: Set<string>
): string | null {
  return resolveModelBoneNameForPose('Hips', modelToStandard, boneNames);
}
