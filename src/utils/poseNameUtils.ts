// 中文界面下的姿态名称：优先使用完整对照表，保证不再露出英文
import { lookupPoseNameZh } from './poseNameZh';

/** 将英文 pose 名称翻译为中文；查不到时尽量词级翻译，绝不直接回退成整句英文 */
export function autoTranslatePoseNameToZh(name: string): string {
  if (!name) return '';
  const hit = lookupPoseNameZh(name);
  if (hit) return hit;

  const raw = name.trim();
  if (/^Sit and on the phone/i.test(raw)) return '坐着打电话';
  if (/^Sit and point/i.test(raw)) return '坐着指向前方';
  if (/^broad stand shoot/i.test(raw)) return '持枪站立射击';

  const wordMap: Record<string, string> = {
    stand: '站立',
    standing: '站立',
    sit: '坐着',
    sitting: '坐着',
    walk: '行走',
    walking: '行走',
    run: '奔跑',
    running: '奔跑',
    hold: '拿着',
    holding: '拿着',
    talk: '说话',
    talking: '说话',
    look: '看',
    looking: '看着',
    point: '指向',
    pointing: '指向',
    phone: '手机',
    gun: '枪',
    shoot: '射击',
    jump: '跳跃',
    jumping: '跳跃',
    kneel: '跪',
    kneeling: '跪着',
    lie: '躺着',
    lying: '躺着',
    laying: '躺着',
    push: '推',
    pulled: '拉',
    pull: '拉',
    climb: '攀爬',
    climbing: '攀爬',
    lean: '倚靠',
    leaning: '倚靠',
    kick: '踢',
    kicking: '踢',
    fall: '跌倒',
    falling: '跌倒',
    crouch: '蹲',
    crouching: '蹲着',
    default: '默认',
    pose: '姿态',
    hands: '双手',
    hand: '手',
    arms: '双臂',
    arm: '手臂',
    up: '向上',
    down: '向下',
    left: '左',
    right: '右',
    back: '后',
    front: '前',
    side: '侧面',
    object: '物件',
    car: '汽车',
    chair: '椅子',
    wall: '墙',
    floor: '地面',
    table: '桌子',
    door: '门',
    rifle: '步枪',
    shotgun: '霰弹枪',
    knife: '刀',
    guitar: '吉他',
  };

  const parts = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => wordMap[p] || ( /^\d+$/.test(p) ? p : ''))
    .filter(Boolean);

  if (parts.length > 0) return parts.join('');
  // 最后兜底：仍尽量不显示英文原文，用通用标签
  return '未命名姿态';
}

/** 手部动作名称 */
export function autoTranslateHandPoseNameToZh(name: string): string {
  if (!name) return '';
  const hit = lookupPoseNameZh(name);
  if (hit) return hit;

  const raw = name.trim();
  const lower = raw.toLowerCase();
  if (lower.includes('fist')) return '握拳';
  if (lower.includes('claw')) return '爪形';
  if (lower.includes('flat')) return '手掌摊开';
  if (lower.includes('coin')) return '捏硬币';
  if (lower.includes('palm')) return '托手掌';
  if (lower.includes('peace')) return '剪刀手';
  if (lower === 'ok') return '好的手势';
  if (lower.includes('thumb')) return '竖起大拇指';
  if (lower.includes('point')) return '指向';
  if (lower.includes('relaxed') || lower.includes('natural')) return '自然放松';
  if (lower.includes('hold')) return '握持';
  return autoTranslatePoseNameToZh(raw) || '未命名手势';
}
