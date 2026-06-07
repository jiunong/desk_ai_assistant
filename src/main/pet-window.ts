/** 根据宠物尺寸计算窗口大小（含名称与提示区域） */
export function getPetWindowSize(size: number): { width: number; height: number } {
  const imageHeight = Math.round(size * 1.35)
  const chromeHeight = 28
  return {
    width: size + 32,
    height: imageHeight + chromeHeight
  }
}
