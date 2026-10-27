专业分镜 / 故事板编辑工具。

**在线试用（Web）：** https://miatoo.github.io/Ingbord/

[English](README.md) · 中文

适合短视频与广告分镜、课程脚本、故事板练习、独立创作等。
<img width="2752" height="1536" alt="main-zh" src="https://github.com/user-attachments/assets/a6ace6eb-56c0-4c6d-b3e4-44f977677e2d" />

## 能做什么

| 能力 | 说明 |
|------|------|
| **分镜板** | 管理多个镜头，上传/更换图片，拖拽排序，总览整场戏 |
| **3D 姿态** | 用 3D 人偶摆动作与机位，一键生成镜头草图 |
| **标注绘制** | 在画面上画笔、箭头、形状、文字等，做视觉备注 |
| **AI 生图** | 配置你的图像接口后，用提示词与参考图生成镜头画面 |
| **导入导出** | 工程文件（`.clapboard` / JSON）、Excel、CSV、图片 ZIP、PDF |
| **本地项目库** | 项目保存在浏览器本地，刷新后仍可继续编辑 |

---

## 发行版（Release）

可在仓库 [Releases](https://github.com/Miatoo/Ingbord/releases) 下载安装包。当前状态：

| 平台 | 状态 |
|------|------|
| **Windows 桌面版** | 待发布 |
| **Android** | 待发布 |
| **macOS** | 待后续测试更新 |
| **iOS** | 待后续测试更新 |
| **Linux** | 待后续测试更新 |

也可按下方说明自行构建 Web 版并静态部署。

---

## 快速开始

需要 Node.js 18+（推荐 20 / 22）。

### 本地开发

```bash
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173`）。

`npm install` 结束后若出现 `vulnerabilities`、`looking for funding`、`allow-scripts` 等提示，一般是**警告而非失败**。看到 `audited … packages` 且能继续执行 `npm run dev` / `npm run build` 即可。不必执行 `npm audit fix --force`（可能改坏依赖版本）。

### 生产构建 / 静态部署

```bash
npm install
npm run build
```

将 `dist/` 用 Nginx、宝塔、Cloudflare Pages 等托管即可。详见 [DEPLOY.md](DEPLOY.md)。

---

## 界面一览

打开后先进入**项目库**，可新建项目或打开已有工程。进入编辑器后大致布局为：

- **顶部**：项目名、返回库、新建/保存、导入导出、教程、属性、语言、主题、设置
- **左侧**：镜头列表（新建、切换等）
- **中间**：工作区标签 — **分镜板 / 3D 姿态 / 标注 / AI 生图**
- **右侧**：当前镜头的属性与导演备注等

---

## 四个工作视图

### 分镜板
<img width="2752" height="1536" alt="影格宣传页·多镜头管理手绘版" src="https://github.com/user-attachments/assets/0d169cb7-f6b6-45f0-baf2-71228a015a1d" />

总览所有镜头；上传/更换图片；拖拽排序；点击选中后右侧显示属性。

### 3D 姿态
<img width="2752" height="1536" alt="影格平板宣传页·3D模型摆Pose" src="https://github.com/user-attachments/assets/67eea671-db4c-4c3c-8934-929aec3084c4" />

- **旋转视角**：左键拖拽  
- **平移**：右键或中键拖拽  
- **缩放**：滚轮  
- 选中人偶后可用移动 / 旋转 / 缩放工具调整  
- 摆好后点 **「生成镜头图」** 写入当前镜头  
- 可从角色/模型库加人偶，也可导入自定义模型

### 标注

在当前镜头图上绘制：画笔、直线、方框、圆、箭头、文字、填充等。支持图层、撤销重做（Ctrl+Z / Ctrl+Y）。按 **Tab** 可隐藏/显示浮窗工具面板。标注内容随镜头保存，导出时一并体现。

### AI 生图
<img width="1912" height="914" alt="aigenerate" src="https://github.com/user-attachments/assets/11e7c902-5a85-4009-afb9-6d29f5c94394" />

1. 在面板中配置 **接口地址、密钥、模型名**。  
2. 选中有底图的镜头，填写提示词；可选上传角色/场景参考图。  
3. 点 **「生成」**，满意后 **保存为新版本**，可在版本之间切换。

---

## 设置与其它

- **画幅比例 / 安全框 / PDF 页眉**：在设置或元数据相关入口调整  
- **主题 / 语言**：顶部切换界面风格与中英文  
- **快捷键**：顶部可打开快捷键列表  

---

## 常见问题

**数据会丢吗？**  
项目默认存在本机浏览器。换电脑、清缓存或换浏览器会看不到旧项目，请用「导出工程」备份。

**AI 生图怎么用？**  
在 AI 生图面板填入你的图像接口地址、密钥和模型名后即可生成。

**`public/models` 里的模型？**  
若含受限资产，对外分发前请自行替换为可自由使用的资源。

---

## 一句话小结

**新建镜头 → 分镜板上传图（或 3D / 标注 / AI）→ 右侧写备注 → 拖拽排顺序 → 导出 PDF / ZIP / Excel / 工程文件。**

部署说明见 [DEPLOY.md](DEPLOY.md)。

---

## 许可

**整个仓库**（源码、文档与配置）统一基于 [**CC BY-NC-SA 4.0**](LICENSE) 协议发布。在保留署名的前提下，可自由分享和改编（非商用）。

| | |
|---|---|
| **Permissions** | 非商用条件下的分享、改编 |
| **Conditions** | 署名（Attribution）；相同方式共享（ShareAlike） |
| **Limitations** | 禁止商用（NonCommercial）；无担保 |

全文见 [LICENSE](LICENSE)。  
Telegram：https://t.me/+7AU5WrfdDZtlMTll · [仓库](https://github.com/Miatoo/Ingbord)
