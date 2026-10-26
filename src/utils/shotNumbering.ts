import { Shot } from '../types';

export interface ParsedShotNumber {
  main: number;
  suffix: string | null;
}

const SHOT_NUMBER_RE = /^(\d+)\s*([a-zA-Z]*)$/;

/** 解析镜号，如 "1" / "1b" / "3B" → { main, suffix } */
export function parseShotNumber(shotNumber: string): ParsedShotNumber {
  const trimmed = String(shotNumber ?? '').trim();
  const match = trimmed.match(SHOT_NUMBER_RE);
  if (!match) {
    const asNum = parseInt(trimmed, 10);
    return {
      main: Number.isFinite(asNum) ? asNum : 0,
      suffix: null,
    };
  }
  const main = parseInt(match[1], 10);
  const rawSuffix = match[2] || '';
  return {
    main: Number.isFinite(main) ? main : 0,
    suffix: rawSuffix ? rawSuffix.toLowerCase() : null,
  };
}

export function formatShotNumber(main: number, suffixIndex: number): string {
  if (suffixIndex <= 0) return String(main);
  // 0 = 主镜头无后缀；1 → b，2 → c …
  return `${main}${String.fromCharCode('a'.charCodeAt(0) + suffixIndex)}`;
}

export function resolveRootId(shot: Shot, all: Shot[]): string {
  const byId = new Map(all.map((s) => [s.id, s]));
  let current: Shot | undefined = shot;
  const seen = new Set<string>();
  while (current?.parentShotId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parentShotId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? shot.id;
}

/** 从镜号推断 parentShotId（兼容旧工程无 parent 字段） */
export function normalizeShotRelationships(shots: Shot[]): Shot[] {
  const sorted = [...shots].sort((a, b) => a.order - b.order);
  const mainsByNumber = new Map<number, Shot>();

  for (const shot of sorted) {
    const parsed = parseShotNumber(shot.shotNumber);
    if (!parsed.suffix) {
      mainsByNumber.set(parsed.main, shot);
    }
  }

  return shots.map((shot) => {
    if (shot.parentShotId) {
      const parentExists = shots.some((s) => s.id === shot.parentShotId);
      if (parentExists && shot.parentShotId !== shot.id) {
        return shot;
      }
      return { ...shot, parentShotId: undefined };
    }

    const parsed = parseShotNumber(shot.shotNumber);
    if (!parsed.suffix) return shot;

    const main = mainsByNumber.get(parsed.main);
    if (main && main.id !== shot.id) {
      return { ...shot, parentShotId: main.id };
    }
    return shot;
  });
}

/** 按当前顺序将镜头编成「主镜头 + 复制镜头」组 */
export function buildShotGroups(shots: Shot[]): Shot[][] {
  const sorted = [...shots].sort((a, b) => a.order - b.order);
  const groupMap = new Map<string, Shot[]>();
  const rootOrder: string[] = [];

  for (const shot of sorted) {
    const rootId = resolveRootId(shot, sorted);
    if (!groupMap.has(rootId)) {
      groupMap.set(rootId, []);
      rootOrder.push(rootId);
    }
    groupMap.get(rootId)!.push(shot);
  }

  return rootOrder.map((id) => groupMap.get(id)!);
}

/** 按组重排镜号：1、1b、1c、2、2b…，并同步 parentShotId / order */
export function renumberByGroups(groups: Shot[][]): Shot[] {
  const result: Shot[] = [];
  let order = 0;

  groups.forEach((group, groupIndex) => {
    const mainNum = groupIndex + 1;
    const mainShot = group[0];
    group.forEach((shot, indexInGroup) => {
      result.push({
        ...shot,
        order: order++,
        shotNumber: formatShotNumber(mainNum, indexInGroup),
        parentShotId: indexInGroup === 0 ? undefined : mainShot.id,
        updatedAt: Date.now(),
      });
    });
  });

  return result;
}

/** 取排序后最后一个镜头的主序号 + 1 */
export function nextMainNumberFromLast(shots: Shot[]): number {
  if (shots.length === 0) return 1;
  const sorted = [...shots].sort((a, b) => a.order - b.order);
  const last = sorted[sorted.length - 1];
  const { main } = parseShotNumber(last.shotNumber);
  return Math.max(1, main + 1);
}

/** 某组内下一个复制后缀序号（1 → b，2 → c） */
export function nextSuffixIndexInGroup(groupSize: number): number {
  return groupSize; // 已有主镜头时 size=1 → 后缀 index 1 → "b"
}

/**
 * 拖拽时成组移动：同一组内可调相对顺序；跨组则整组移动。
 */
export function moveShotGroups(
  shots: Shot[],
  activeId: string,
  overId: string
): Shot[] {
  if (activeId === overId) return shots;

  const groups = buildShotGroups(shots);
  const activeGi = groups.findIndex((g) => g.some((s) => s.id === activeId));
  const overGi = groups.findIndex((g) => g.some((s) => s.id === overId));
  if (activeGi < 0 || overGi < 0) return shots;

  if (activeGi === overGi) {
    const group = [...groups[activeGi]];
    const oldIndex = group.findIndex((s) => s.id === activeId);
    const newIndex = group.findIndex((s) => s.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return shots;
    const [item] = group.splice(oldIndex, 1);
    group.splice(newIndex, 0, item);
    groups[activeGi] = group;
  } else {
    // 与 arrayMove 一致：先按 from 移除，再按原始 to 插入
    const [moved] = groups.splice(activeGi, 1);
    groups.splice(overGi, 0, moved);
  }

  return renumberByGroups(groups);
}

/** 在源镜头后插入复制镜头，并更新 order / 镜号 */
export function insertDuplicateAfterSource(
  shots: Shot[],
  sourceId: string,
  newShotBase: Omit<Shot, 'order' | 'shotNumber' | 'parentShotId'> &
    Partial<Pick<Shot, 'order' | 'shotNumber' | 'parentShotId'>>
): { shots: Shot[]; newShotId: string } {
  const normalized = normalizeShotRelationships(shots);
  const sorted = [...normalized].sort((a, b) => a.order - b.order);
  const sourceIndex = sorted.findIndex((s) => s.id === sourceId);
  if (sourceIndex < 0) {
    return { shots: normalized, newShotId: '' };
  }

  const source = sorted[sourceIndex];
  const rootId = resolveRootId(source, sorted);
  const group = sorted.filter((s) => resolveRootId(s, sorted) === rootId);
  const mainShot = group.find((s) => s.id === rootId) || group[0];
  const mainNum = parseShotNumber(mainShot.shotNumber).main || 1;
  const suffixIndex = nextSuffixIndexInGroup(group.length);

  const newShot: Shot = {
    ...source,
    ...newShotBase,
    id: newShotBase.id,
    shotNumber: formatShotNumber(mainNum, suffixIndex),
    parentShotId: rootId,
    order: source.order + 1,
    createdAt: newShotBase.createdAt ?? Date.now(),
    updatedAt: newShotBase.updatedAt ?? Date.now(),
  };

  // 插在被复制镜头正后方
  sorted.splice(sourceIndex + 1, 0, newShot);

  // 保持各组结构，只刷新 order 与组内镜号（主序号按现有组顺序）
  const groups = buildShotGroups(
    sorted.map((s, i) => ({ ...s, order: i }))
  );
  const renumbered = renumberByGroups(groups);

  return { shots: renumbered, newShotId: newShot.id };
}

/** 解绑复制镜头：成为独立主镜头，并整体重排镜号 */
export function unbindShotFromParent(shots: Shot[], shotId: string): Shot[] {
  const normalized = normalizeShotRelationships(shots);
  const sorted = [...normalized].sort((a, b) => a.order - b.order);
  const target = sorted.find((s) => s.id === shotId);
  if (!target || !target.parentShotId) return normalized;

  const updated = sorted.map((s) =>
    s.id === shotId ? { ...s, parentShotId: undefined } : s
  );

  // 解绑后该镜头单独成组；其子复制若曾指向它则仍跟随它
  const groups = buildShotGroups(updated);
  return renumberByGroups(groups);
}
