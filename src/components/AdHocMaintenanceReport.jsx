/**
 * 機動維護表列印排版元件
 * 版本: v1.0
 * 日期: 2026-06-26
 * 檔案: src/components/AdHocMaintenanceReport.jsx
 *
 * 與 MaintenanceReport 結構相同,差別在照片區改讀 record.photo_slots
 * 並用 CSS Grid 渲染 (可變寬高)
 */

import { forwardRef } from 'react'
import { cellLabelStyle, cellValueStyle } from './MaintenanceReport'

function toROCDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const rocYear = d.getFullYear() - 1911
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${rocYear} 年 ${mm} 月 ${dd} 日`
}

const AdHocMaintenanceReport = forwardRef(function AdHocMaintenanceReport({ record }, ref) {
  if (!record) return null

  const sf = record.status_fields || {}
  const photos = record.photos || {}
  const slots = record.photo_slots || []

  return (
    <div ref={ref} style={{
      width: '794px',
      padding: '32px 40px',
      backgroundColor: '#fff',
      fontFamily: '"Microsoft JhengHei", "微軟正黑體", sans-serif',
      fontSize: '13px',
      color: '#1a1a1a',
      lineHeight: '1.6',
    }}>

      <h1 style={{
        textAlign: 'center', fontSize: '20px', fontWeight: 'bold',
        marginBottom: '20px', letterSpacing: '2px',
      }}>
        地動儀系統機動維護表
      </h1>

      {/* 基本資訊 */}
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

      {/* 狀態欄位 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr>
            <th colSpan={4} style={{
              ...cellLabelStyle, textAlign: 'center', backgroundColor: '#e8e8e8',
              fontWeight: 'bold', fontSize: '14px',
            }}>狀態檢查</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cellLabelStyle, width: '25%' }}>環境狀態</td>
            <td style={{ ...cellLabelStyle, width: '25%' }}>儀器狀態</td>
            <td style={{ ...cellLabelStyle, width: '25%' }}>路由器 web server</td>
            <td style={{ ...cellLabelStyle, width: '25%' }}>樹莓派 ssh 安全殼層通訊協定</td>
          </tr>
          <tr>
            <td style={cellValueStyle}>{sf.environment || ''}</td>
            <td style={cellValueStyle}>{sf.instrument || ''}</td>
            <td style={cellValueStyle}>{sf.router_webserver || ''}</td>
            <td style={cellValueStyle}>{sf.raspberry_ssh || ''}</td>
          </tr>
          <tr>
            <td style={cellLabelStyle}>通訊狀態</td>
            <td style={cellLabelStyle}>SFTP 架構</td>
            <td style={{ ...cellLabelStyle }} colSpan={2}>seedlink 即時地動數據回傳</td>
          </tr>
          <tr>
            <td style={cellValueStyle}>{sf.communication || ''}</td>
            <td style={cellValueStyle}>{sf.sftp || ''}</td>
            <td style={cellValueStyle} colSpan={2}>{sf.seedlink || ''}</td>
          </tr>
        </tbody>
      </table>

      {/* 照片區 — CSS Grid，跟著 photo_slots 跑 */}
      <div style={{
        border: '1px solid #999', borderBottom: 'none', marginBottom: '0',
        padding: '6px 10px', backgroundColor: '#e8e8e8',
        fontWeight: 'bold', fontSize: '14px', textAlign: 'center',
      }}>
        現場照片
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          gridAutoFlow: 'dense',
          gridAutoRows: 'min-content',
          border: '1px solid #999',
          padding: '8px',
          marginBottom: '16px',
        }}
      >
        {slots.map((slot) => {
          const photo = photos[slot.id]
          return (
            <div key={slot.id} style={{ gridColumn: `span ${slot.cols || 1}` }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px', textAlign: 'center' }}>
                {slot.label}
              </div>
              {photo?.url ? (
                <img src={photo.url} alt={slot.label} crossOrigin="anonymous"
                  style={{
                    width: '100%',
                    height: `${slot.height || 180}px`,
                    objectFit: 'cover',
                    borderRadius: '2px',
                    display: 'block',
                  }} />
              ) : (
                <div style={{
                  width: '100%',
                  height: `${slot.height || 180}px`,
                  backgroundColor: '#f5f5f5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ccc', fontSize: '11px',
                }}>無照片</div>
              )}
            </div>
          )
        })}
        {slots.length === 0 && (
          <div style={{ gridColumn: 'span 4', textAlign: 'center', color: '#bbb', padding: '20px 0' }}>
            無照片格
          </div>
        )}
      </div>

      {/* 備註 */}
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

export default AdHocMaintenanceReport
