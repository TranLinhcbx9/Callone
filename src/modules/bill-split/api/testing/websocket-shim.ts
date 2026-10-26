/**
 * Chỉ dùng cho test tích hợp chạy trên Node 20, code chạy thật không import file này.
 *
 * Node 20 chưa có WebSocket toàn cục, mà supabase-js tạo sẵn client Realtime ngay trong createClient
 * và ném lỗi "Node.js 20 detected without native WebSocket support" nếu thiếu. Test tích hợp chỉ gọi RPC
 * qua HTTP, không dùng Realtime, nên một lớp giả là đủ để qua bước kiểm tra đó (trình duyệt và Node 22 trở lên
 * không cần). Phải import file này trước mọi thứ kéo theo supabase client.
 */
if (typeof globalThis.WebSocket === 'undefined') {
  class UnusedWebSocket {
    constructor() {
      throw new Error('Test tích hợp không dùng Realtime nên không có WebSocket thật')
    }
  }
  Object.defineProperty(globalThis, 'WebSocket', { value: UnusedWebSocket, configurable: true, writable: true })
}
