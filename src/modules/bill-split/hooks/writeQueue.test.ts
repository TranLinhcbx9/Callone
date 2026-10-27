// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { createGroupWriteQueue, groupScopeId, groupWriteQueue } from '@/modules/bill-split/hooks/writeQueue'

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('groupScopeId', () => {
  it('cùng dạng id scope của TanStack Query: bill-split: cộng token', () => {
    expect(groupScopeId('abc')).toBe('bill-split:abc')
  })
})

describe('createGroupWriteQueue', () => {
  it('trả nguyên kết quả của task', async () => {
    const queue = createGroupWriteQueue()
    expect(await queue.run('a', async () => 42)).toBe(42)
  })

  it('cùng token: task sau chỉ bắt đầu khi task trước đã xong, đúng thứ tự xếp hàng', async () => {
    const queue = createGroupWriteQueue()
    const log: string[] = []
    const first = deferred()
    const second = deferred()
    const a = queue.run('t', async () => {
      log.push('a:start')
      await first.promise
      log.push('a:end')
    })
    const b = queue.run('t', async () => {
      log.push('b:start')
      await second.promise
      log.push('b:end')
    })
    const c = queue.run('t', async () => {
      log.push('c:start')
    })
    await flush()
    expect(log).toEqual(['a:start'])
    first.resolve()
    await a
    await flush()
    expect(log).toEqual(['a:start', 'a:end', 'b:start'])
    second.resolve()
    await Promise.all([b, c])
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start'])
  })

  it('task trước lỗi thì task sau vẫn chạy, lỗi chỉ tới đúng người gọi task đó', async () => {
    const queue = createGroupWriteQueue()
    const a = queue.run('t', async () => {
      throw new Error('boom')
    })
    const b = queue.run('t', async () => 'ok')
    await expect(a).rejects.toThrow('boom')
    expect(await b).toBe('ok')
  })

  it('task ném lỗi đồng bộ (không trả promise) cũng thành reject và không chặn hàng đợi', async () => {
    const queue = createGroupWriteQueue()
    const a = queue.run('t', () => {
      throw new Error('sync')
    })
    const b = queue.run('t', async () => 'next')
    await expect(a).rejects.toThrow('sync')
    expect(await b).toBe('next')
  })

  it('token khác nhau chạy song song', async () => {
    const queue = createGroupWriteQueue()
    const slow = deferred()
    const log: string[] = []
    const a = queue.run('x', async () => {
      log.push('x:start')
      await slow.promise
      log.push('x:end')
    })
    const b = queue.run('y', async () => {
      log.push('y:start')
    })
    await b
    expect(log).toEqual(['x:start', 'y:start'])
    slow.resolve()
    await a
  })

  it('xếp hàng xong hết thì lần sau chạy ngay, không bị kẹt sau hàng đợi cũ', async () => {
    const queue = createGroupWriteQueue()
    await queue.run('t', async () => undefined)
    await queue.run('t', async () => {
      throw new Error('x')
    }).catch(() => undefined)
    let ran = false
    const next = queue.run('t', async () => {
      ran = true
    })
    await flush()
    expect(ran).toBe(true)
    await next
  })

  it('nhiều task cùng lúc vẫn chạy đúng thứ tự khi task đầu rất chậm và task sau rất nhanh', async () => {
    const queue = createGroupWriteQueue()
    const order: number[] = []
    const run = (n: number, ms: number) =>
      queue.run('t', async () => {
        await new Promise((resolve) => setTimeout(resolve, ms))
        order.push(n)
      })
    await Promise.all([run(1, 25), run(2, 1), run(3, 10), run(4, 0)])
    expect(order).toEqual([1, 2, 3, 4])
  })
})

describe('groupWriteQueue', () => {
  it('cùng QueryClient thì cùng một hàng đợi, QueryClient khác thì hàng đợi khác', async () => {
    const client = new QueryClient()
    expect(groupWriteQueue(client)).toBe(groupWriteQueue(client))
    expect(groupWriteQueue(new QueryClient())).not.toBe(groupWriteQueue(client))

    // Hai QueryClient khác nhau không chặn nhau dù cùng token.
    const slow = deferred()
    const other = new QueryClient()
    const a = groupWriteQueue(client).run('t', () => slow.promise)
    let otherRan = false
    await groupWriteQueue(other).run('t', async () => {
      otherRan = true
    })
    expect(otherRan).toBe(true)
    slow.resolve()
    await a
  })
})
