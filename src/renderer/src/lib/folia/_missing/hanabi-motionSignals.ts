// stub: 上游 stores/motionSignals.ts 是播放器全局共享的 MotionValue 仓(每帧由播放器写入
// currentTime / 音频能量 / 节拍包络)。本项目宿主通过 props 传 MotionValue,这里只补 hanabi
// 读的节拍包络信号:恒 0,即「没有节拍包络」,随拍推镜不生效(与关掉智能动感模式一致)。
import { motionValue, type MotionValue } from 'framer-motion';

/** 轻拍包络(0..1,每拍冲一下再衰减);降级恒 0。 */
export const beatImpact: MotionValue<number> = motionValue(0);

/** 重拍包络(0..1,小节第一拍冲得更深);降级恒 0。 */
export const downbeatImpact: MotionValue<number> = motionValue(0);
