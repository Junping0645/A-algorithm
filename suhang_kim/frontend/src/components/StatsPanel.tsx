import { useState } from 'react'
import toast from 'react-hot-toast'
import type { CompareResult, CompareRecord } from '../types'
import styles from './StatsPanel.module.css'

const SHEETS_URL = import.meta.env.VITE_SHEET_URL as string | undefined

interface Props {
  compareResult: CompareResult | null
  history:       CompareRecord[]
  onRecordSent:  (idx: number) => void
}

export default function StatsPanel({ compareResult, history, onRecordSent }: Props) {
  const [sending, setSending] = useState<number | null>(null)

  // ── 시트 전송 ────────────────────────────────────────────
  const sendToSheet = async (record: CompareRecord, idx: number) => {
    if (!SHEETS_URL) {
      toast.error('VITE_SHEET_URL 이 .env 에 없습니다.')
      return
    }
    setSending(idx)
    try {
      await fetch(SHEETS_URL, {
        method: 'POST',
        mode:   'no-cors',   // Apps Script는 CORS 헤더를 안 보내므로 no-cors
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: record.timestamp,
          region:    record.region,
          start:     record.startNode,
          goal:      record.goalNode,
          astar: {
            distance: record.astar.total_distance.toFixed(1),
            time_ms:  record.astar.computation_time_ms,
            nodes:    record.astar.nodes_explored,
          },
          dijkstra: {
            distance: record.dijkstra.total_distance.toFixed(1),
            time_ms:  record.dijkstra.computation_time_ms,
            nodes:    record.dijkstra.nodes_explored,
          },
        }),
      })
      onRecordSent(idx)
      toast.success('스프레드시트에 전송됨')
    } catch {
      toast.error('전송 실패')
    } finally {
      setSending(null)
    }
  }

  // ── 전체 CSV 다운로드 ─────────────────────────────────────
  const downloadCSV = () => {
    if (history.length === 0) { toast('기록이 없습니다'); return }
    const header = [
      '시각', '지역',
      'A* 거리(m)', 'A* 시간(ms)', 'A* 탐색노드',
      'Dijkstra 거리(m)', 'Dijkstra 시간(ms)', 'Dijkstra 탐색노드',
    ]
    const rows = history.map(r => [
      r.timestamp, r.region,
      r.astar.total_distance.toFixed(1),     r.astar.computation_time_ms,     r.astar.nodes_explored,
      r.dijkstra.total_distance.toFixed(1),  r.dijkstra.computation_time_ms,  r.dijkstra.nodes_explored,
    ])
    const csv = [header, ...rows].map(row => row.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `pathfinding_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>📊 알고리즘 비교</h2>

      {/* ── 최신 결과 ── */}
      {compareResult ? (
        <>
          <div className={styles.compareHeader}>
            <div className={styles.algoLabel} style={{ color: '#58a6ff' }}>A*</div>
            <div className={styles.algoLabel} style={{ color: '#f0883e' }}>Dijkstra</div>
          </div>

          <CompareRow label="경로 거리"
            astar={`${compareResult.astar.total_distance.toFixed(0)} m`}
            dijkstra={`${compareResult.dijkstra.total_distance.toFixed(0)} m`}
            winner={compareResult.astar.total_distance <= compareResult.dijkstra.total_distance ? 'astar' : 'dijkstra'}
          />
          <CompareRow label="계산 시간"
            astar={`${compareResult.astar.computation_time_ms} ms`}
            dijkstra={`${compareResult.dijkstra.computation_time_ms} ms`}
            winner={compareResult.astar.computation_time_ms <= compareResult.dijkstra.computation_time_ms ? 'astar' : 'dijkstra'}
          />
          <CompareRow label="탐색 노드"
            astar={`${compareResult.astar.nodes_explored}`}
            dijkstra={`${compareResult.dijkstra.nodes_explored}`}
            winner={compareResult.astar.nodes_explored <= compareResult.dijkstra.nodes_explored ? 'astar' : 'dijkstra'}
          />
          <CompareRow label="경로 노드"
            astar={`${compareResult.astar.path.length}`}
            dijkstra={`${compareResult.dijkstra.path.length}`}
          />

          <section className={styles.section} style={{ marginTop: 16 }}>
            <h3 className={styles.sectionTitle}>⚡ 효율 분석 (A* 절감률)</h3>
            <EfficiencyBar label="탐색 노드"
              value={compareResult.dijkstra.nodes_explored}
              reduced={compareResult.astar.nodes_explored}
              color="#58a6ff"
            />
            <EfficiencyBar label="계산 시간"
              value={compareResult.dijkstra.computation_time_ms}
              reduced={compareResult.astar.computation_time_ms}
              color="#58a6ff"
            />
          </section>
        </>
      ) : (
        <p className={styles.empty}>비교 실행 전입니다.<br />출발지·목적지 설정 후<br />'비교' 버튼을 누르세요.</p>
      )}

      {/* ── 기록 & 내보내기 ── */}
      {history.length > 0 && (
        <section className={styles.section}>
          <div className={styles.historyHeader}>
            <h3 className={styles.sectionTitle}>🗒 기록 ({history.length}회)</h3>
            <button className={styles.csvBtn} onClick={downloadCSV} title="CSV 다운로드">
              ⬇ CSV
            </button>
          </div>

          <div className={styles.historyList}>
            {[...history].reverse().map((rec, i) => {
              const idx = history.length - 1 - i
              return (
                <div key={idx} className={styles.historyItem}>
                  <div className={styles.historyMeta}>
                    <span className={styles.historyRegion}>{rec.region}</span>
                    <span className={styles.historyTime}>{rec.timestamp.slice(11, 19)}</span>
                  </div>
                  <div className={styles.historyVals}>
                    <span style={{ color: '#58a6ff' }}>{rec.astar.total_distance.toFixed(0)}m / {rec.astar.computation_time_ms}ms</span>
                    <span style={{ color: '#f0883e' }}>{rec.dijkstra.total_distance.toFixed(0)}m / {rec.dijkstra.computation_time_ms}ms</span>
                  </div>
                  <button
                    className={`${styles.sheetBtn} ${rec.sentToSheet ? styles.sent : ''}`}
                    onClick={() => sendToSheet(rec, idx)}
                    disabled={rec.sentToSheet || sending === idx}
                    title="Google Sheets 전송"
                  >
                    {sending === idx ? '…' : rec.sentToSheet ? '✓' : '📤'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ── 서브 컴포넌트 ──────────────────────────────────────────
function CompareRow({ label, astar, dijkstra, winner }: {
  label: string; astar: string; dijkstra: string; winner?: 'astar' | 'dijkstra'
}) {
  return (
    <div className={styles.compareRow}>
      <div className={styles.compareLabel}>{label}</div>
      <div className={styles.compareVals}>
        <span className={styles.compareVal} style={{ color: '#58a6ff', fontWeight: winner === 'astar' ? 700 : 400 }}>
          {winner === 'astar' && <span className={styles.crown}>★</span>}{astar}
        </span>
        <span className={styles.compareVal} style={{ color: '#f0883e', fontWeight: winner === 'dijkstra' ? 700 : 400 }}>
          {winner === 'dijkstra' && <span className={styles.crown}>★</span>}{dijkstra}
        </span>
      </div>
    </div>
  )
}

function EfficiencyBar({ label, value, reduced, color }: {
  label: string; value: number; reduced: number; color: string
}) {
  const pct = value > 0 ? Math.max(0, Math.min(100, (1 - reduced / value) * 100)) : 0
  return (
    <div className={styles.effRow}>
      <div className={styles.effLabel}>{label}</div>
      <div className={styles.effBar}>
        <div className={styles.effFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className={styles.effPct}>{pct.toFixed(0)}%</div>
    </div>
  )
}
