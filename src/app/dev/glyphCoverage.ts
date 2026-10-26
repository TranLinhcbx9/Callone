/**
 * Kiểm tra một font có đủ 134 chữ cái tiếng Việt dựng sẵn (cả hoa và thường) hay không.
 * Cách làm: đo độ rộng từng ký tự khi font đứng trước một font dự phòng. Nếu font có glyph thì độ rộng không đổi
 * dù font dự phòng là gì; nếu thiếu, trình duyệt vẽ bằng font dự phòng nên độ rộng khác nhau giữa các lần đo.
 */
const LOWER =
  'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ'

export const VIETNAMESE_LETTERS = Array.from(LOWER).flatMap((char) => [char, char.toLocaleUpperCase('vi-VN')])

export interface GlyphCoverage {
  present: number
  total: number
  missing: string[]
}

export async function measureGlyphCoverage(family: string, weight = 400): Promise<GlyphCoverage> {
  const sample = VIETNAMESE_LETTERS.join('') + '₫0123456789'
  await document.fonts.load(`${weight} 32px "${family}"`, sample)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return { present: 0, total: VIETNAMESE_LETTERS.length, missing: [] }
  const widthWith = (fallback: string, char: string) => {
    context.font = `${weight} 64px "${family}", ${fallback}`
    return context.measureText(char).width
  }
  const missing = VIETNAMESE_LETTERS.filter((char) => {
    const a = widthWith('monospace', char)
    const b = widthWith('serif', char)
    const c = widthWith('sans-serif', char)
    return !(Math.abs(a - b) < 0.01 && Math.abs(b - c) < 0.01)
  })
  return { present: VIETNAMESE_LETTERS.length - missing.length, total: VIETNAMESE_LETTERS.length, missing }
}
