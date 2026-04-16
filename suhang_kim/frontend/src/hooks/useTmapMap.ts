/**
 * 지도 훅 — Leaflet + OSM 타일 기반
 * (TMAP JS SDK의 document.write 방식이 모던 브라우저에서 막혀 Leaflet으로 대체)
 *
 * MapView.tsx 가 사용하는 인터페이스는 동일하게 유지됨.
 */
import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet 기본 마커 아이콘 경로 수정 (Vite 환경)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

interface UseTmapMapOptions {
  center: [number, number]   // [lat, lng]
  zoom?:  number
}

export function useTmapMap(
  containerRef: React.RefObject<HTMLDivElement>,
  options: UseTmapMapOptions,
) {
  const mapRef       = useRef<L.Map | null>(null)
  const polylinesRef = useRef<L.Polyline[]>([])
  const markersRef   = useRef<L.Marker[]>([])

  // ── 지도 초기화 ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center:        options.center,
      zoom:          options.zoom ?? 14,
      zoomControl:   true,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:     19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current   = null
      polylinesRef.current = []
      markersRef.current   = []
    }
  }, []) // eslint-disable-line

  // ── 좌표 → 캔버스 픽셀 ───────────────────────────────
  const coordToOffset = useCallback(
    (lat: number, lng: number): { x: number; y: number } | null => {
      if (!mapRef.current) return null
      const pt = mapRef.current.latLngToContainerPoint([lat, lng])
      return { x: pt.x, y: pt.y }
    },
    [],
  )

  // ── 폴리라인 ─────────────────────────────────────────
  const drawPolyline = useCallback(
    (coords: [number, number][], color: string, weight: number, opacity = 1) => {
      if (!mapRef.current) return null
      const line = L.polyline(coords, { color, weight, opacity }).addTo(mapRef.current)
      polylinesRef.current.push(line)
      return line
    },
    [],
  )

  const removePolyline = useCallback((line: any) => {
    if (!line) return
    line.remove()
    polylinesRef.current = polylinesRef.current.filter(p => p !== line)
  }, [])

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach(p => p.remove())
    polylinesRef.current = []
  }, [])

  // ── 마커 ─────────────────────────────────────────────
  const addMarker = useCallback(
    (lat: number, lng: number, _iconUrl?: string, label?: string) => {
      if (!mapRef.current) return null
      const marker = L.marker([lat, lng])
        .addTo(mapRef.current)
      if (label) marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10] }).openTooltip()
      markersRef.current.push(marker)
      return marker
    },
    [],
  )

  const removeMarker = useCallback((marker: any) => {
    if (!marker) return
    marker.remove()
    markersRef.current = markersRef.current.filter(m => m !== marker)
  }, [])

  // ── 클릭 이벤트 ──────────────────────────────────────
  const onMapClick = useCallback(
    (handler: (lat: number, lng: number) => void) => {
      mapRef.current?.on('click', (e: L.LeafletMouseEvent) => {
        handler(e.latlng.lat, e.latlng.lng)
      })
    },
    [],
  )

  const onMapRightClick = useCallback(
    (handler: (lat: number, lng: number) => void) => {
      mapRef.current?.on('contextmenu', (e: L.LeafletMouseEvent) => {
        handler(e.latlng.lat, e.latlng.lng)
      })
    },
    [],
  )

  return {
    map: mapRef,
    coordToOffset,
    drawPolyline,
    removePolyline,
    clearPolylines,
    addMarker,
    removeMarker,
    onMapClick,
    onMapRightClick,
  }
}
