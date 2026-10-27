import type { FormEvent } from 'react'
import { Trash2Icon } from 'lucide-react'
import { BankPicker } from '@/modules/bill-split/components/BankPicker'
import { normalizeAccountName, normalizeAccountNumber } from '@/modules/bill-split/domain/text'
import type { Bank } from '@/modules/bill-split/domain/types'
import { Field } from '@/shared/ui/Field'
import { Spinner } from '@/shared/ui/Spinner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface MemberFormValues {
  name: string
  /** Mã BIN ngân hàng, null khi chưa chọn. */
  bankBin: string | null
  accountNumber: string
  accountName: string
}

export interface MemberFormProps {
  values: MemberFormValues
  onChange: (patch: Partial<MemberFormValues>) => void
  banks: readonly Bank[]
  bankFilter?: (banks: readonly Bank[], query: string) => Bank[]
  errors?: Partial<Record<'name' | 'bank' | 'accountNumber' | 'accountName', string>>
  onSubmit: () => void
  onCancel?: () => void
  /** Chỉ truyền khi sửa một người có sẵn. Người đã có khoản chi không xóa được, nơi gọi tự báo lỗi. */
  onDelete?: () => void
  isSaving?: boolean
  isNew?: boolean
}

/**
 * Form thành viên: tên, và tuỳ chọn ngân hàng, số tài khoản, tên chủ tài khoản để tạo mã VietQR.
 * Thường đặt trong ResponsiveDialog. Ngân hàng và số tài khoản đi cùng nhau, nơi gọi kiểm "có cả hai hoặc không có gì".
 * Rời ô số tài khoản thì bỏ khoảng trắng, rời ô tên chủ tài khoản thì đổi thành chữ hoa không dấu, để ô hiện đúng
 * thứ sẽ được lưu (người dùng gõ "Nguyễn Văn Linh" thì thấy "NGUYEN VAN LINH").
 */
export function MemberForm({
  values,
  onChange,
  banks,
  bankFilter,
  errors,
  onSubmit,
  onCancel,
  onDelete,
  isSaving,
  isNew,
}: MemberFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Tên" htmlFor="member-name" error={errors?.name}>
        <Input
          id="member-name"
          value={values.name}
          onChange={(event) => onChange({ name: event.target.value })}
          maxLength={40}
          placeholder="Ví dụ: Linh"
          autoComplete="off"
          aria-invalid={errors?.name ? true : undefined}
        />
      </Field>

      <fieldset className="flex flex-col gap-5 rounded-xl border border-border bg-muted/40 p-4">
        <legend className="-ml-1 px-1 text-small font-medium text-muted-foreground">Nhận tiền qua mã QR (không bắt buộc)</legend>
        <Field label="Ngân hàng" htmlFor="member-bank" error={errors?.bank}>
          <BankPicker
            id="member-bank"
            banks={banks}
            filter={bankFilter}
            value={values.bankBin}
            onChange={(bank) => onChange({ bankBin: bank.bin })}
            invalid={Boolean(errors?.bank)}
          />
        </Field>
        <Field label="Số tài khoản" htmlFor="member-account" error={errors?.accountNumber}>
          <Input
            id="member-account"
            value={values.accountNumber}
            onChange={(event) => onChange({ accountNumber: event.target.value })}
            onBlur={() => {
              const clean = normalizeAccountNumber(values.accountNumber)
              if (clean !== values.accountNumber) onChange({ accountNumber: clean })
            }}
            inputMode="numeric"
            maxLength={24}
            placeholder="Ví dụ: 0123456789"
            autoComplete="off"
            aria-invalid={errors?.accountNumber ? true : undefined}
            className="tnum"
          />
        </Field>
        <Field
          label="Tên chủ tài khoản"
          htmlFor="member-holder"
          optional
          hint="Viết hoa không dấu, ví dụ NGUYEN VAN LINH."
          error={errors?.accountName}
        >
          <Input
            id="member-holder"
            value={values.accountName}
            onChange={(event) => onChange({ accountName: event.target.value })}
            onBlur={() => {
              const clean = normalizeAccountName(values.accountName)
              if (clean !== values.accountName) onChange({ accountName: clean })
            }}
            maxLength={50}
            autoCapitalize="characters"
            autoComplete="off"
            aria-invalid={errors?.accountName ? true : undefined}
          />
        </Field>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {onCancel && (
          // Không khóa khi đang lưu: lần lưu có thể treo lâu lúc mất mạng, người dùng vẫn phải thoát ra được.
          <Button type="button" variant="outline" onClick={onCancel}>
            Hủy
          </Button>
        )}
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Spinner />}
          {isNew ? 'Thêm thành viên' : 'Lưu'}
        </Button>
      </div>
      {onDelete && (
        <Button
          id="member-delete"
          type="button"
          variant="ghost"
          className="-mt-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={isSaving}
        >
          <Trash2Icon />
          Xóa thành viên
        </Button>
      )}
    </form>
  )
}
