// stub: 上游 @/mods/folium/registries/tunings.ts 是 folium 插件系统的 tunable 注册表
// (每帧调制系数,K3Panel 等 mod 面板写)。本项目没有 mod 系统,降级为空表:
// sonnet 运行时对缺 key 回落 1(sonnetShotFrame.ts 的 readSonnetModulation)。
export const useFoliumTunings = (_mode: string): Record<string, number> => ({});

export default useFoliumTunings;
