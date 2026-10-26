// 景别类型
export type Framing = 'CU' | 'MS' | 'WS' | 'ECU' | 'ELS';

// 机位类型
export type CameraAngle = 'low' | 'eye' | 'high';

// 镜头类型
export type ShotType = 'static' | 'push' | 'pull' | 'pan' | 'tilt' | 'dolly';

// 图像来源类型
export type ImageSource = 'placeholder' | '3d_pose' | 'drawing' | 'upload';

// 关节角度
export interface JointAngle {
  rotation: { x: number; y: number; z: number };
}

// 姿态
export interface Pose {
  // 关节角度（简化的骨骼系统）
  // 关键关节：head, neck, shoulders, elbows, wrists, hips, knees, ankles
  joints: Record<string, JointAngle>;
  
  // 预设标识（可选）
  presetName?: string; // "standing", "sitting", "walking" 等
}

// 摄像机参数
export interface Camera {
  // 景别（影响摄像机距离和FOV）
  framing: Framing; // 自动计算 position.z
  
  // 机位（影响摄像机高度）
  angle: CameraAngle; // 自动计算 position.y 和 rotation.x
  
  // 空间参数
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  fov: number; // 视野角度，默认 50
}

// 标注图层
export interface AnnotationLayer {
  type: 'brush' | 'arrow' | 'text';
  data: any; // 根据类型不同存储不同数据
}

// 来源参数
export interface SourceParams {
  // 3D Pose 来源
  pose3d?: {
    pose: Pose;
    camera: Camera;
    renderStyle: 'wireframe'; // MVP 固定为线稿
  };
  
  // 标注来源
  annotations?: {
    layers: AnnotationLayer[]; // 标注图层数据
    baseImage: string; // 标注前的底图 URL
  };
}

export type LayerBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten';

// 可绘制的栅格图层。image 为 PNG data URL，合成结果仍放在 Shot.image
export interface DrawingLayer {
  id: string;
  name: string;
  image: string;
  visible: boolean;
  role: 'background' | 'draw' | 'pose';
  /** 0–100；缺省按 100 处理（兼容旧工程） */
  opacity?: number;
  /** 混合模式；缺省 normal */
  blendMode?: LayerBlendMode;
  /** 合成顺序，数值越大越靠上；缺省按数组下标 */
  order?: number;
}

// 镜头
export interface Shot {
  id: string; // UUID，不可变
  shotNumber: string; // "1", "2", "1b" 等，可编辑
  order: number; // 排序序号，用于导出顺序
  /** 复制镜头指向主镜头 id；主镜头为空。用于成组移动与解绑 */
  parentShotId?: string;
  
  // 结构化信息（必需）
  framing: Framing;
  cameraAngle: CameraAngle;
  shotType: ShotType;
  duration: number; // 秒，默认 3.0
  
  // 内容信息
  image: string; // 最终合成的图像（Base64 或 Blob URL）
  layers?: DrawingLayer[];
  activeLayerId?: string;
  notes: string; // 导演备注（自由文本）
  
  // 来源信息（用于追溯）
  imageSource: ImageSource;
  sourceParams?: SourceParams;
  
  // 图片版本管理
  imageVersions?: ImageVersion[]; // 图片版本列表
  activeVersionId?: string; // 当前激活的版本ID
  
  createdAt: number; // 时间戳
  updatedAt: number; // 时间戳
}

// 项目
export interface Project {
  id: string;
  name: string;
  shots: Shot[]; // 镜头数组，按 order 排序
  // 画幅比例字符串，例如 "16:9"、"2.39:1" 等，具体可选项由设置面板控制
  aspectRatio: string;
  // PDF 右上角文本，支持占位符 {page} 表示页码
  pdfHeaderText?: string;
  // PDF 排版：每页列数、行数，以及页面宽高（毫米）。未设置时用 4×3 和 A4
  pdfColumns?: number;
  pdfRows?: number;
  pdfPageWidthMm?: number;
  pdfPageHeightMm?: number;
  createdAt: number;
  updatedAt: number;
}

// 视图模式
export type ViewMode = 'board' | 'pose3d' | 'annotation' | 'aigenerate';

// 图片版本
export interface ImageVersion {
  id: string;
  image: string; // Base64 或 Blob URL
  source: 'original' | 'ai_generated';
  createdAt: number;
  aiPrompt?: string; // AI生成时的提示词
  aiConfig?: {
    model?: string; // 使用的模型名称
    referenceImages?: string[]; // 参考图片的base64（可选，用于追溯）
  };
}

// AI生图API配置
export interface AIImageConfig {
  apiEndpoint: string; // API 端点：兼容 OpenAI 图像生成接口的完整 URL
  apiKey: string; // API密钥（必填），用于Bearer认证
  modelName: string; // 模型名称，例如：gpt-4-vision 或 dalle-3
}


