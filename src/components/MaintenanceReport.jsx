/**
 * 維護表列印排版元件
 * 版本: v1.0
 * 日期: 2026-03-23
 * 檔案: src/components/MaintenanceReport.jsx
 *
 * 用途：隱藏渲染，供 html2canvas 擷取後輸出為 PDF / 圖片
 * 使用 forwardRef 讓父層取得 DOM ref
 *
 * 固定結構：
 *  - 標題：地動儀系統現場維護表
 *  - 基本資訊：站名、維護日期（民國）、維護人員、主管簽核
 *  - 7 個狀態欄位
 *  - 12 格照片（3列×4欄）
 *  - 備註
 */

import { forwardRef } from 'react'

/** 狀態欄位定義 */
const STATUS_FIELDS = [
  { key: 'environment', label: '環境狀態' },
  { key: 'instrument', label: '儀器狀態' },
  { key: 'communication', label: '通訊狀態' },
  { key: 'router_webserver', label: '路由器 web server' },
  { key: 'sftp', label: 'SFTP 架構' },
  { key: 'raspberry_ssh', label: '樹莓派 ssh 安全殼層通訊協定' },
  { key: 'seedlink', label: 'seedlink 即時地動數據回傳' },
]

/** 12 格照片定義 */
const PHOTO_SLOTS = [
  { key: 'battery_1', label: '電池電量狀況', row: 1 },
  { key: 'battery_2', label: '電池電量狀況', row: 1 },
  { key: 'waterproof', label: '設備的水密檢修', row: 1 },
  { key: 'solar_panel', label: '太陽能板清潔', row: 1 },
  { key: 'wiring', label: '線路狀況', row: 2 },
  { key: 'level_direction', label: '地動儀水平、方位', row: 2 },
  { key: 'seismic_signal', label: '三軸地動訊號', row: 2 },
  { key: 'voltage_regulator', label: '降壓器電壓', row: 2 },
  { key: 'env_before_1', label: '環境整理前', row: 3 },
  { key: 'env_after_1', label: '環境整理後', row: 3 },
  { key: 'env_before_2', label: '環境整理前', row: 3 },
  { key: 'env_after_2', label: '環境整理後', row: 3 },
]

/** 民國年轉換 */
function toROCDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const rocYear = d.getFullYear() - 1911
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${rocYear} 年 ${mm} 月 ${dd} 日`
}

const MaintenanceReport = forwardRef(function MaintenanceReport({ record }, ref) {
  if (!record) return null

  const sf = record.status_fields || {}
  const photos = record.photos || {}

  return (
    <div ref={ref} style={{
      width: '794px',       /* A4 寬度 @96dpi */
      padding: '32px 40px',
      backgroundColor: '#fff',
      fontFamily: '"Microsoft JhengHei", "微軟正黑體", sans-serif',
      fontSize: '13px',
      color: '#1a1a1a',
      lineHeight: '1.6',
    }}>

      {/* ── 標題 ── */}
      <h1 style={{
        textAlign: 'center',
        fontSize: '20px',
        fontWeight: 'bold',
        marginBottom: '20px',
        letterSpacing: '2px',
      }}>
        地動儀系統現場維護表
      </h1>

      {/* ── 基本資訊 ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <tbody>
          <tr>
            <td style={cellLabelStyle}>站名</td>
            <td style={cellValueStyle}>{record.station_name || ''}</td>
            <td style={cellLabelStyle}>維護日期</td>
            <td style={cellValueStyle}>{toROCDate(record.maintenance_date)}</td>
          </tr>
          <tr>
            <td style={cellLabelStyle}>維護人員</td>
            <td style={cellValueStyle}>{record.technician || ''}</td>
            <td style={cellLabelStyle}>主管簽核</td>
            <td style={cellValueStyle}>{record.supervisor || ''}</td>
          </tr>
        </tbody>
      </table>

      {/* ── 狀態欄位 ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr>
            <th colSpan={2} style={{
              ...cellLabelStyle,
              textAlign: 'center',
              backgroundColor: '#e8e8e8',
              fontWeight: 'bold',
              fontSize: '14px',
            }}>
              狀態檢查
            </th>
          </tr>
        </thead>
        <tbody>
          {STATUS_FIELDS.map((field) => (
            <tr key={field.key}>
              <td style={{ ...cellLabelStyle, width: '40%' }}>{field.label}</td>
              <td style={cellValueStyle}>{sf[field.key] || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── 12 格照片 ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr>
            <th colSpan={4} style={{
              ...cellLabelStyle,
              textAlign: 'center',
              backgroundColor: '#e8e8e8',
              fontWeight: 'bold',
              fontSize: '14px',
            }}>
              現場照片
            </th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((row) => {
            const rowSlots = PHOTO_SLOTS.filter((s) => s.row === row)
            return (
              <tr key={row}>
                {rowSlots.map((slot) => {
                  const photo = photos[slot.key]
                  return (
                    <td key={slot.key} style={{
                      border: '1px solid #999',
                      padding: '4px',
                      width: '25%',
                      textAlign: 'center',
                      verticalAlign: 'top',
                    }}>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                        {slot.label}
                      </div>
                      {photo?.url ? (
                        <img
                          src={photo.url}
                          alt={slot.label}
                          crossOrigin="anonymous"
                          style={{
                            width: '100%',
                            height: '120px',
                            objectFit: 'cover',
                            borderRadius: '2px',
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '120px',
                          backgroundColor: '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ccc',
                          fontSize: '11px',
                        }}>
                          無照片
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ── 備註 ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...cellLabelStyle, width: '15%' }}>備註</td>
            <td style={{ ...cellValueStyle, minHeight: '60px', whiteSpace: 'pre-wrap' }}>
              {record.notes || ''}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})

/* ── 表格樣式常數 ── */

const cellLabelStyle = {
  border: '1px solid #999',
  padding: '6px 10px',
  backgroundColor: '#f0f0f0',
  fontWeight: '600',
  fontSize: '12px',
  whiteSpace: 'nowrap',
}

const cellValueStyle = {
  border: '1px solid #999',
  padding: '6px 10px',
  fontSize: '13px',
}

export default MaintenanceReport
