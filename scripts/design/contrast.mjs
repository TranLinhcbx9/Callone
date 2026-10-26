/**
 * Kiểm tra độ tương phản WCAG của palette trong src/styles/globals.css (sáng và tối).
 * Chạy: node scripts/design/contrast.mjs
 * Thoát với mã 1 nếu có cặp màu chữ không đạt. Cũng in mã hex của vài màu nền để dùng cho theme-color và icon.
 */
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../../src/styles/globals.css', import.meta.url), 'utf8')

function block(source, startIndex) {
  const open = source.indexOf('{', startIndex)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error('Không tìm thấy khối CSS')
}

function tokens(body) {
  const map = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim()
  return map
}

const lightBody = block(css, css.indexOf('\n:root {'))
const darkMedia = css.indexOf('@media (prefers-color-scheme: dark) {')
const darkBody = block(css, css.indexOf(':root', darkMedia))
const themes = { sáng: tokens(lightBody), tối: { ...tokens(lightBody), ...tokens(darkBody) } }

function parseOklch(value) {
  const m = value.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)/)
  if (!m) throw new Error(`Không đọc được màu: ${value}`)
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  const alpha = m[5] === undefined ? 1 : Number(m[5]) / (m[6] ? 100 : 1)
  return { L, C: Number(m[3]), H: Number(m[4]), alpha }
}

function oklchToSrgb({ L, C, H }) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((v) => {
    const c = Math.min(1, Math.max(0, v))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  })
}

function color(theme, name, over) {
  const raw = theme[name]
  if (!raw) throw new Error(`Thiếu biến --${name}`)
  const parsed = parseOklch(raw)
  const rgb = oklchToSrgb(parsed)
  if (parsed.alpha < 1) {
    const base = over ?? [1, 1, 1]
    return rgb.map((v, i) => v * parsed.alpha + base[i] * (1 - parsed.alpha))
  }
  return rgb
}

/** Phủ một màu có độ trong suốt lên nền, như trình duyệt: ví dụ bg-destructive/10 */
function tint(rgb, alpha, over) {
  return rgb.map((v, i) => v * alpha + over[i] * (1 - alpha))
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const hex = (rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')

let failures = 0
function row(label, value, min) {
  const ok = value >= min
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'LỖI '} ${value.toFixed(2).padStart(5)}:1  (cần ${min})  ${label}`)
}

for (const [name, t] of Object.entries(themes)) {
  console.log(`\n== Chế độ ${name} ==`)
  const bg = color(t, 'background')
  const card = color(t, 'card', bg)
  const muted = color(t, 'muted', bg)
  const pairs = [
    ['chữ chính trên nền', color(t, 'foreground'), bg, 12],
    ['chữ chính trên thẻ', color(t, 'foreground'), card, 12],
    ['chữ phụ trên nền', color(t, 'muted-foreground'), bg, 4.5],
    ['chữ phụ trên thẻ', color(t, 'muted-foreground'), card, 4.5],
    ['chữ phụ trên ô muted', color(t, 'muted-foreground'), muted, 4.5],
    ['chữ trên nút chính', color(t, 'primary-foreground'), color(t, 'primary'), 4.5],
    ['màu nhấn làm chữ trên nền', color(t, 'primary'), bg, 4.5],
    ['màu nhấn làm chữ trên thẻ', color(t, 'primary'), card, 4.5],
    ['chữ trên nền nhấn nhạt', color(t, 'primary-soft-foreground'), color(t, 'primary-soft'), 4.5],
    ['được nhận lại trên nền', color(t, 'positive'), bg, 4.5],
    ['được nhận lại trên thẻ', color(t, 'positive'), card, 4.5],
    ['được nhận lại trên nền nhạt', color(t, 'positive'), color(t, 'positive-soft'), 4.5],
    ['còn nợ trên nền', color(t, 'negative'), bg, 4.5],
    ['còn nợ trên thẻ', color(t, 'negative'), card, 4.5],
    ['còn nợ trên nền nhạt', color(t, 'negative'), color(t, 'negative-soft'), 4.5],
    ['cảnh báo trên nền', color(t, 'warning'), bg, 4.5],
    ['cảnh báo trên thẻ', color(t, 'warning'), card, 4.5],
    ['cảnh báo trên nền nhạt', color(t, 'warning'), color(t, 'warning-soft'), 4.5],
    ['nguy hiểm (destructive) trên thẻ', color(t, 'destructive'), card, 4.5],
    [
      'nút xóa: destructive trên destructive/10',
      color(t, 'destructive'),
      tint(color(t, 'destructive'), 0.1, card),
      4.5,
    ],
    ['vòng focus trên nền (UI 3:1)', color(t, 'ring'), bg, 3],
  ]
  for (const [label, fg, back, min] of pairs) row(label, ratio(fg, back), min)

  // Avatar: công thức trong @utility avatar-tone, thử nhiều góc màu
  const avatar =
    name === 'sáng'
      ? { bg: [0.925, 0.042], fg: [0.4, 0.09] }
      : { bg: [0.34, 0.062], fg: [0.89, 0.07] }
  let worst = 99
  for (let hue = 0; hue < 360; hue += 15) {
    const back = oklchToSrgb({ L: avatar.bg[0], C: avatar.bg[1], H: hue })
    const front = oklchToSrgb({ L: avatar.fg[0], C: avatar.fg[1], H: hue })
    worst = Math.min(worst, ratio(front, back))
  }
  row('avatar: chữ cái trên nền pastel (góc xấu nhất)', worst, 4.5)

  console.log(
    `  mã hex  nền ${hex(bg)}  thẻ ${hex(card)}  nhấn ${hex(color(t, 'primary'))}  chữ ${hex(color(t, 'foreground'))}`,
  )
  console.log(
    `  viền/nền ${ratio(color(t, 'border', bg), bg).toFixed(2)}:1   viền ô nhập/nền ${ratio(color(t, 'input', bg), bg).toFixed(2)}:1  (chỉ để tham khảo)`,
  )
}

if (failures > 0) {
  console.log(`\n${failures} cặp chưa đạt.`)
  process.exit(1)
}
console.log('\nTất cả cặp đạt yêu cầu.')
