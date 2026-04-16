// 개발: VITE_API_URL 미설정 → Vite 프록시가 /api/* → localhost:8000 으로 전달
// 프로덕션: VITE_API_URL=https://xxx.onrender.com 설정 필요
export const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
