import { useState } from 'react'
import { PlusIcon, SearchIcon, ShareIcon, Trash2Icon } from 'lucide-react'
import { BANKS } from '@/app/dev/fixtures'
import { GallerySection, Specimen } from '@/app/dev/ui/GallerySection'
import { BankPicker } from '@/modules/bill-split/components/BankPicker'
import { searchBanks } from '@/modules/bill-split/domain/banks'
import { ChipInput } from '@/shared/ui/ChipInput'
import { Field } from '@/shared/ui/Field'
import { MemberAvatar } from '@/shared/ui/MemberAvatar'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { MoneyText } from '@/shared/ui/MoneyText'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Spinner } from '@/shared/ui/Spinner'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

const VARIANTS = ['default', 'soft', 'secondary', 'outline', 'ghost', 'destructive', 'danger', 'link'] as const

export function ControlsSection() {
  const [money, setMoney] = useState('1tr2')
  const [names, setNames] = useState(['Linh', 'Hưng'])
  const [mode, setMode] = useState<'equal' | 'exact'>('equal')
  const [bank, setBank] = useState<string | null>('970423')
  const [checked, setChecked] = useState(true)

  return (
    <GallerySection id="dieu-khien" title="Nút và ô nhập" description="Mỗi màn hình chỉ một nút màu nhấn. Nút chính ở chân màn hình cao 48px.">
      <Specimen label="Button: variant">
        <div className="flex flex-wrap gap-2">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
      </Specimen>
      <Specimen label="Button: size (xs 28, sm 32, default 40, lg 48) và icon">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button>default</Button>
          <Button size="lg">lg</Button>
          <Button size="icon-sm" variant="outline" aria-label="Tìm"><SearchIcon /></Button>
          <Button size="icon" variant="outline" aria-label="Chia sẻ"><ShareIcon /></Button>
          <Button size="icon-lg" variant="destructive" aria-label="Xóa"><Trash2Icon /></Button>
          <Button><PlusIcon />Có icon</Button>
          <Button disabled><Spinner />Đang lưu…</Button>
          <Button disabled variant="outline">Bị khóa</Button>
        </div>
      </Specimen>
      <Specimen label="Badge">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>default</Badge>
          <Badge variant="secondary">Sắp có</Badge>
          <Badge variant="soft">Bạn</Badge>
          <Badge variant="positive">Đã cân bằng</Badge>
          <Badge variant="negative">Còn nợ</Badge>
          <Badge variant="warning">Còn thiếu</Badge>
          <Badge variant="outline">outline</Badge>
        </div>
      </Specimen>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Input" htmlFor="g-input" hint="Chữ 16px trên điện thoại, 14px từ md.">
          <Input id="g-input" placeholder="Ví dụ: Lẩu gà lá é" />
        </Field>
        <Field label="Input có lỗi" htmlFor="g-input-err" error="Nhập tiêu đề cho khoản chi.">
          <Input id="g-input-err" aria-invalid defaultValue="" placeholder="Tiêu đề" />
        </Field>
        <Field label="Ghi chú" htmlFor="g-note" optional>
          <Textarea id="g-note" rows={2} placeholder="Ví dụ: Quán gần chợ đêm" />
        </Field>
        <Field label="Ngân hàng" htmlFor="g-bank">
          <BankPicker id="g-bank" banks={BANKS} filter={searchBanks} value={bank} onChange={(b) => setBank(b.bin)} />
        </Field>
      </div>
      <Specimen label="MoneyInput (lg): gõ 150k, 1tr2, 2,5tr, 1 triệu. Có nút gõ nhanh">
        <MoneyInput size="lg" value={money} onChange={setMoney} preview={money ? '= 1.200.000 ₫' : null} hint="Gõ 150k, 1tr2 hoặc 1.200.000" />
      </Specimen>
      <div className="grid gap-5 sm:grid-cols-2">
        <Specimen label="MoneyInput (md) có lỗi">
          <MoneyInput size="md" value="12 củ" onChange={() => undefined} error="Chưa hiểu số tiền này." aria-label="Số tiền" />
        </Specimen>
        <Specimen label="SegmentedControl">
          <SegmentedControl ariaLabel="Cách chia" value={mode} onValueChange={setMode} options={[{ value: 'equal', label: 'Chia đều' }, { value: 'exact', label: 'Số tiền riêng' }]} />
        </Specimen>
      </div>
      <Specimen label="ChipInput: gõ tên rồi bấm Enter hoặc dấu phẩy">
        <ChipInput values={names} onValuesChange={setNames} renderLeading={(v) => <MemberAvatar name={v} size="sm" />} />
      </Specimen>
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2.5 text-body">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          Checkbox
        </label>
        <div className="flex items-center gap-3">
          <MemberAvatar name="Nguyễn Văn Linh" colorKey="a" size="xs" />
          <MemberAvatar name="Nguyễn Văn Linh" colorKey="b" size="sm" />
          <MemberAvatar name="Trần Thị Mai" colorKey="c" />
          <MemberAvatar name="Lê Anh Tú" colorKey="d" size="lg" />
          <MemberAvatar name="Đức" colorKey="e" size="xl" />
          <span className="text-small text-muted-foreground">chữ cái lấy từ từ cuối của tên</span>
        </div>
        <div className="flex items-center gap-4">
          <MoneyText amount={1250000} size="lg" weight="semibold" />
          <MoneyText amount={940000} sign="always" tone="auto" size="lg" weight="semibold" />
          <MoneyText amount={-150000} sign="always" tone="auto" size="lg" weight="semibold" />
          <MoneyText amount={0} tone="auto" size="lg" />
        </div>
      </div>
    </GallerySection>
  )
}
