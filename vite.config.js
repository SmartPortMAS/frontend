import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 백엔드 포트를 한 곳에서만 정한다.
//
// 예전에는 앱 코드(backendAdapter)가 'http://localhost:8000' 를 직접 들고 있어서,
// 사람마다 uvicorn 을 띄우는 방식이 다르면(관제시스템_시작.bat 은 --port 8001,
// 맨손으로 uvicorn 을 띄우면 기본값 8000) 화면이 통째로 "연결 끊김"이 됐다.
// 실제로 그 값이 8001 <-> 8000 으로 두 번 뒤집혔다(2026-08-17, 08-19).
//
// 이제 앱은 항상 상대경로(/api/v1)로만 부르고, 어느 포트로 보낼지는 여기서만
// 정한다. 다른 포트를 쓰면 .env.local 에 VITE_BACKEND_PORT=8000 한 줄만 두면 된다.
const BACKEND_PORT = process.env.VITE_BACKEND_PORT || '8001'
// 호스트는 반드시 127.0.0.1 — 'localhost' 로 두면 Windows 에서 Node 가 IPv6(::1)를
// 먼저 시도하고, uvicorn 은 127.0.0.1(IPv4)에만 떠 있어 실패 후 재시도한다.
// 그 왕복이 요청마다 약 2초의 고정 오버헤드였다(2026-08-22 실측: 백엔드 직결
// 31ms vs localhost 경유 ~2s). 대시보드는 폴링마다 GET 11개를 보내므로 체감이 컸다.
const BACKEND_HOST = '127.0.0.1' 

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${BACKEND_HOST}:${BACKEND_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
