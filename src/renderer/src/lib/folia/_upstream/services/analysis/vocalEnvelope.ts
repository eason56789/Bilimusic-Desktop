/** 人声包络(最小实现):恒定 0 */
export const getVocalEnvelope = (): number[] => []
export const vocalLevelAt = (_t: number): number => 0
export default { getVocalEnvelope, vocalLevelAt }
