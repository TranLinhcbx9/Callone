import { useState } from 'react'
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { GallerySection } from '@/app/dev/ui/GallerySection'
import { ResponsiveDialog } from '@/shared/ui/ResponsiveDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

export function OverlaysSection() {
  const [dialog, setDialog] = useState(false)
  const [alert, setAlert] = useState(false)

  return (
    <GallerySection
      id="lop-phu"
      title="Hộp thoại, menu, toast"
      description="ResponsiveDialog: ngăn kéo từ dưới lên trên điện thoại, hộp thoại giữa màn hình từ 768px. Thu nhỏ cửa sổ để thấy hai dạng."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDialog(true)}>
          ResponsiveDialog
        </Button>
        <Button variant="outline" onClick={() => setAlert(true)}>
          AlertDialog
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Menu">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>
              <PencilIcon />
              Đổi tên nhóm
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2Icon />
              Xóa nhóm
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => toast('Đã lưu khoản chi')}>
          Toast
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.success('Đã xóa khoản chi', { action: { label: 'Hoàn tác', onClick: () => undefined } })}
        >
          Toast hoàn tác
        </Button>
        <Button variant="outline" onClick={() => toast.error('Người khác vừa sửa khoản chi này')}>
          Toast lỗi
        </Button>
      </div>
      <ResponsiveDialog
        open={dialog}
        onOpenChange={setDialog}
        title="Tiêu đề hộp thoại"
        description="Mô tả ngắn một dòng."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Hủy
            </Button>
            <Button onClick={() => setDialog(false)}>Đồng ý</Button>
          </>
        }
      >
        <p className="text-body text-muted-foreground">Nội dung tự cuộn khi dài. Footer luôn thấy được.</p>
      </ResponsiveDialog>
      <AlertDialog open={alert} onOpenChange={setAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa khoản chi này?</AlertDialogTitle>
            <AlertDialogDescription>Bạn có thể hoàn tác ngay sau khi xóa.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction variant="danger">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GallerySection>
  )
}
