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
    body: `使用影格 Ingbord（开源纯本地版）即表示你同意：

1. 本软件以 GNU Affero General Public License v3.0 或后续版本（AGPL-3.0-or-later）发布；使用、修改与分发须遵守该许可（含网络提供服务时的源码披露义务）。
2. 自行导入的模型、图片与文案由你负责授权与合规。
3. 本软件按现状提供；在法律允许范围内不承担间接损失责任。
4. 若需闭源商用且不遵守 AGPL 义务，可联系版权方获取单独商业许可。

条款以仓库 LICENSE 为准。联系：${TELEGRAM}`,
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
    body: `By using Ingbord (open local edition) you agree to:

1. This software is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). Use, modification, and distribution must comply with that license (including source disclosure when offering the software over a network).
2. Ensure rights to any models, images, and text you import.
3. Use the software as-is; no liability for indirect damages to the extent permitted by law.
4. For proprietary/commercial use without AGPL obligations, contact the copyright holder for a separate commercial license.

See LICENSE in the repository. Contact: ${TELEGRAM}`,
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
