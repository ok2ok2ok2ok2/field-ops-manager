/**
 * 維護表列印排版元件
 * 版本: v1.4
 * 日期: 2026-06-26
 * 檔案: src/components/MaintenanceReport.jsx
 *
 * v1.4: 地動儀水平、方位改為一格雙直式照 (左:水平 / 右:方位)；舊資料相容
 *
 * 用途：隱藏渲染，供 html2canvas 擷取後輸出為 PDF / 圖片
 */

import { forwardRef } from 'react'


/** 照片格定義；multi 格內含兩個直式子格 */
const PHOTO_SLOTS = [
  { key: 'battery_1', label: '電池電量狀況', row: 1 },
  { key: 'battery_2', label: '電池電量狀況', row: 1 },
  { key: 'waterproof', label: '設備的水密檢修', row: 1 },
  { key: 'solar_panel', label: '太陽能板清潔', row: 1 },
  { key: 'wiring', label: '線路狀況', row: 2 },
  {
    multi: true, row: 2,
    subSlots: [
      { key: 'level_direction_a', label: '地動儀水平' },
      { key: 'level_direction_b', label: '地動儀方位' },
    ],
  },
  { key: 'seismic_signal', label: '三軸地動訊號', row: 2 },
  { key: 'voltage_regulator', label: '降壓器電壓', row: 2 },
  { key: 'env_before_1', label: '環境整理前', row: 3 },
  { key: 'env_after_1', label: '環境整理後', row: 3 },
  { key: 'env_before_2', label: '環境整理前', row: 3 },
  { key: 'env_after_2', label: '環境整理後', row: 3 },
]

/** 舊資料相容 (見 MaintenanceList) */
function migratePhotos(photos) {
  if (!photos) return {}
  const out = { ...photos }
  if (out.level_direction?.url && !out.level_direction_a) {
    out.level_direction_a = out.level_direction
    delete out.level_direction
  }
  return out
}

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
  const photos = migratePhotos(record.photos)

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
            <td style={{ ...cellValueStyle, padding: '4px 10px' }}>
              {record.technician_img?.url
                ? <img src={record.technician_img.url} crossOrigin="anonymous"
                    alt="維護人員簽名"
                    style={{ height: '44px', maxWidth: '100%', objectFit: 'contain' }} />
                : <span style={{ color: '#bbb', fontSize: '11px' }}>未簽署</span>}
            </td>
            <td style={cellLabelStyle}>主管簽核</td>
            <td style={{ ...cellValueStyle, padding: '4px 10px' }}>
              {record.supervisor_img?.url
                ? <img src={record.supervisor_img.url} crossOrigin="anonymous"
                    alt="主管簽核簽名"
                    style={{ height: '44px', maxWidth: '100%', objectFit: 'contain' }} />
                : <span style={{ color: '#bbb', fontSize: '11px' }}>未簽署</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 狀態欄位 ── */}
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
              狀態檢查
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Label 列：環境、儀器、路由器、樹莓派 同列 4 欄 */}
          <tr>
            <td style={{ ...cellLabelStyle, width: '25%' }}>環境狀態</td>
            <td style={{ ...cellLabelStyle, width: '25%' }}>儀器狀態</td>
            <td style={{ ...cellLabelStyle, width: '25%' }}>路由器 web server</td>
            <td style={{ ...cellLabelStyle, width: '25%' }}>樹莓派 ssh 安全殼層通訊協定</td>
          </tr>
          {/* Value 列 */}
          <tr>
            <td style={cellValueStyle}>{sf.environment || ''}</td>
            <td style={cellValueStyle}>{sf.instrument || ''}</td>
            <td style={cellValueStyle}>{sf.router_webserver || ''}</td>
            <td style={cellValueStyle}>{sf.raspberry_ssh || ''}</td>
          </tr>
          {/* Label 列：通訊、SFTP、seedlink */}
          <tr>
            <td style={cellLabelStyle}>通訊狀態</td>
            <td style={cellLabelStyle}>SFTP 架構</td>
            <td style={{ ...cellLabelStyle }} colSpan={2}>seedlink 即時地動數據回傳</td>
          </tr>
          {/* Value 列 */}
          <tr>
            <td style={cellValueStyle}>{sf.communication || ''}</td>
            <td style={cellValueStyle}>{sf.sftp || ''}</td>
            <td style={cellValueStyle} colSpan={2}>{sf.seedlink || ''}</td>
          </tr>
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
                {rowSlots.map((slot, idx) => {
                  if (slot.multi) {
                    return (
                      <td key={`multi-${row}-${idx}`} style={{
                        border: '1px solid #999',
                        padding: '4px',
                        width: '25%',
                        textAlign: 'center',
                        verticalAlign: 'top',
                      }}>
                        {/* 兩個小標並排 */}
                        <div style={{ display: 'flex', marginBottom: '4px' }}>
                          {slot.subSlots.map((sub) => (
                            <div key={sub.key} style={{
                              flex: 1, fontSize: '11px', color: '#666', textAlign: 'center',
                            }}>
                              {sub.label}
                            </div>
                          ))}
                        </div>
                        {/* 兩張直式照緊貼並排，總高度仍為 120px */}
                        <div style={{ display: 'flex', height: '120px' }}>
                          {slot.subSlots.map((sub) => {
                            const photo = photos[sub.key]
                            return photo?.url ? (
                              <img
                                key={sub.key}
                                src={photo.url}
                                alt={sub.label}
                                crossOrigin="anonymous"
                                style={{
                                  width: '50%',
                                  height: '120px',
                                  objectFit: 'cover',
                                  borderRadius: '2px',
                                }}
                              />
                            ) : (
                              <div key={sub.key} style={{
                                width: '50%',
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
                            )
                          })}
                        </div>
                      </td>
                    )
                  }
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
