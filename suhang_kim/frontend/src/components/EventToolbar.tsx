import type { ToolMode } from '../types'
import styles from './EventToolbar.module.css'

interface Props {
  toolMode: ToolMode
  setToolMode: (m: ToolMode) => void
}

const TOOLS: { mode: ToolMode; label: string; icon: string; title: string }[] = [
  { mode: 'select',     label: '이동',  icon: '✋', title: '지도 이동 · 좌클릭: 출발지 · 우클릭: 목적지' },
  { mode: 'block',      label: '차단',  icon: '🚧', title: '도로 차단 (도로 클릭)' },
  { mode: 'accident',   label: '사고',  icon: '💥', title: '사고 발생 (도로 클릭)' },
  { mode: 'congestion', label: '혼잡',  icon: '🚗', title: '교통 혼잡 설정 (도로 클릭)' },
]

export default function EventToolbar({ toolMode, setToolMode }: Props) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.hint}>
        🟢 좌클릭 <span className={styles.sep}>·</span> 🔴 우클릭
      </div>

      <div className={styles.divider} />

      {TOOLS.map(t => (
        <button
          key={t.mode}
          title={t.title}
          className={`${styles.btn} ${toolMode === t.mode ? styles.active : ''}`}
          onClick={() => setToolMode(t.mode)}
        >
          <span className={styles.icon}>{t.icon}</span>
          <span className={styles.label}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
