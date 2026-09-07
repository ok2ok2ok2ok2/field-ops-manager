/**
 * 待辦快速輸入解析
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: src/lib/quickParse.js
 */

const WEEKDAY_MAP = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }

function toDateObj(today) {
  if (today instanceof Date) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate())
  }
  if (typeof today === 'string') {
    const parts = today.split('-').map(Number)
    return new Date(parts[0], parts[1] - 1, parts[2])
  }
  return new Date()
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate()
}

function isValidDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  return d <= daysInMonth(y, m - 1)
}

function getMonday(d) {
  const offset = (d.getDay() + 6) % 7
  return addDays(d, -offset)
}

function cleanName(s) {
  let r = s.replace(/\s+/g, ' ').trim()
  r = r.replace(/^[，,、。;；\s]+/, '')
  r = r.replace(/[，,、。;；\s]+$/, '')
  return r
}

function parseDate(text, todayObj) {
  const todayStr = formatDate(todayObj)
  const patterns = [
    { re: /下週末|下星期末|下禮拜末/, calc: () => formatDate(addDays(getMonday(todayObj), 12)) },
    { re: /本週末|這週末/, calc: () => {
      const diff = (6 - todayObj.getDay() + 7) % 7
      return formatDate(addDays(todayObj, diff === 0 ? 0 : diff))
    } },
    { re: /下週([日天一二三四五六])|下星期([日天一二三四五六])|下禮拜([日天一二三四五六])/, calc: (m) => {
      const wd = WEEKDAY_MAP[m[1] || m[2] || m[3]]
      // 一週從星期一起算：週一=0、週二=1 … 週日=6
      const offset = wd === 0 ? 6 : wd - 1
      return formatDate(addDays(getMonday(todayObj), 7 + offset))
    } },
    { re: /下週|下星期|下禮拜/, calc: () => formatDate(addDays(getMonday(todayObj), 7)) },
    { re: /週末|星期末|禮拜末/, calc: () => {
      const diff = (6 - todayObj.getDay() + 7) % 7
      return formatDate(addDays(todayObj, diff === 0 ? 0 : diff))
    } },
    { re: /(?:週|星期|禮拜)([日天一二三四五六])/, calc: (m) => {
      const wd = WEEKDAY_MAP[m[1]]
      const diff = (wd - todayObj.getDay() + 7) % 7
      return formatDate(addDays(todayObj, diff))
    } },
    { re: /月底/, calc: () => {
      const y = todayObj.getFullYear()
      const m = todayObj.getMonth()
      return formatDate(new Date(y, m, daysInMonth(y, m)))
    } },
    { re: /今天|今日/, calc: () => todayStr },
    { re: /明天|明日/, calc: () => formatDate(addDays(todayObj, 1)) },
    // 大後天要排在後天前面，不然會被「後天」先比中
    { re: /大後天/, calc: () => formatDate(addDays(todayObj, 3)) },
    { re: /後天/, calc: () => formatDate(addDays(todayObj, 2)) },
    { re: /(\d+)\s*天後/, calc: (m) => formatDate(addDays(todayObj, parseInt(m[1], 10))) },
    { re: /(\d{1,2})\s*[/-]\s*(\d{1,2})/, calc: (m) => {
      const mo = parseInt(m[1], 10)
      const d = parseInt(m[2], 10)
      let y = todayObj.getFullYear()
      if (!isValidDate(y, mo, d)) return null
      let dt = new Date(y, mo - 1, d)
      if (dt < new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate())) {
        y += 1
        if (!isValidDate(y, mo, d)) return null
        dt = new Date(y, mo - 1, d)
      }
      return formatDate(dt)
    } },
    { re: /(\d{1,2})月(\d{1,2})日/, calc: (m) => {
      const mo = parseInt(m[1], 10)
      const d = parseInt(m[2], 10)
      let y = todayObj.getFullYear()
      if (!isValidDate(y, mo, d)) return null
      let dt = new Date(y, mo - 1, d)
      if (dt < new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate())) {
        y += 1
        if (!isValidDate(y, mo, d)) return null
        dt = new Date(y, mo - 1, d)
      }
      return formatDate(dt)
    } },
    { re: /(\d{1,2})日/, calc: (m) => {
      const d = parseInt(m[1], 10)
      if (d > 31) return null
      for (let i = 0; i < 12; i++) {
        const y = todayObj.getFullYear()
        const mo = todayObj.getMonth() + i
        const yy = y + Math.floor(mo / 12)
        const mm = mo % 12
        if (isValidDate(yy, mm + 1, d)) {
          const dt = new Date(yy, mm, d)
          if (dt >= new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate())) {
            return formatDate(dt)
          }
        }
      }
      return null
    } },
  ]

  for (const p of patterns) {
    const m = text.match(p.re)
    if (m) {
      const result = p.calc(m)
      if (result) {
        return { due_date: result, match: m[0] }
      }
    }
  }
  return null
}

function parsePriority(text) {
  let priority = null
  let newText = text
  const lowPatterns = ['不急', '不緊急', '別急', '不趕']
  for (const kw of lowPatterns) {
    if (newText.includes(kw)) {
      priority = '低'
      newText = newText.replace(kw, '')
      break
    }
  }
  if (priority === null) {
    const highKws = ['緊急', '急件', '很急']
    for (const kw of highKws) {
      if (newText.includes(kw)) {
        priority = '高'
        newText = newText.replace(kw, '')
        break
      }
    }
  }
  if (/[!！]/.test(newText)) {
    if (priority === null) priority = '高'
    newText = newText.replace(/[!！]+/g, '')
  }
  return { priority, text: newText }
}

export function parseQuickInput(text, { projects = [], today = new Date() } = {}) {
  const todayObj = toDateObj(today)
  let work = String(text || '')
  const hints = []
  let location = null
  let project_id = null
  let project_name = null
  let due_date = null
  let priority = null

  // 1. 地點
  const locMatch = work.match(/@(\S+)/)
  if (locMatch) {
    location = locMatch[1]
    work = work.replace(locMatch[0], '')
    hints.push({ type: 'location', label: location })
  }

  // 2. 案件
  const hashMatch = work.match(/#(\S+)/)
  if (hashMatch) {
    const keyword = hashMatch[1]
    if (projects.length > 0) {
      let found = projects.find((p) => p.name === keyword)
      if (!found) found = projects.find((p) => p.name.startsWith(keyword))
      if (found) {
        project_id = found.id
        project_name = found.name
        work = work.replace(hashMatch[0], '')
        hints.push({ type: 'project', label: found.name })
      }
    }
  } else if (projects.length > 0) {
    let best = null
    for (const p of projects) {
      if (work.includes(p.name)) {
        if (!best || p.name.length > best.name.length) best = p
      }
    }
    if (best) {
      project_id = best.id
      project_name = best.name
      hints.push({ type: 'project', label: best.name })
    }
  }

  // 3. 日期
  const dateResult = parseDate(work, todayObj)
  if (dateResult) {
    due_date = dateResult.due_date
    work = work.replace(dateResult.match, '')
    hints.push({ type: 'date', label: due_date })
  }

  // 4. 優先權
  const priResult = parsePriority(work)
  priority = priResult.priority
  work = priResult.text
  if (priority) hints.push({ type: 'priority', label: priority })

  // 5. name 收尾
  const name = cleanName(work)

  return {
    name,
    due_date,
    priority,
    project_id,
    project_name,
    location,
    hints,
  }
}
