// expect(giá trị, thông điệp) là cú pháp hợp lệ của Vitest, còn rule valid-expect của plugin chỉ biết Jest.
/* oxlint-disable vitest/valid-expect */
import { describe, expect, it } from 'vitest'
import {
  mergeMemberNames,
  normalizeName,
  validateCreateGroup,
  validateGroupName,
  validateMemberNames,
} from '@/modules/bill-split/domain/groupForm'

describe('normalizeName', () => {
  it('cắt hai đầu, gộp khoảng trắng, chuẩn hóa NFC', () => {
    expect(normalizeName('  Đà   Lạt \n 3N2Đ ')).toBe('Đà Lạt 3N2Đ')
    // "Hưng" viết dạng NFD (chữ u, dấu móc và dấu rời) phải về đúng dạng NFC.
    const decomposed = 'Hưng'.normalize('NFD')
    expect(normalizeName(decomposed)).toBe('Hưng')
    expect(normalizeName(decomposed).length).toBe(4)
  })
})

describe('validateGroupName', () => {
  it('tên rỗng hoặc chỉ khoảng trắng là lỗi', () => {
    expect(validateGroupName('')).toBe('Nhập tên nhóm.')
    expect(validateGroupName('   ')).toBe('Nhập tên nhóm.')
  })

  it('tối đa 80 ký tự, đếm theo ký tự chứ không theo đơn vị UTF-16', () => {
    expect(validateGroupName('a'.repeat(80))).toBeNull()
    expect(validateGroupName('a'.repeat(81))).toContain('80')
    expect(validateGroupName('😀'.repeat(80))).toBeNull()
    expect(validateGroupName('😀'.repeat(81))).toContain('80')
  })

  it('tên bình thường hợp lệ', () => {
    expect(validateGroupName('Đà Lạt 3N2Đ')).toBeNull()
  })
})

describe('validateMemberNames', () => {
  it('danh sách rỗng là lỗi', () => {
    expect(validateMemberNames([])).toBe('Thêm ít nhất một thành viên.')
  })

  it('một người là đủ', () => {
    expect(validateMemberNames(['Linh'])).toBeNull()
  })

  it('quá 50 người là lỗi', () => {
    const names = Array.from({ length: 51 }, (_, index) => `Người ${index}`)
    expect(validateMemberNames(names)).toContain('50')
    expect(validateMemberNames(names.slice(0, 50))).toBeNull()
  })

  it('tên quá 40 ký tự hoặc rỗng là lỗi', () => {
    expect(validateMemberNames(['a'.repeat(40)])).toBeNull()
    expect(validateMemberNames(['a'.repeat(41)])).toContain('40')
    expect(validateMemberNames(['Linh', '  '])).toBe('Tên thành viên không được để trống.')
  })

  it('tên trùng không phân biệt hoa thường, dấu tiếng Việt và khoảng trắng thừa', () => {
    expect(validateMemberNames(['Linh', 'linh'])).toBe('Có hai thành viên cùng tên "linh".')
    expect(validateMemberNames(['Hưng', 'HƯNG'])).toContain('HƯNG')
    expect(validateMemberNames(['Hưng', 'Hung'])).toBeNull()
    expect(validateMemberNames(['Văn  Linh', 'văn linh'])).not.toBeNull()
  })
})

describe('validateCreateGroup', () => {
  it('hợp lệ thì null', () => {
    expect(validateCreateGroup({ name: 'Đà Lạt', memberNames: ['Linh', 'Hưng'] })).toBeNull()
  })

  it('chỉ báo ô nào có lỗi', () => {
    expect(validateCreateGroup({ name: '', memberNames: ['Linh'] })).toEqual({ name: 'Nhập tên nhóm.' })
    expect(validateCreateGroup({ name: 'Đà Lạt', memberNames: [] })).toEqual({ members: 'Thêm ít nhất một thành viên.' })
  })

  it('báo cả hai khi cùng sai', () => {
    expect(validateCreateGroup({ name: ' ', memberNames: [] })).toEqual({
      name: 'Nhập tên nhóm.',
      members: 'Thêm ít nhất một thành viên.',
    })
  })
})

describe('mergeMemberNames', () => {
  it('thêm tên đang gõ dở, tách bằng dấu phẩy', () => {
    expect(mergeMemberNames(['Linh'], ' Hưng , Mai ')).toEqual(['Linh', 'Hưng', 'Mai'])
  })

  it('bỏ tên rỗng và tên trùng, trả đúng mảng cũ nếu không có gì mới', () => {
    const existing = ['Linh', 'Hưng']
    expect(mergeMemberNames(existing, '')).toBe(existing)
    expect(mergeMemberNames(existing, '  ,  ')).toBe(existing)
    expect(mergeMemberNames(existing, 'linh, HƯNG')).toBe(existing)
    expect(mergeMemberNames(existing, 'linh, Mai')).toEqual(['Linh', 'Hưng', 'Mai'])
  })

  it('dừng khi đủ số người tối đa và cắt tên quá dài', () => {
    expect(mergeMemberNames(['A', 'B'], 'C, D', 3)).toEqual(['A', 'B', 'C'])
    expect(mergeMemberNames([], 'abcdef', 50, 4)).toEqual(['abcd'])
  })

  it('gộp khoảng trắng bên trong tên', () => {
    expect(mergeMemberNames([], 'Văn   Linh')).toEqual(['Văn Linh'])
  })
})
