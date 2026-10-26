// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import {
  normalizeAccountName,
  normalizeAccountNumber,
  normalizeSearch,
  stripDiacritics,
  toTransferMessage,
} from '@/modules/bill-split/domain/text'
import { createRng } from '@/modules/bill-split/domain/testing/prng'

describe('stripDiacritics', () => {
  it.each<[string, string]>([
    ['Đường Điện Biên Phủ', 'Duong Dien Bien Phu'],
    ['Lẩu gà lá é', 'Lau ga la e'],
    ['ĐÀ LẠT 3N2Đ', 'DA LAT 3N2D'],
    ['đồng', 'dong'],
    ['Nguyễn Thị Hương', 'Nguyen Thi Huong'],
    ['Trần Quốc Tuấn', 'Tran Quoc Tuan'],
    ['Phở bò, bún chả & cà phê sữa đá!', 'Pho bo, bun cha & ca phe sua da!'],
    ['', ''],
    ['abc XYZ 123 - /!', 'abc XYZ 123 - /!'],
  ])('%j thành %j', (input, expected) => {
    expect(stripDiacritics(input)).toBe(expected)
  })

  it('bỏ dấu của mọi nguyên âm tiếng Việt với đủ 6 thanh', () => {
    const accented =
      'aáàảãạ ăắằẳẵặ âấầẩẫậ eéèẻẽẹ êếềểễệ iíìỉĩị oóòỏõọ ôốồổỗộ ơớờởỡợ uúùủũụ ưứừửữự yýỳỷỹỵ'
    const plain = 'aaaaaa aaaaaa aaaaaa eeeeee eeeeee iiiiii oooooo oooooo oooooo uuuuuu uuuuuu yyyyyy'
    expect(stripDiacritics(accented)).toBe(plain)
    expect(stripDiacritics(accented.toUpperCase())).toBe(plain.toUpperCase())
  })

  it('xử lý như nhau cho dạng dựng sẵn (NFC) và dạng tổ hợp (NFD)', () => {
    const text = 'Nguyễn Văn Ơn đã ăn phở'
    expect(stripDiacritics(text.normalize('NFC'))).toBe('Nguyen Van On da an pho')
    expect(stripDiacritics(text.normalize('NFD'))).toBe('Nguyen Van On da an pho')
  })
})

describe('normalizeSearch', () => {
  it.each<[string, string]>([
    ['Ngân Hàng  Á Châu ', 'ngan hang a chau'],
    ['ĐÔNG Á', 'dong a'],
    ['  Vietcombank\t', 'vietcombank'],
    ['Quân\nđội', 'quan doi'],
    ['', ''],
    ['   ', ''],
  ])('%j thành %j', (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected)
  })

  it('hai cách gõ dấu cho cùng kết quả', () => {
    expect(normalizeSearch('TRIỆU'.normalize('NFD'))).toBe(normalizeSearch('triệu'))
  })
})

describe('toTransferMessage', () => {
  it.each<[string, string]>([
    ['Chuyển tiền ăn', 'Chuyen tien an'],
    ['Lẩu gà lá é - 26/10', 'Lau ga la e 26 10'],
    ["don't stop", 'dont stop'],
    ['Linh’s trip', 'Linhs trip'],
    ['  nhiều   khoảng \t trắng ', 'nhieu khoang trang'],
    ['Đà Lạt 3N2Đ', 'Da Lat 3N2D'],
    ['Cơm 🍚 trưa', 'Com trua'],
    ['你好 abc', 'abc'],
    ['A&B/C_D', 'A B C D'],
    ['Trả nợ #1', 'Tra no 1'],
    ['', ''],
    ['!!! --- ???', ''],
    ['DH123456', 'DH123456'],
  ])('%j thành %j', (input, expected) => {
    expect(toTransferMessage(input)).toBe(expected)
  })

  it('cắt ở 25 ký tự và không để khoảng trắng thừa ở cuối', () => {
    expect(toTransferMessage('Chia tiền chuyến đi Đà Lạt tháng mười')).toBe('Chia tien chuyen di Da La')
    // ký tự thứ 25 là khoảng trắng thì bị bỏ
    expect(toTransferMessage('abcdefghijklmnopqrstuvwx yz')).toBe('abcdefghijklmnopqrstuvwx')
    expect(toTransferMessage('a'.repeat(40))).toBe('a'.repeat(25))
    expect(toTransferMessage('a'.repeat(25))).toBe('a'.repeat(25))
  })

  it('tôn trọng maxLength tùy chỉnh', () => {
    expect(toTransferMessage('Chuyen tien an trua', 10)).toBe('Chuyen tie')
    expect(toTransferMessage('Chuyen tien an trua', 5.9)).toBe('Chuye')
    expect(toTransferMessage('Chuyen tien', 0)).toBe('')
    expect(toTransferMessage('Chuyen tien', -3)).toBe('')
    expect(toTransferMessage('Chuyen tien', Number.NaN)).toBe('')
    expect(toTransferMessage('x'.repeat(100), 50)).toBe('x'.repeat(50))
  })

  it('luôn chỉ ra chữ, số, khoảng trắng đơn, đã trim và không dài quá giới hạn', () => {
    const rng = createRng(2024)
    const alphabet = [...'abcXYZ019 -/_&\'’\t', ...'ăâđêôơưÀÉỆỤ', ...'🍚你é']
    for (let i = 0; i < 2000; i++) {
      let text = ''
      for (let c = rng.int(0, 60); c > 0; c--) text += rng.pick(alphabet)
      const limit = rng.int(1, 40)
      const message = toTransferMessage(text, limit)
      expect(message.length, text).toBeLessThanOrEqual(limit)
      expect(message === '' || /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/.test(message), JSON.stringify(text)).toBe(true)
    }
  })
})

describe('normalizeAccountName', () => {
  it.each<[string, string]>([
    ['Nguyễn Văn Linh', 'NGUYEN VAN LINH'],
    ['  đặng   thị  hoa ', 'DANG THI HOA'],
    ['NGUYEN VAN LINH', 'NGUYEN VAN LINH'],
    ['', ''],
  ])('%j thành %j', (input, expected) => {
    expect(normalizeAccountName(input)).toBe(expected)
  })
})

describe('normalizeAccountNumber', () => {
  it.each<[string, string]>([
    ['0123456789', '0123456789'],
    ['0123 4567 89', '0123456789'],
    [' 0123\t4567\u00a089 ', '0123456789'],
    ['', ''],
  ])('%j thành %j', (input, expected) => {
    expect(normalizeAccountNumber(input)).toBe(expected)
  })
})
