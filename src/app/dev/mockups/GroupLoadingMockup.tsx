import { PageBody } from '@/shared/ui/PageBody'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/skeleton'

/** Đang tải nhóm: khung giống thật để trang không nhảy khi dữ liệu về. */
export function GroupLoadingMockup() {
  return (
    <>
      <PageHeader title={<span className="inline-block h-5 w-40 animate-pulse rounded-md bg-muted align-middle" />}
        subtitle={<span className="mt-1 inline-block h-3.5 w-24 animate-pulse rounded-md bg-muted align-middle" />} backHref="/dev/mockups/bill-split-home">
        <div className="flex h-11 items-center gap-8 border-b px-6">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6 pt-5" aria-busy="true">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  )
}
