// stub: 上游依赖播放器全局状态(useAppViewStore,zustand),此处降级实现。
// machi 只读 `view === 'player'`(决定取景控制条是否可用);本项目宿主不接播放页路由,
// 默认按「在播放页」处理( true )以保留样式行为,可通过 setState 覆盖。
import { create } from 'zustand';

export type AppView = 'home' | 'player' | 'lattice';

interface MachiAppViewState {
    view: AppView;
}

export const useAppViewStore = create<MachiAppViewState>(() => ({
    view: 'player',
}));

export default useAppViewStore;
