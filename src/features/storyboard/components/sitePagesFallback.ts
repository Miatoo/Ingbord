/**
 * Footer modal copy for the open-source local build (no backend CMS).
 */

export type SitePage = { slug: string; title: string; body: string };

const GITHUB = 'https://github.com/Miatoo/Ingbord';
const TELEGRAM = 'https://t.me/+7AU5WrfdDZtlMTll';

const PAGES_ZH: Record<string, SitePage> = {
  thanks: {
    slug: 'thanks',
    title: '鸣谢',
    body: `感谢 Wonder Unit 等开源项目的启发，以及 Three.js、React 等依赖的维护者。

也感谢每一位测试、反馈与支持影格的用户与创作者。`,
  },
  contact: {
    slug: 'contact',
    title: '联系我们',
    body: `Bug 反馈与软件交流：
${TELEGRAM}

项目仓库：
${GITHUB}

商务合作请通过仓库 Issues 或交流群联系。`,
  },
  project: {
    slug: 'project',
    title: '项目地址',
    body: `${GITHUB}

Issues、文档与发行包请在仓库中查看。`,
  },
  terms: {
    slug: 'terms',
    title: '用户协议',
    body: `欢迎使用影格 Ingbord。使用本软件即表示你已阅读并同意：

1. 本软件按 CC BY-NC-SA 4.0 协议提供：保留署名、非商用前提下可分享与改编。
2. 你自行导入或生成的模型、图片、文案等内容，须确保已获合法授权，相关责任由你承担。
3. 本软件按「现状」提供；在适用法律允许的范围内，作者不对间接损失承担责任。

完整许可条款以项目仓库 LICENSE 为准。
联系：${TELEGRAM}`,
  },
  privacy: {
    slug: 'privacy',
    title: '隐私政策',
    body: `1. 工程与偏好默认保存在本机。
2. 你主动配置的在线服务（如 AI 接口）才会产生联网请求，请同时遵守对方的隐私政策。
3. 向我们反馈时提供的信息仅用于排查与改进。

隐私相关问题可通过交流群或仓库 Issues 联系。`,
  },
  about: {
    slug: 'about',
    title: '关于我们',
    body: `影格 Ingbord
分镜编辑工具：镜头管理、3D 姿态、标注绘制、AI 生图与多格式导出。

项目：${GITHUB}
交流：${TELEGRAM}`,
  },
};

const PAGES_EN: Record<string, SitePage> = {
  thanks: {
    slug: 'thanks',
    title: 'Credits',
    body: `Thanks to Wonder Unit and related open-source work for inspiration, and to maintainers of Three.js, React, and other libraries we rely on.

Thanks also to everyone who tested, reported issues, and supported Ingbord.`,
  },
  contact: {
    slug: 'contact',
    title: 'Contact',
    body: `Bugs & discussion:
${TELEGRAM}

Repository:
${GITHUB}

For partnerships, reach out via Issues or the group above.`,
  },
  project: {
    slug: 'project',
    title: 'Project',
    body: `${GITHUB}

Issues, docs, and releases are on the repository.`,
  },
  terms: {
    slug: 'terms',
    title: 'Terms of Use',
    body: `Welcome to Ingbord. By using this software you agree that:

1. The software is provided under CC BY-NC-SA 4.0 — you may share and adapt it for non-commercial use with attribution.
2. You are responsible for rights and compliance of any models, images, or text you import or generate.
3. The software is provided as-is; to the extent permitted by law, authors are not liable for indirect damages.

Full license terms are in the repository LICENSE.
Contact: ${TELEGRAM}`,
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `1. Projects and preferences stay on your device by default.
2. Network requests only occur for services you configure (e.g. AI APIs); those providers’ policies also apply.
3. Feedback you send is used only to diagnose and improve the product.

Privacy questions: Telegram group or repository Issues.`,
  },
  about: {
    slug: 'about',
    title: 'About',
    body: `Ingbord
Storyboard editor: shots, 3D pose, annotation, AI imaging, and export.

Project: ${GITHUB}
Chat: ${TELEGRAM}`,
  },
};

export function getFallbackSitePage(slug: string, lang: 'zh' | 'en' = 'zh'): SitePage | null {
  const table = lang === 'en' ? PAGES_EN : PAGES_ZH;
  return table[slug] || null;
}
