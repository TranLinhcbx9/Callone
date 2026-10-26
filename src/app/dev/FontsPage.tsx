import { useEffect, useState, type CSSProperties } from 'react'
import { EXPENSES, MEMBERS, ME_ID, TODAY } from '@/app/dev/fixtures'
import '@/app/dev/fonts-compare.css'
import { measureGlyphCoverage, type GlyphCoverage } from '@/app/dev/glyphCoverage'
import { ExpenseList } from '@/modules/bill-split/components/ExpenseList'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

interface Candidate {
  id: string
  name: string
  family: string
  note: string
  weights: string
}

const CANDIDATES: Candidate[] = [
  {
    id: 'plus-jakarta-sans',
    name: 'Plus Jakarta Sans',
    family: 'Cmp Plus Jakarta Sans',
    note: 'Hình học mềm, thanh lịch, nét hơi tròn. Biến thiên 200 đến 800, hai file latin và vietnamese khoảng 36 KB.',
    weights: 'biến thiên',
  },
  {
    id: 'be-vietnam-pro',
    name: 'Be Vietnam Pro',
    family: 'Cmp Be Vietnam Pro',
    note: 'Do người Việt thiết kế cho tiếng Việt, dấu xếp tầng gọn. Font tĩnh 400, 500, 600, khoảng 100 KB.',
    weights: '400, 500, 600',
  },
  {
    id: 'inter',
    name: 'Inter',
    family: 'Cmp Inter',
    note: 'Chuẩn mực trung tính, rõ ở cỡ nhỏ. Biến thiên 100 đến 900, hai file latin và vietnamese khoảng 58 KB.',
    weights: 'biến thiên',
  },
]

const CAPS = 'ẮẰẲẴẶ ẤẦẨẪẬ ẾỀỂỄỆ ỐỒỔỖỘ ỚỜỞỠỢ ỨỪỬỮỰ ỲÝỶỸỴ ĐƠƯ'
const LOWER = 'ắằẳẵặ ấầẩẫậ ếềểễệ ốồổỗộ ớờởỡợ ứừửữự ỳýỷỹỵ đơư'

function Specimen({ candidate, current }: { candidate: Candidate; current: string }) {
  const [coverage, setCoverage] = useState<GlyphCoverage | null>(null)
  useEffect(() => {
    let cancelled = false
    measureGlyphCoverage(candidate.family).then((result) => {
      if (!cancelled) setCoverage(result)
    })
    return () => {
      cancelled = true
    }
  }, [candidate.family])

  const style = { '--font-sans': `'${candidate.family}', sans-serif`, fontFamily: `'${candidate.family}', sans-serif` } as CSSProperties
  const complete = coverage && coverage.missing.length === 0

  return (
    <article style={style} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-xs" data-font={candidate.id}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-headline font-semibold">{candidate.name}</h2>
          {current === candidate.id && <Badge variant="soft">Đang dùng</Badge>}
          {coverage && (
            <Badge variant={complete ? 'positive' : 'negative'}>
              {coverage.present}/{coverage.total} chữ tiếng Việt
            </Badge>
          )}
        </div>
        <p className="text-small text-muted-foreground">{candidate.note}</p>
      </header>

      <section className="flex flex-col gap-1.5">
        <p className="text-display leading-tight font-semibold">Chia tiền Đà Lạt 3N2Đ</p>
        <p className="text-title font-semibold">Hưng trả 1.250.000 ₫ cho bữa lẩu gà lá é</p>
        <p className="text-body text-pretty">
          Mỗi người chịu 312.500 ₫. Mai ăn nhẹ nên phần của Mai là 187.500 ₫, còn thiếu 50.000 ₫ thì Tú trả bù. Quét mã QR
          để chuyển khoản, nhớ nhập đúng nội dung.
        </p>
        <p className="text-small text-muted-foreground">4 người · 6 khoản chi · Hôm nay, thứ Hai 26/10</p>
      </section>

      <section className="grid gap-1 rounded-xl bg-muted/60 p-3.5">
        <p className="tnum text-headline font-semibold">1.234.567 ₫</p>
        <p className="tnum text-title font-medium">
          <span className="text-positive">+940.000 ₫</span> <span className="text-negative">−150.000 ₫</span>
        </p>
        <p className="tnum text-body">0123456789 · 150k · 1tr2 · 2,5tr</p>
      </section>

      <section className="grid gap-1">
        <p className="text-title font-semibold tracking-wide">{CAPS}</p>
        <p className="text-title">{LOWER}</p>
        <p className="text-small text-muted-foreground">
          <span className="font-normal">Thường 400</span> · <span className="font-medium">Vừa 500</span> ·{' '}
          <span className="font-semibold">Đậm 600</span> ({candidate.weights})
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-small font-medium text-muted-foreground">Xem trước trong app</h3>
        <ExpenseList expenses={EXPENSES.slice(0, 2)} members={MEMBERS} meId={ME_ID} today={TODAY} />
        <div className="flex gap-2">
          <Input placeholder="Ví dụ: Lẩu gà lá é" aria-label="Tiêu đề mẫu" />
          <Button>Lưu</Button>
        </div>
      </section>
    </article>
  )
}

/** So sánh 3 font ứng viên bằng cùng một đoạn tiếng Việt, đúng cỡ chữ app dùng, kèm kiểm tra đủ chữ. */
export function FontsPage() {
  // Tên font đang dùng do src/styles/fonts/<tên>.css khai báo qua biến --callone-font.
  const [current] = useState(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--callone-font')
      .replace(/['" ]/g, ''),
  )

  return (
    <>
      <PageHeader title="So sánh font" subtitle="Cùng một đoạn tiếng Việt, 3 font tự host" backHref="/dev" />
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 md:px-6 lg:grid-cols-3">
        {CANDIDATES.map((candidate) => (
          <Specimen key={candidate.id} candidate={candidate} current={current} />
        ))}
      </div>
    </>
  )
}
