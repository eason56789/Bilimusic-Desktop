# folia 样式移植指南(子智能体必读)

把上游 folia 样式移植进本项目。上游完整源码在:
`/tmp/folia-src/full/chthollyphile-folia-major-8fc628d/`(AGPL-3.0,允许移植,保留版权注释)
本项目仓库根:`C:\Users\eason\.zcode\workspace\draft-d441f3fe-c50d-4de3-b0de-fab855c48b32`

## 目标目录结构(上游 → 本项目)

| 上游 | 本项目 |
|---|---|
| `src/components/visualizer/<style>/` | `src/renderer/src/lib/folia/styles/<style>/` |
| `src/components/visualizer/pixi/` | `src/renderer/src/lib/folia/pixi/`(已就位,勿动) |
| `src/components/visualizer/shared/…`、`styleTransition/`、`colorMix.ts` 等 | `src/renderer/src/lib/folia/shared/…`(大部分已就位) |
| `src/utils/…` | `src/renderer/src/lib/folia/utils/…`(部分已就位,缺的才补) |
| `src/services/…`、`src/stores/useVisualizerSettingsStore`、`src/hooks/useLucideIcons`、`src/components/modal/settings/kit` | **不要原样拷贝**——这些是播放器级服务,依赖 app 数据库/全局状态。在 `src/renderer/src/lib/folia/_missing/` 下写最小可用的 stub(签名与上游一致,行为合理降级),并注明 `// stub: 上游依赖播放器全局状态,此处降级实现` |

## 桥接层(已就位,直接用)

- `../../bridge`(即 `src/renderer/src/lib/folia/bridge.ts`)导出:
  `Line/Word/Theme`(秒制)、`AudioBands`(真 framer-motion MotionValue)、
  `VisualizerSharedProps` 在 `../definition`(`styles/definition.ts`)。
  各样式 tuning 接口与默认值在 `bridge.ts`/`motion.ts`:
  `DEFAULT_MONET_TUNING` 之类如缺,按上游 types 补进 `motion.ts` 并从 bridge 转出。
- 样式组件签名:上游 `VisualizerSharedProps`(见 `styles/definition.ts`),导出形式:
  `export const VisualizerXxx = (props: VisualizerSharedProps) => …`(本项目的懒加载表会取
  `.VisualizerXxx ?? .default`)。
- 上游 `import.meta.env.DEV` → 改成 `(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV`。
- 上游 `useTranslation()` → `../../i18n` 的 shim(已就位)。
- 字体栈:`utils/fontStacks` 若缺,从上游拷贝到 `utils/fontStacks.ts`(本项目已有一个
  `fontStacks.ts` 在 `lib/folia/fontStacks.ts`,优先复用它)。
- `Theme` 类型与上游略有差异:以 `../../bridge` 的为准(backgroundColor/primaryColor/
  accentColor/secondaryColor/fontStyle/fontWeight/animationIntensity 等)。上游 Theme 有的
  字段(如 wordColors/lyricsIcons/provider)在桥接 Theme 里没有,遇到就按 `undefined` 降级,
  不要去扩 bridge 的类型(除非确有必要,和用户默认行为一致优先)。
- 音频:`props.audioPower`、`props.audioBands.*` 都是真 MotionValue,直接 `useSpring`/`useTransform`。
- 背景:上游 `props.background`(VisualizerBackgroundConfig)由宿主传入;本项目宿主只给
  theme,不给 background。样式里用到 `props.background` 的地方,按 `undefined` 降级(与
  fume 的 `backgroundConfig.ts` 同样的容错写法)。样式自绘背景(FumeBackground 模式)保留。
- 封面图:不要尝试读取封面文件;上游用 `useHandoffCover`/`songHandover` 的地方按 null 降级。

## 移植步骤(每个样式)

1. 拷贝上游 `<style>/` 全部文件到 `styles/<style>/`(剔除 `entry.tsx`,它是上游的懒加载注册器)。
2. 批量改 import:上游相对路径按上表映射。`../../xxx` 在上游指向 `visualizer/xxx`,
   在本项目指向 `lib/folia/xxx`(同名即可);`../../../xxx` 指向 `src/xxx`,映射到
   `lib/folia/xxx` 或 `_missing` stub。
3. 补缺文件:每遇到一个解析不到的 import,先在 `lib/folia/utils|shared` 里找同名等价物,
   找不到就建 stub。stub 只需满足被引用的导出,签名照上游,行为给合理默认值。
4. `npm run typecheck`(在仓库根)过滤出你新增文件里的错误并修到 0。其他文件的既有错误不管。
   注意:多个智能体在并行移植别的样式,报错里出现的别人的文件不要去改。
5. 不要注册到 FoliaStage.tsx / 不要改 SettingsPage —— 主智能体统一登记。

## 已验证可用的先例

`styles/fume/`、`styles/cadenza/` 是已移植成功的样板(注意它们的 import 写法与降级手段)。
`styles/partita/`、`styles/claddagh/` 也是。

## 已就位的公共模块清单(勿重复创建)

`shared/`:colorMix、GlowWord、VisualizerSubtitleOverlay、glowWordTiming、glowWordVariants、
runtime、styleTransition/firstFrame、renderQuality/useLyricRenderQuality、subtitleFontSizes、
textMeasureCache、wordColoring、wordGlow、usePlayerBottomBarBottomPx、subtitleOverlayLayout、
pixiFilterVertex、preview/
`utils/`:alternateText、cjkSemanticLayout、frameRateLimiter、glowBlurQuantize、graphemeTiming、
lyricRenderQuality、pretextCompat、renderHints、sentenceLayout、subtitleOverlayLayout、
subtitleTrackStyle、wordSegmentation
`pixi/`:bloomFilter、loadPixi、pixiDisplayResources、pixiFilterPoolCompat、pixiProgramLinks、
pixiRuntimeHost、pixiTextureBudget、pixiWebGLContext(上游 `../pixi/*` → 本项目 `../../pixi/*`)

依赖:pixi.js ^8、three ^0.185 均已安装。
