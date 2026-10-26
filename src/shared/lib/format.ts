const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** 1250000 thành "1.250.000 ₫". Khoảng trắng trước ₫ là NBSP (U+00A0) để không bị xuống dòng. */
export function formatVnd(amount: number): string {
  return vndFormatter.format(amount)
}

/** 1250000 thành "1.250.000". */
export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}
