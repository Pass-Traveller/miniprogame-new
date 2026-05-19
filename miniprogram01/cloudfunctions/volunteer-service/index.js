const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50
const MAX_CHECKIN_PHOTOS = 9
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ROLE_SUPER_ADMIN = 'super-admin'
const ROLE_ADMIN = 'admin'
const ROLE_MEMBER = 'member'

const HONOR_LEVEL_POINTS_MAP = {
  national: 20,
  provincial: 16,
  bureau: 12,
  factory: 10
}
const VOLUNTEER_MODULE_RULES = {
  'red-culture': { min: 3, max: 10 },
  'community-governance': { min: 1, max: 5 },
  'enterprise-service': { min: 3, max: 10 },
  'elder-help': { min: 1, max: 5 },
  'other-service': { min: 1, max: 5 }
}

const ROUTE_ACTION_RULES = [
  { method: 'POST', route: '/auth/login', action: 'wechatLogin' },
  { method: 'POST', route: '/user/realname', action: 'bindUser' },
  { method: 'GET', route: '/user/profile', action: 'getUserProfile' },
  { method: 'POST', route: '/volunteer/submit', action: 'submitVolunteerDeclaration' },
  { method: 'GET', route: '/volunteer/records', action: 'getVolunteerRecords' },
  { method: 'POST', route: '/honor/submit', action: 'submitHonor' },
  { method: 'GET', route: '/honor/records', action: 'getHonorRecords' },
  { method: 'POST', route: '/admin/import', action: 'adminImport' },
  { method: 'GET', route: '/admin/dashboard', action: 'adminDashboardSummary' },
  { method: 'POST', route: '/admin/audit', action: 'adminAuditOperate' },
  { method: 'GET', route: '/admin/audit', action: 'adminAuditList' },
  { method: 'GET', route: '/admin/export', action: 'adminExport' },
  { method: 'GET', route: '/admin/users', action: 'adminGetUsers' },
  { method: 'POST', route: '/admin/users/role', action: 'adminSetUserRole' },
  { method: 'POST', route: '/admin/users/disable', action: 'adminDisableUser' }
]

/** 褰掍竴鍖栬矾鐢辫矾寰勶紝鍏煎浜戝嚱鏁?HTTP 涓庡墠绔?URL 鎷兼帴鏍煎紡銆?*/
function normalizeRoutePath(rawPath = '') {
  const cleanPath = String(rawPath || '')
    .trim()
    .split('?')[0]
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')

  if (!cleanPath) return ''

  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`
  return normalized.endsWith('/') && normalized.length > 1 ? normalized.slice(0, -1) : normalized
}

/** 瀹夊叏瑙ｆ瀽 HTTP body锛屾敮鎸佸璞′笌 JSON 瀛楃涓层€?*/
function parseBodyData(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  if (typeof body !== 'string') return {}

  try {
    return JSON.parse(body)
  } catch (err) {
    return {}
  }
}

/** 鏍规嵁 method + path 瑙ｆ瀽涓哄唴閮?action锛屾敮鎸佽矾寰勫悗缂€鍖归厤銆?*/
function resolveRouteAction(method, path) {
  if (!path) return ''
  for (const rule of ROUTE_ACTION_RULES) {
    const methodMatch = rule.method === method
    const pathMatch = path === rule.route || path.endsWith(rule.route)
    if (methodMatch && pathMatch) {
      return rule.action
    }
  }
  return ''
}

/** 鍏煎 action 璋冪敤涓?REST 璺敱璋冪敤锛岀粺涓€寰楀埌 action + data銆?*/
function resolveIncomingRequest(event = {}) {
  const method = String(
    event.httpMethod ||
      event.method ||
      event.requestContext?.httpMethod ||
      event.requestContext?.http?.method ||
      'POST'
  )
    .trim()
    .toUpperCase()

  const routePath = normalizeRoutePath(event.path || event.url || event.route)
  const queryData = Object.assign({}, event.queryStringParameters || {}, event.query || {})
  const bodyData = parseBodyData(event.body)
  const eventData = event && typeof event.data === 'object' ? event.data : {}
  const mergedData = Object.assign({}, queryData, bodyData, eventData)

  const rawAction = String(event.action || '').trim()
  const actionFromRouteText = rawAction.startsWith('/')
    ? resolveRouteAction(method, normalizeRoutePath(rawAction))
    : ''
  const actionFromRoute = resolveRouteAction(method, routePath)
  const action = actionFromRouteText || rawAction || actionFromRoute

  return {
    action,
    method,
    routePath,
    data: mergedData
  }
}

exports.main = async (event = {}) => {
  const { action, data, method, routePath } = resolveIncomingRequest(event)
  const { OPENID } = cloud.getWXContext()
  const effectiveOpenid = String(OPENID || data.openid || data._openid || '').trim()

  try {
    switch (action) {
      case 'wechatLogin':
        return await wechatLogin(data, effectiveOpenid)
      case 'adminLogin':
        return await adminLogin(data, effectiveOpenid)
      case 'bindUser':
        return await bindUser(data, effectiveOpenid)
      case 'getUserProfile':
        return await getUserProfile(effectiveOpenid)

      case 'getActivities':
        return await getActivities(data, effectiveOpenid)
      case 'getActivityById':
        return await getActivityById(data.id, effectiveOpenid)
      case 'publishActivity':
        return await publishActivity(data, effectiveOpenid)

      case 'signup':
        return await signup(data.activityId, effectiveOpenid)
      case 'cancelSignup':
        return await cancelSignup(data.activityId, effectiveOpenid)
      case 'getMySignups':
        return await getMySignups(effectiveOpenid)

      case 'submitCheckin':
        return await submitCheckin(data, effectiveOpenid)
      case 'getMyRecords':
        return await getMyRecords(data, effectiveOpenid)
      case 'submitVolunteerDeclaration':
        return await submitVolunteerDeclaration(data, effectiveOpenid)
      case 'getVolunteerRecords':
        return await getVolunteerRecords(data, effectiveOpenid)

      case 'getStatistics':
        return await getStatistics(effectiveOpenid)
      case 'exportReport':
        return await exportReport(data, effectiveOpenid)

      case 'submitHonor':
        return await submitHonor(data, effectiveOpenid)
      case 'getHonorRecords':
        return await getHonorRecords(data, effectiveOpenid)

      case 'adminGetUsers':
        return await adminGetUsers(data, effectiveOpenid)
      case 'adminGetUser':
        return await adminGetUser(data, effectiveOpenid)
      case 'getPointsLogs':
        return await getPointsLogs(data, effectiveOpenid)
      case 'adjustUserPoints':
        return await adjustUserPoints(data, effectiveOpenid)
      case 'adminGetCheckins':
        return await adminGetCheckins(data, effectiveOpenid)
      case 'auditCheckin':
        return await auditCheckin(data, effectiveOpenid)
      case 'adminGetStats':
        return await adminGetStats(data, effectiveOpenid)
      case 'adminGetHonors':
        return await adminGetHonors(data, effectiveOpenid)
      case 'adminAuditHonor':
        return await adminAuditHonor(data, effectiveOpenid)
      case 'adminImport':
        return await adminImport(data, effectiveOpenid)
      case 'adminDashboardSummary':
        return await adminDashboardSummary(data, effectiveOpenid)
      case 'adminAuditOperate':
        return await adminAuditOperate(data, effectiveOpenid)
      case 'adminAuditList':
        return await adminAuditList(data, effectiveOpenid)
      case 'adminExport':
        return await adminExport(data, effectiveOpenid)
      case 'adminSetUserRole':
        return await adminSetUserRole(data, effectiveOpenid)
      case 'adminDisableUser':
        return await adminDisableUser(data, effectiveOpenid)

      default:
        return {
          code: 400,
          message: '未定义的业务动作',
          detail: {
            action: action || '',
            method,
            routePath
          }
        }
    }
  } catch (err) {
    console.error(`[Action ${action}] Error:`, err)
    return { code: 500, message: err.message || '内部服务器错误' }
  }
}

function normalizePagination(page, pageSize) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1)
  const safePageSize = Math.min(
    Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  )

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize
  }
}

function toBoundaryISO(input, endOfDay = false) {
  if (!input) return ''

  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return endOfDay ? `${input}T23:59:59.999Z` : `${input}T00:00:00.000Z`
  }

  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return ''

  if (endOfDay) {
    date.setHours(23, 59, 59, 999)
  } else {
    date.setHours(0, 0, 0, 0)
  }

  return date.toISOString()
}

function resolveQueryWindow(params = {}) {
  const { timeRange, startDate, endDate } = params

  let startAt = toBoundaryISO(startDate, false)
  let endAt = toBoundaryISO(endDate, true)

  if (startAt || endAt) {
    return { startAt, endAt }
  }

  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  if (timeRange === 'today') {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { startAt: start.toISOString(), endAt: end.toISOString() }
  }

  if (timeRange === 'week') {
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 6)
    end.setHours(23, 59, 59, 999)
    return { startAt: start.toISOString(), endAt: end.toISOString() }
  }

  if (timeRange === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { startAt: start.toISOString(), endAt: end.toISOString() }
  }

  return { startAt: '', endAt: '' }
}

async function safeRollback(transaction) {
  try {
    await transaction.rollback()
  } catch (rollbackErr) {
    console.warn('[transaction] rollback skipped:', rollbackErr && rollbackErr.message)
  }
}

function chunkArray(values, size = 20) {
  const chunks = []
  const list = Array.isArray(values) ? values : []

  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }

  return chunks
}

async function fetchByFieldIn(collectionName, field, values, extraWhere = {}) {
  const uniqueValues = Array.from(new Set((values || []).filter(Boolean)))
  if (uniqueValues.length === 0) {
    return []
  }

  const chunks = chunkArray(uniqueValues, 20)
  const result = []

  for (const chunk of chunks) {
    const whereQuery = Object.assign({}, extraWhere, {
      [field]: _.in(chunk)
    })

    const res = await db.collection(collectionName).where(whereQuery).limit(100).get()

    result.push(...(res.data || []))
  }

  return result
}

async function fetchAllByWhere(collectionName, whereQuery = {}, options = {}) {
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 100, 1), 100)
  const orderByField = options.orderByField
  const orderDirection = options.orderDirection || 'desc'
  const result = []
  let skip = 0

  while (true) {
    let query = db.collection(collectionName).where(whereQuery)

    if (orderByField) {
      query = query.orderBy(orderByField, orderDirection)
    }

    const res = await query.skip(skip).limit(pageSize).get()
    const batch = res.data || []

    result.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    skip += batch.length
  }

  return result
}

/** 解析日期字符串，解析失败时返回 null。 */
function parseDateOrNull(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 将任意输入转为数组，并过滤空值。 */
function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }
  if (value == null || value === '') {
    return []
  }
  return [value]
}

/** 归一化上传图片字段，兼容 files/photos/proofs 等格式。 */
function normalizePhotoList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item) return ''
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'object')
          return String(item.url || item.fileID || item.path || '').trim()
        return ''
      })
      .filter(Boolean)
      .slice(0, MAX_CHECKIN_PHOTOS)
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,，;；\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_CHECKIN_PHOTOS)
  }

  return []
}

/** 解析年度筛选窗口，返回起止 Date。 */
function resolveYearWindow(yearValue) {
  const year = Number(yearValue)
  if (!Number.isInteger(year) || year < 1900 || year > 2999) {
    return null
  }
  const start = new Date(year, 0, 1, 0, 0, 0, 0)
  const end = new Date(year, 11, 31, 23, 59, 59, 999)
  return { start, end }
}

/** 映射审核状态文案与标签类型，供前端直接展示。 */
function resolveStatusMeta(status) {
  const map = {
    pending: { statusText: '待审核', tagType: 'warning' },
    approved: { statusText: '已通过', tagType: 'success' },
    rejected: { statusText: '已驳回', tagType: 'error' }
  }
  return map[status] || map.pending
}

/** 读取对象中的第一个有效字段。 */
function pickValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source[key]
    if (value != null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

/** honor level 文本归一化为标准 id。 */
function normalizeHonorLevel(level) {
  const raw = String(level || '')
    .trim()
    .toLowerCase()
  if (!raw) return ''
  if (HONOR_LEVEL_POINTS_MAP[raw]) return raw

  if (/国家/.test(raw)) return 'national'
  if (/省|部/.test(raw)) return 'provincial'
  if (/厅|局/.test(raw)) return 'bureau'
  if (/厂|处|街道/.test(raw)) return 'factory'

  return ''
}

/** volunteer 分类名称映射，兼容前端 moduleId。 */
function resolveVolunteerCategory(moduleId = '', fallbackCategory = '') {
  const moduleMap = {
    'red-culture': '传承红色文化（关心下一代）',
    'community-governance': '参与基层治理',
    'enterprise-service': '服务企业发展',
    'elder-help': '实施以老助老',
    'other-service': '其他服务'
  }
  return moduleMap[moduleId] || fallbackCategory || '其他服务'
}

/** 前端志愿申报 payload 标准化。 */
function normalizeVolunteerDeclarationPayload(data = {}) {
  const moduleId = String(data.moduleId || data.activityCategory || '').trim()
  const title = String(data.title || data.activityName || '').trim()
  const location = String(data.location || data.activityLocation || '').trim()
  const content = String(data.content || data.remark || '').trim()
  const activityTimeRaw = pickValue(data, ['activityTime', 'checkedAt', 'time'])
  const activityTime = parseDateOrNull(activityTimeRaw)
  const declaredPoints = Number(pickValue(data, ['points', 'declaredPoints']))
  const photos = normalizePhotoList(data.files || data.photos)
  const serviceHours = Number(data.serviceHours)
  const serviceCount = Number(data.serviceCount)

  return {
    moduleId,
    title,
    location,
    content,
    activityTime,
    declaredPoints,
    photos,
    serviceHours,
    serviceCount
  }
}

/** 格式化时间为 YYYY-MM-DD，兼容 Date/字符串。 */
function formatYmd(dateValue) {
  const date = parseDateOrNull(dateValue)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isAdminSessionActive(user) {
  if (!user || !user.adminSessionExpiresAt) return false

  const expiresAt = new Date(user.adminSessionExpiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function normalizeRoleValue(role) {
  const normalized = String(role || '').trim()
  if (normalized === ROLE_SUPER_ADMIN || normalized === ROLE_ADMIN || normalized === ROLE_MEMBER) {
    return normalized
  }
  return ROLE_MEMBER
}

function isAdminLikeRole(role) {
  return role === ROLE_SUPER_ADMIN || role === ROLE_ADMIN
}

async function getUserRole(openid) {
  try {
    const user = await getUserByOpenid(openid)
    if (user) {
      const role = normalizeRoleValue(user.role)
      if (role === ROLE_SUPER_ADMIN) return ROLE_SUPER_ADMIN
      if (role === ROLE_ADMIN || isAdminSessionActive(user)) return ROLE_ADMIN
    }
  } catch (err) {
    // 鍦ㄦ湭鍒涘缓 users 闆嗗悎鏃跺厹搴曚负鏅€氭垚鍛?    console.warn('[getUserRole] fallback to member:', err && err.message)
  }

  return ROLE_MEMBER
}

async function ensureAdmin(openid) {
  const role = await getUserRole(openid)
  if (!isAdminLikeRole(role)) {
    return { code: 403, message: '浠呯鐞嗗憳鍙墽琛岃鎿嶄綔' }
  }

  return null
}

async function ensureSingleSuperAdmin() {
  const countRes = await db.collection('users').where({ role: ROLE_SUPER_ADMIN }).count()
  if (Number(countRes.total || 0) !== 1) {
    return { code: 409, message: 'super-admin 配置异常，系统要求且仅允许 1 个 super-admin' }
  }
  return null
}

async function ensureSuperAdmin(openid) {
  const singleError = await ensureSingleSuperAdmin()
  if (singleError) return singleError

  const user = await getUserByOpenid(openid)
  if (!user || normalizeRoleValue(user.role) !== ROLE_SUPER_ADMIN) {
    return { code: 403, message: '仅 super-admin 可执行该操作' }
  }

  return null
}

async function ensurePureAdmin(openid) {
  const user = await getUserByOpenid(openid)
  if (!user || normalizeRoleValue(user.role) !== ROLE_ADMIN) {
    return { code: 403, message: '仅 admin 可执行该操作' }
  }
  return null
}

async function getActivities(params = {}, openid) {
  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const { keyword, location } = params
  const { startAt, endAt } = resolveQueryWindow(params)

  const matchQuery = {}

  if (keyword) {
    matchQuery.name = db.RegExp({ regexp: keyword, options: 'i' })
  }

  if (location) {
    matchQuery.location = db.RegExp({ regexp: location, options: 'i' })
  }

  if (startAt) {
    matchQuery.endTime = _.gte(startAt)
  }
  if (endAt) {
    matchQuery.startTime = _.lte(endAt)
  }

  const countRes = await db.collection('activities').where(matchQuery).count()

  const activityRes = await db
    .collection('activities')
    .where(matchQuery)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const activities = activityRes.data || []
  let signupActivitySet = new Set()

  if (activities.length > 0) {
    const signupList = await fetchByFieldIn(
      'signups',
      'activityId',
      activities.map((item) => item._id),
      { _openid: openid }
    )

    signupActivitySet = new Set((signupList || []).map((item) => item.activityId))
  }

  const list = activities.map((item) => ({
    ...item,
    isSignedUp: signupActivitySet.has(item._id)
  }))

  return {
    code: 0,
    data: {
      list,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function getActivityById(id, openid) {
  if (!id) {
    return { code: 400, message: '缂哄皯娲诲姩 ID' }
  }

  const activityRes = await db.collection('activities').where({ _id: id }).limit(1).get()
  if (!activityRes.data || activityRes.data.length === 0) {
    return { code: 404, message: '' }
  }

  const activity = activityRes.data[0]

  const [signupRes, checkinRes] = await Promise.all([
    db.collection('signups').where({ activityId: id, _openid: openid }).count(),
    db.collection('records').where({ activityId: id, _openid: openid }).count()
  ])

  activity.isSignedUp = signupRes.total > 0
  activity.isCheckedIn = checkinRes.total > 0

  return { code: 0, data: activity }
}

async function publishActivity(form = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const name = String(form.name || '').trim()
  const category = String(form.category || '').trim()
  const location = String(form.location || '').trim()
  const description = String(form.description || '').trim()
  const startTime = String(form.startTime || '').trim()
  const endTime = String(form.endTime || '').trim()
  const maxCount = Number(form.maxCount)

  if (!name || !location || !description || !startTime || !endTime) {
    return { code: 400, message: '' }
  }

  if (!Number.isInteger(maxCount) || maxCount <= 0) {
    return { code: 400, message: 'maxCount 蹇呴』鏄鏁存暟' }
  }

  const startTs = new Date(startTime).getTime()
  const endTs = new Date(endTime).getTime()
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) {
    return { code: 400, message: '' }
  }

  const newActivity = {
    name,
    category,
    location,
    description,
    startTime,
    endTime,
    maxCount,
    publisherId: openid,
    enrollCount: 0,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    status: 'recruiting'
  }

  const res = await db.collection('activities').add({ data: newActivity })
  return { code: 0, data: { _id: res._id, ...newActivity } }
}

async function signup(activityId, openid) {
  if (!activityId) {
    return { code: 400, message: '缂哄皯娲诲姩 ID' }
  }

  const transaction = await db.startTransaction()

  try {
    const activityRes = await transaction
      .collection('activities')
      .where({ _id: activityId })
      .limit(1)
      .get()
    if (!activityRes.data || activityRes.data.length === 0) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

    const activity = activityRes.data[0]
    const enrollCount = Number(activity.enrollCount || 0)
    const maxCount = Number(activity.maxCount || 0)

    if (activity.status === 'ended') {
      await safeRollback(transaction)
      return { code: 400, message: '娲诲姩宸茬粨鏉燂紝鏃犳硶鎶ュ悕' }
    }

    if (maxCount > 0 && enrollCount >= maxCount) {
      await safeRollback(transaction)
      return { code: 400, message: '娲诲姩鍚嶉宸叉弧' }
    }

    const existing = await transaction
      .collection('signups')
      .where({
        activityId,
        _openid: openid
      })
      .count()

    if (existing.total > 0) {
      await safeRollback(transaction)
      return { code: 400, message: '' }
    }

    await transaction.collection('signups').add({
      data: {
        activityId,
        _openid: openid,
        signupAt: db.serverDate()
      }
    })

    await transaction
      .collection('activities')
      .doc(activityId)
      .update({
        data: { enrollCount: _.inc(1) }
      })

    await transaction.commit()
    return { code: 0, message: '鎶ュ悕鎴愬姛' }
  } catch (err) {
    await safeRollback(transaction)
    console.error('[signup] error:', err)
    return { code: 500, message: '鎶ュ悕澶辫触锛岃绋嶅悗閲嶈瘯' }
  }
}

async function cancelSignup(activityId, openid) {
  if (!activityId) {
    return { code: 400, message: '缂哄皯娲诲姩 ID' }
  }

  const transaction = await db.startTransaction()

  try {
    const signupCount = await transaction
      .collection('signups')
      .where({
        activityId,
        _openid: openid
      })
      .count()

    if (signupCount.total === 0) {
      await safeRollback(transaction)
      return { code: 400, message: '' }
    }

    const removeRes = await transaction
      .collection('signups')
      .where({
        activityId,
        _openid: openid
      })
      .remove()

    const removed = Number(removeRes.removed || signupCount.total || 0)
    if (removed > 0) {
      await transaction
        .collection('activities')
        .doc(activityId)
        .update({
          data: { enrollCount: _.inc(-removed) }
        })
    }

    await transaction.commit()
    return { code: 0, message: '' }
  } catch (err) {
    await safeRollback(transaction)
    console.error('[cancelSignup] error:', err)
    return { code: 500, message: '鍙栨秷鎶ュ悕澶辫触锛岃绋嶅悗閲嶈瘯' }
  }
}

async function getMySignups(openid) {
  const signups = await fetchAllByWhere(
    'signups',
    { _openid: openid },
    { orderByField: 'signupAt', orderDirection: 'desc', pageSize: 100 }
  )

  if (!signups || signups.length === 0) {
    return { code: 0, data: [] }
  }

  const activityIds = signups.map((item) => item.activityId).filter(Boolean)

  const [activities, records] = await Promise.all([
    fetchByFieldIn('activities', '_id', activityIds),
    fetchByFieldIn('records', 'activityId', activityIds, { _openid: openid })
  ])

  const activityMap = new Map((activities || []).map((item) => [item._id, item]))
  const checkedSet = new Set((records || []).map((item) => item.activityId))

  const list = signups
    .map((signup) => {
      const activity = activityMap.get(signup.activityId)
      if (!activity) return null

      return {
        ...activity,
        activityId: signup.activityId,
        signupId: signup._id,
        signupAt: signup.signupAt,
        isSignedUp: true,
        isCheckedIn: checkedSet.has(signup.activityId)
      }
    })
    .filter(Boolean)

  return { code: 0, data: list }
}

async function submitCheckin(data = {}, openid) {
  const activityId = String(data.activityId || '').trim()
  const declaredPoints = Number(data.declaredPoints)
  const activityCategory = String(data.activityCategory || '').trim()
  const serviceHours = Number(data.serviceHours)
  const serviceCount = Number(data.serviceCount)
  const photos = Array.isArray(data.photos) ? data.photos.filter(Boolean) : []
  const remark = String(data.remark || '').trim()

  if (!activityId) {
    return { code: 400, message: '缂哄皯娲诲姩 ID' }
  }

  if (!Number.isFinite(declaredPoints) || declaredPoints <= 0) {
    return { code: 400, message: '鐢虫姤绉垎蹇呴』涓烘鏁存暟' }
  }

  if (photos.length > MAX_CHECKIN_PHOTOS) {
    return { code: 400, message: `照片最多上传 ${MAX_CHECKIN_PHOTOS} 张` }
  }

  const transaction = await db.startTransaction()

  try {
    const signupRes = await transaction
      .collection('signups')
      .where({
        activityId,
        _openid: openid
      })
      .count()

    if (signupRes.total === 0) {
      await safeRollback(transaction)
      return { code: 403, message: '' }
    }

    const existingRecordRes = await transaction
      .collection('records')
      .where({
        activityId,
        _openid: openid
      })
      .count()

    if (existingRecordRes.total > 0) {
      await safeRollback(transaction)
      return { code: 400, message: '' }
    }

    const activityRes = await transaction
      .collection('activities')
      .where({ _id: activityId })
      .limit(1)
      .get()
    if (!activityRes.data || activityRes.data.length === 0) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

    const activity = activityRes.data[0]

    const record = {
      activityId,
      activityName: activity.name,
      activityCategory: activity.category || activityCategory || '鍏朵粬鏈嶅姟',
      activityLocation: activity.location,
      declaredPoints,
      photos,
      remark,
      _openid: openid,
      checkedAt: db.serverDate(),
      status: 'pending',
      rejectReason: '',
      updatedAt: db.serverDate()
    }

    if (Number.isFinite(serviceHours) && serviceHours > 0) {
      record.serviceHours = serviceHours
    }

    if (Number.isInteger(serviceCount) && serviceCount > 0) {
      record.serviceCount = serviceCount
    }

    const addRes = await transaction.collection('records').add({ data: record })
    await transaction.commit()

    return { code: 0, data: { _id: addRes._id, ...record } }
  } catch (err) {
    await safeRollback(transaction)
    console.error('[submitCheckin] error:', err)
    return { code: 500, message: '鎻愪氦鎵撳崱澶辫触锛岃绋嶅悗閲嶈瘯' }
  }
}

async function getMyRecords(params = {}, openid) {
  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)

  const countRes = await db.collection('records').where({ _openid: openid }).count()
  const listRes = await db
    .collection('records')
    .where({ _openid: openid })
    .orderBy('checkedAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return {
    code: 0,
    data: {
      list: listRes.data,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function getStatistics(openid) {
  const [userRes, checkinCountRes, honorCountRes] = await Promise.all([
    db.collection('users').where({ _openid: openid }).limit(1).get(),
    db.collection('records').where({ _openid: openid }).count(),
    db.collection('honors').where({ _openid: openid }).count()
  ])

  const statsRes = await db
    .collection('records')
    .aggregate()
    .match({
      _openid: openid,
      status: 'approved'
    })
    .group({
      _id: null,
      totalHours: $.sum('$serviceHours'),
      totalCount: $.sum(1),
      totalServed: $.sum('$serviceCount')
    })
    .end()

  const byActivityRes = await db
    .collection('records')
    .aggregate()
    .match({
      _openid: openid,
      status: 'approved'
    })
    .group({
      _id: '$activityName',
      personCount: $.sum('$serviceCount'),
      totalHours: $.sum('$serviceHours')
    })
    .sort({ totalHours: -1 })
    .end()

  const byCategoryRes = await db
    .collection('records')
    .aggregate()
    .match({
      _openid: openid,
      status: 'approved'
    })
    .group({
      _id: '$activityLocation',
      count: $.sum(1),
      totalHours: $.sum('$serviceHours')
    })
    .sort({ totalHours: -1 })
    .end()

  const stats = statsRes.list[0] || { totalHours: 0, totalCount: 0, totalServed: 0 }
  const user = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null

  const [checkinRecordsRes, honorRecordsRes] = await Promise.all([
    db
      .collection('records')
      .where({ _openid: openid })
      .orderBy('checkedAt', 'desc')
      .limit(50)
      .get(),
    db.collection('honors').where({ _openid: openid }).orderBy('createdAt', 'desc').limit(50).get()
  ])

  return {
    code: 0,
    data: {
      totalHours: Number(stats.totalHours || 0),
      totalCount: Number(stats.totalCount || 0),
      totalServed: Number(stats.totalServed || 0),
      totalPoints: Number(user?.totalPoints || 0),
      totalCheckins: Number(checkinCountRes.total || 0),
      totalHonors: Number(honorCountRes.total || 0),
      checkinRecords: checkinRecordsRes.data || [],
      honorRecords: honorRecordsRes.data || [],
      byCategory: (byCategoryRes.list || []).map((item) => ({
        category: item._id || '未分类',
        count: Number(item.count || 0),
        totalHours: Number(item.totalHours || 0)
      })),
      byActivity: (byActivityRes.list || []).map((item) => ({
        activityName: item._id || '鏈煡娲诲姩',
        personCount: Number(item.personCount || 0),
        totalHours: Number(item.totalHours || 0)
      }))
    }
  }
}

function escapeCsvCell(value) {
  const text = String(value == null ? '' : value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function buildReportRows(stats) {
  const rows = [
    ['指标', '数值'],
    ['总服务时长(小时)', stats.totalHours],
    ['鍙備笌娲诲姩娆℃暟', stats.totalCount],
    ['鏈嶅姟浜烘暟', stats.totalServed]
  ]

  if (Array.isArray(stats.byActivity) && stats.byActivity.length > 0) {
    rows.push([])
    rows.push(['娲诲姩鍚嶇О', '鏈嶅姟浜烘暟', '鏈嶅姟鏃堕暱(灏忔椂)'])
    stats.byActivity.forEach((item) => {
      rows.push([item.activityName, item.personCount, item.totalHours])
    })
  }

  return rows
}

function formatStamp(date) {
  const yyyy = date.getFullYear()
  const MM = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`
}

async function exportReport(_params = {}, openid) {
  const statsRes = await getStatistics(openid)
  if (statsRes.code !== 0) {
    return statsRes
  }

  const rows = buildReportRows(statsRes.data)
  const csvBody = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')

  // UTF-8 BOM，确保 Excel 打开中文不乱码
  const csv = `\uFEFF${csvBody}`
  const stamp = formatStamp(new Date())
  const cloudPath = `volunteer-reports/${openid}/volunteer-report-${stamp}.csv`

  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(csv, 'utf8')
  })

  return {
    code: 0,
    data: uploadRes.fileID
  }
}

function buildToken(openid) {
  return `token_${openid}_${Date.now()}`
}

async function findAdminByCredential(account, password) {
  const inputAccount = String(account || '').trim()
  const inputPassword = String(password || '').trim()
  if (!inputAccount || !inputPassword) return null

  const res = await db
    .collection('users')
    .where({ role: _.in([ROLE_ADMIN, ROLE_SUPER_ADMIN]) })
    .limit(100)
    .get()
  const adminUsers = res.data || []

  for (const user of adminUsers) {
    const candidateAccounts = [
      user.adminAccount,
      user.account,
      user.username,
      user.loginAccount,
      user.phone
    ]
      .map((v) => String(v == null ? '' : v).trim())
      .filter(Boolean)

    const candidatePasswords = [user.adminPassword, user.password, user.passwd, user.loginPassword]
      .map((v) => String(v == null ? '' : v).trim())
      .filter(Boolean)

    if (candidateAccounts.includes(inputAccount) && candidatePasswords.includes(inputPassword)) {
      return user
    }
  }

  console.warn(
    `[adminLogin] credential mismatch, account=${inputAccount}, adminCount=${adminUsers.length}`
  )
  return null
}

async function attachAdminSession(openid, account, adminUser) {
  const user = await ensureUser(openid)
  if (!user || !user._id) return null

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS)

  await db
    .collection('users')
    .doc(user._id)
    .update({
      data: {
        adminSessionAccount: account,
        adminSessionUserId: adminUser?._id || '',
        adminSessionAt: now,
        adminSessionExpiresAt: expiresAt,
        updatedAt: db.serverDate()
      }
    })

  const latest = await db.collection('users').doc(user._id).get()
  return latest.data || user
}

async function adminLogin(data = {}, openid) {
  const account = String(data.account || '').trim()
  const password = String(data.password || '').trim()

  if (!account || !password) {
    return { code: 400, message: '' }
  }
  if (!openid) {
    return { code: 400, message: '缂哄皯鐢ㄦ埛鏍囪瘑' }
  }

  const credentialUser = await findAdminByCredential(account, password)
  if (!credentialUser) {
    return { code: 401, message: '' }
  }

  await attachAdminSession(openid, account, credentialUser)
  const normalizedUser = normalizeUserData(credentialUser)
  const displayName = String(
    credentialUser.nickName ||
      credentialUser.nickname ||
      credentialUser.realName ||
      credentialUser.adminAccount ||
      credentialUser.account ||
      account
  ).trim()
  const userInfo = {
    ...normalizedUser,
    nickName: displayName,
    nickname: displayName,
    avatar: credentialUser.avatar || credentialUser.avatarUrl || '',
    avatarUrl: credentialUser.avatarUrl || credentialUser.avatar || '',
    role: normalizeRoleValue(normalizedUser?.role)
  }

  return {
    code: 0,
    data: {
      token: buildToken(openid),
      userInfo
    }
  }
}

function normalizeUserData(user) {
  if (!user) return user
  const rawRole = normalizeRoleValue(user.role)
  const role =
    rawRole === ROLE_SUPER_ADMIN
      ? ROLE_SUPER_ADMIN
      : rawRole === ROLE_ADMIN || isAdminSessionActive(user)
        ? ROLE_ADMIN
        : ROLE_MEMBER
  return {
    ...user,
    totalPoints: Number(user.totalPoints || 0),
    volunteerPoints: Number(user.volunteerPoints || 0),
    honorPoints: Number(user.honorPoints || 0),
    checkinCount: Number(user.checkinCount || 0),
    role
  }
}

async function getUserByOpenid(openid) {
  if (!openid) return null
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  return res.data && res.data.length > 0 ? res.data[0] : null
}

/** 导入场景下按姓名 + 手机号匹配目标用户，不依赖模板传 openid 或身份证号。 */
async function resolveImportTargetUser(row = {}) {
  const explicitUserId = String(pickValue(row, ['userId', 'targetUserId', '用户ID'])).trim()
  if (explicitUserId) {
    try {
      const userRes = await db.collection('users').doc(explicitUserId).get()
      if (userRes?.data?._id) {
        return userRes.data
      }
    } catch (err) {
      // no-op
    }
  }

  const realName = String(pickValue(row, ['realName', 'userName', 'name', '用户姓名'])).trim()
  const phone = String(pickValue(row, ['phone', 'mobile', '手机号', '手机号码'])).trim()

  if (realName && phone) {
    const userByNamePhoneRes = await db.collection('users').where({ realName, phone }).limit(2).get()
    if ((userByNamePhoneRes.data || []).length === 1) {
      return userByNamePhoneRes.data[0]
    }
  }

  if (realName) {
    const userByNameRes = await db.collection('users').where({ realName }).limit(2).get()
    if ((userByNameRes.data || []).length === 1) {
      return userByNameRes.data[0]
    }
  }

  return null
}

async function ensureUser(openid) {
  if (!openid) return null
  const existing = await getUserByOpenid(openid)
  if (existing) return existing

  const data = {
    _openid: openid,
    realName: '',
    phone: '',
    role: 'member',
    totalPoints: 0,
    volunteerPoints: 0,
    honorPoints: 0,
    checkinCount: 0,
    bindAt: null,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  const res = await db.collection('users').add({ data })
  const created = await db.collection('users').doc(res._id).get()
  return created.data || { _id: res._id, ...data }
}

async function wechatLogin(_data, openid) {
  if (!openid) {
    return { code: 400, message: '缂哄皯鐢ㄦ埛鏍囪瘑' }
  }

  const user = await ensureUser(openid)
  if (user?.isDeleted || String(user?.status || '') === 'disabled') {
    return { code: 403, message: '账号已禁用，请联系管理员' }
  }
  const normalized = normalizeUserData(user)
  const needBinding = !normalized?.realName || !normalized?.phone

  return {
    code: 0,
    data: {
      needBinding,
      openid,
      token: buildToken(openid),
      userInfo: normalized
    }
  }
}

async function bindUser(data = {}, openidFromCtx) {
  const openid = String(data.openid || openidFromCtx || '').trim()
  const realName = String(data.realName || '').trim()
  const phone = String(data.phone || '').trim()

  if (!openid) {
    return { code: 400, message: '缂哄皯 openid' }
  }
  if (!realName || !phone) {
    return { code: 400, message: '' }
  }

  const user = await getUserByOpenid(openid)
  if (user?.isDeleted || String(user?.status || '') === 'disabled') {
    return { code: 403, message: '账号已禁用，请联系管理员' }
  }
  const updateData = {
    realName,
    phone,
    updatedAt: db.serverDate(),
    bindAt: user?.bindAt || db.serverDate()
  }

  if (user && user._id) {
    await db.collection('users').doc(user._id).update({ data: updateData })
  } else {
    await db.collection('users').add({
      data: {
        _openid: openid,
        role: 'member',
        totalPoints: 0,
        volunteerPoints: 0,
        honorPoints: 0,
        checkinCount: 0,
        createdAt: db.serverDate(),
        ...updateData
      }
    })
  }

  const latest = await getUserByOpenid(openid)
  return {
    code: 0,
    data: {
      needBinding: false,
      openid,
      token: buildToken(openid),
      userInfo: normalizeUserData(latest)
    }
  }
}

/** 获取用户资料与积分汇总，匹配前端 /user/profile 接口。 */
async function getUserProfile(openid) {
  if (!openid) {
    return { code: 400, message: '缺少用户标识' }
  }

  let user = await ensureUser(openid)
  if (user?.isDeleted || String(user?.status || '') === 'disabled') {
    return { code: 403, message: '账号已禁用，请联系管理员' }
  }
  let normalizedUser = normalizeUserData(user)
  const storedVolunteerPoints = Number(normalizedUser?.volunteerPoints || 0)
  const storedHonorPoints = Number(normalizedUser?.honorPoints || 0)
  const storedTotalPoints = Number(normalizedUser?.totalPoints || 0)
  const needBinding = !normalizedUser?.realName || !normalizedUser?.phone
  const needMigrateScoreFields =
    !Object.prototype.hasOwnProperty.call(user || {}, 'volunteerPoints') ||
    !Object.prototype.hasOwnProperty.call(user || {}, 'honorPoints') ||
    storedTotalPoints !== storedVolunteerPoints + storedHonorPoints

  if (needMigrateScoreFields) {
    const [volunteerAgg, honorAgg] = await Promise.all([
      db
        .collection('records')
        .aggregate()
        .match({ _openid: openid, status: 'approved' })
        .group({
          _id: null,
          volunteerPoints: $.sum('$declaredPoints')
        })
        .end(),
      db
        .collection('honors')
        .aggregate()
        .match({ _openid: openid, status: 'approved' })
        .group({
          _id: null,
          honorPoints: $.sum('$honorPoints')
        })
        .end()
    ])

    const volunteerPoints = Number(volunteerAgg.list[0]?.volunteerPoints || 0)
    const honorPoints = Number(honorAgg.list[0]?.honorPoints || 0)
    const totalPoints = volunteerPoints + honorPoints

    await db
      .collection('users')
      .doc(user._id)
      .update({
        data: {
          volunteerPoints,
          honorPoints,
          totalPoints,
          updatedAt: db.serverDate()
        }
      })

    user = await getUserByOpenid(openid)
    normalizedUser = normalizeUserData(user)
  }

  const volunteerPoints = Number(normalizedUser?.volunteerPoints || 0)
  const honorPoints = Number(normalizedUser?.honorPoints || 0)
  const totalPoints = Number(normalizedUser?.totalPoints || volunteerPoints + honorPoints)

  return {
    code: 0,
    data: {
      needBinding,
      userInfo: normalizedUser,
      scoreSummary: {
        volunteerPoints,
        honorPoints,
        totalPoints
      }
    }
  }
}

/** 提交志愿服务申报，匹配前端 /volunteer/submit 接口。 */
async function submitVolunteerDeclaration(data = {}, openid) {
  if (!openid) {
    return { code: 400, message: '缺少用户标识' }
  }

  const payload = normalizeVolunteerDeclarationPayload(data)
  if (!payload.activityTime || !payload.location || !payload.title || !payload.content) {
    return { code: 400, message: '请完整填写志愿申报信息' }
  }
  if (!Number.isFinite(payload.declaredPoints) || payload.declaredPoints <= 0) {
    return { code: 400, message: '申报积分不合法' }
  }
  if (payload.photos.length === 0) {
    return { code: 400, message: '请上传佐证材料' }
  }
  if (payload.photos.length > MAX_CHECKIN_PHOTOS) {
    return { code: 400, message: `佐证材料最多上传 ${MAX_CHECKIN_PHOTOS} 张` }
  }

  if (payload.moduleId && VOLUNTEER_MODULE_RULES[payload.moduleId]) {
    const { min, max } = VOLUNTEER_MODULE_RULES[payload.moduleId]
    if (payload.declaredPoints < min || payload.declaredPoints > max) {
      return { code: 400, message: `该模块积分范围为 ${min}-${max}` }
    }
  }

  await ensureUser(openid)

  const record = {
    activityId: String(data.activityId || `manual-${Date.now()}`),
    activityName: payload.title,
    activityCategory: resolveVolunteerCategory(
      payload.moduleId,
      String(data.activityCategory || '').trim()
    ),
    activityLocation: payload.location,
    declaredPoints: payload.declaredPoints,
    photos: payload.photos,
    remark: payload.content,
    _openid: openid,
    checkedAt: payload.activityTime,
    status: 'pending',
    rejectReason: '',
    updatedAt: db.serverDate()
  }

  if (payload.moduleId) {
    record.moduleId = payload.moduleId
  }
  if (Number.isFinite(payload.serviceHours) && payload.serviceHours > 0) {
    record.serviceHours = payload.serviceHours
  }
  if (Number.isFinite(payload.serviceCount) && payload.serviceCount > 0) {
    record.serviceCount = Math.floor(payload.serviceCount)
  }

  const addRes = await db.collection('records').add({ data: record })
  return {
    code: 0,
    data: {
      id: addRes._id
    }
  }
}

/** 查询志愿申报记录，匹配前端 /volunteer/records 接口。 */
async function getVolunteerRecords(params = {}, openid) {
  if (!openid) {
    return { code: 400, message: '缺少用户标识' }
  }

  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const status = String(params.status || '').trim()
  const moduleId = String(params.moduleId || '').trim()
  const yearWindow = resolveYearWindow(params.year)

  const whereQuery = { _openid: openid }
  if (status) {
    whereQuery.status = status
  }
  if (yearWindow) {
    whereQuery.checkedAt = _.gte(yearWindow.start).and(_.lte(yearWindow.end))
  }

  let rawList = []
  let total = 0
  if (moduleId) {
    const allList = await fetchAllByWhere('records', whereQuery, {
      orderByField: 'checkedAt',
      orderDirection: 'desc',
      pageSize: 100
    })
    const filteredList = allList.filter(
      (item) => item.moduleId === moduleId || item.activityCategory === moduleId
    )
    total = filteredList.length
    rawList = filteredList.slice(skip, skip + pageSize)
  } else {
    const [countRes, listRes] = await Promise.all([
      db.collection('records').where(whereQuery).count(),
      db
        .collection('records')
        .where(whereQuery)
        .orderBy('checkedAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
    ])
    total = countRes.total
    rawList = listRes.data || []
  }

  const list = rawList.map((item) => {
    const statusMeta = resolveStatusMeta(item.status || 'pending')
    const declaredPoints = Number(item.declaredPoints || 0)
    return {
      id: item._id,
      type: 'volunteer',
      moduleId: item.moduleId || '',
      categoryName: item.activityCategory || resolveVolunteerCategory(item.moduleId || ''),
      title: item.activityName || '',
      activityTime: formatYmd(item.checkedAt),
      submitTime: formatYmd(item.updatedAt || item.checkedAt),
      location: item.activityLocation || '',
      content: item.remark || '',
      points: declaredPoints,
      claimedPoints: declaredPoints,
      approvedPoints: item.status === 'approved' ? declaredPoints : 0,
      evidenceFiles: toArray(item.photos),
      rejectReason: item.rejectReason || '',
      status: item.status || 'pending',
      statusText: statusMeta.statusText,
      tagType: statusMeta.tagType
    }
  })

  return {
    code: 0,
    data: {
      list,
      total,
      page,
      pageSize
    }
  }
}

/** 查询荣誉申报记录，匹配前端 /honor/records 接口。 */
async function getHonorRecords(params = {}, openid) {
  if (!openid) {
    return { code: 400, message: '缺少用户标识' }
  }

  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const status = String(params.status || '').trim()
  const levelId = normalizeHonorLevel(params.levelId || params.honorLevel)
  const yearWindow = resolveYearWindow(params.year)

  const whereQuery = { _openid: openid }
  if (status) {
    whereQuery.status = status
  }
  if (levelId) {
    whereQuery.honorLevel = levelId
  }
  if (yearWindow) {
    whereQuery.createdAt = _.gte(yearWindow.start).and(_.lte(yearWindow.end))
  }

  const [countRes, listRes] = await Promise.all([
    db.collection('honors').where(whereQuery).count(),
    db
      .collection('honors')
      .where(whereQuery)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ])

  const list = (listRes.data || []).map((item) => {
    const statusMeta = resolveStatusMeta(item.status || 'pending')
    const honorPoints = Number(item.honorPoints || 0)
    const levelId = normalizeHonorLevel(item.honorLevel)
    const categoryName =
      {
        national: '国家级荣誉',
        provincial: '省部级荣誉',
        bureau: '厅局级荣誉',
        factory: '厂处级荣誉'
      }[levelId] || '荣誉获奖'
    return {
      id: item._id,
      type: 'honor',
      levelId,
      categoryName,
      title: item.honorTitle || item.title || '荣誉申报',
      organization: item.awardOrganization || item.organization || '',
      activityTime: formatYmd(item.awardTime || item.createdAt),
      submitTime: formatYmd(item.createdAt),
      content: item.honorTitle || item.title || '',
      claimedPoints: honorPoints,
      points: honorPoints,
      approvedPoints: item.status === 'approved' ? honorPoints : 0,
      evidenceFiles: toArray(item.proofs),
      rejectReason: item.rejectReason || '',
      status: item.status || 'pending',
      statusText: statusMeta.statusText,
      tagType: statusMeta.tagType
    }
  })

  return {
    code: 0,
    data: {
      list,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

/** 管理端导入数据，支持 volunteer/honor 数组批量入库。 */
async function adminImport(data = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const volunteerRows = []
  const honorRows = []

  if (Array.isArray(data.volunteers)) volunteerRows.push(...data.volunteers)
  if (Array.isArray(data.volunteerRows)) volunteerRows.push(...data.volunteerRows)
  if (Array.isArray(data.honors)) honorRows.push(...data.honors)
  if (Array.isArray(data.honorRows)) honorRows.push(...data.honorRows)
  if (Array.isArray(data.records)) {
    data.records.forEach((item) => {
      const type = String(item.type || '').trim()
      if (type === 'honor') honorRows.push(item)
      else volunteerRows.push(item)
    })
  }

  let importedVolunteer = 0
  let importedHonor = 0
  const failed = []

  for (const row of volunteerRows) {
    try {
      const moduleId = String(pickValue(row, ['moduleId', '模块标识'])).trim()
      const title = String(pickValue(row, ['title', 'activityName', '活动名称'])).trim()
      const location = String(pickValue(row, ['location', 'activityLocation', '地点'])).trim()
      const content = String(pickValue(row, ['content', 'remark', '参与内容'])).trim()
      const points = Number(pickValue(row, ['points', 'declaredPoints', '积分']))
      const checkedAt =
        parseDateOrNull(pickValue(row, ['activityTime', 'checkedAt', 'time', '时间'])) || new Date()
      const photos = normalizePhotoList(pickValue(row, ['photos', 'proofs', '佐证材料链接']))
      const matchedUser = await resolveImportTargetUser(row)
      const targetOpenid = String(matchedUser?._openid || '').trim()
      const rowRealName = String(pickValue(row, ['userName', 'realName', '用户姓名'])).trim()
      const rowPhone = String(pickValue(row, ['phone', '手机号'])).trim()

      if (!title || !location || !content || !Number.isFinite(points) || points <= 0) {
        failed.push({ type: 'volunteer', row, reason: '志愿记录字段不完整' })
        continue
      }

      const record = {
        activityId: String(
          pickValue(row, ['activityId']) ||
            `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        ),
        activityName: title,
        activityCategory: resolveVolunteerCategory(
          moduleId,
          String(pickValue(row, ['activityCategory'])).trim()
        ),
        activityLocation: location,
        declaredPoints: points,
        photos,
        remark: content,
        _openid: targetOpenid || openid,
        checkedAt,
        status: 'approved',
        rejectReason: '',
        auditedAt: db.serverDate(),
        auditorOpenid: openid,
        updatedAt: db.serverDate()
      }
      if (moduleId) {
        record.moduleId = moduleId
      }

      const addRes = await db.collection('records').add({ data: record })
      importedVolunteer += 1

      if (targetOpenid) {
        const targetUser = matchedUser || (await ensureUser(targetOpenid))
        const nextPoints = Number(targetUser.totalPoints || 0) + points
        const nextVolunteerPoints = Number(targetUser.volunteerPoints || 0) + points
        const nextCheckinCount = Number(targetUser.checkinCount || 0) + 1
        const userPatch = {
          totalPoints: nextPoints,
          volunteerPoints: nextVolunteerPoints,
          checkinCount: nextCheckinCount,
          updatedAt: db.serverDate()
        }

        /** 导入时若用户还未补全实名或手机号，则优先回填表格中的现成信息。 */
        if (rowRealName && !String(targetUser.realName || '').trim()) {
          userPatch.realName = rowRealName
        }
        if (rowPhone && !String(targetUser.phone || '').trim()) {
          userPatch.phone = rowPhone
        }

        await db
          .collection('users')
          .doc(targetUser._id)
          .update({ data: userPatch })
        await db.collection('points_logs').add({
          data: {
            userId: targetUser._id,
            userOpenid: targetOpenid,
            operatorId: openid,
            changeAmount: points,
            afterPoints: nextPoints,
            reason: '管理员导入志愿积分',
            type: 'import',
            recordId: addRes._id,
            createdAt: db.serverDate()
          }
        })
      }
    } catch (err) {
      failed.push({ type: 'volunteer', row, reason: err.message || '导入失败' })
    }
  }

  for (const row of honorRows) {
    try {
      const levelId = normalizeHonorLevel(pickValue(row, ['levelId', 'honorLevel', '荣誉级别']))
      const honorPointsRaw = Number(pickValue(row, ['honorPoints', 'points', '积分']))
      const honorPoints =
        Number.isFinite(honorPointsRaw) && honorPointsRaw > 0
          ? honorPointsRaw
          : Number(HONOR_LEVEL_POINTS_MAP[levelId] || 0)
      const honorTitle = String(
        pickValue(row, ['title', 'honorTitle', 'honorName', '荣誉名称'])
      ).trim()
      const awardTime =
        parseDateOrNull(pickValue(row, ['time', 'awardTime', '获取时间'])) || new Date()
      const awardOrganization = String(
        pickValue(row, ['organization', 'awardOrganization', '授奖单位'])
      ).trim()
      const proofs = normalizePhotoList(pickValue(row, ['proofs', 'files', '佐证材料链接']))
      const matchedUser = await resolveImportTargetUser(row)
      const targetOpenid = String(matchedUser?._openid || '').trim()
      const rowRealName = String(pickValue(row, ['userName', 'realName', '用户姓名'])).trim()
      const rowPhone = String(pickValue(row, ['phone', '手机号'])).trim()

      if (!levelId || !Number.isFinite(honorPoints) || honorPoints <= 0) {
        failed.push({ type: 'honor', row, reason: '荣誉级别或积分不合法' })
        continue
      }

      let targetUser = matchedUser
      if (!targetUser && targetOpenid) {
        targetUser = await ensureUser(targetOpenid)
      }

      const record = {
        userId: targetUser?._id || '',
        userName:
          targetUser?.realName ||
          String(pickValue(row, ['userName', 'realName', '用户姓名'])).trim(),
        phone: targetUser?.phone || String(pickValue(row, ['phone', '手机号'])).trim(),
        honorLevel: levelId,
        honorPoints,
        proofs,
        status: 'approved',
        rejectReason: '',
        _openid: targetOpenid || openid,
        createdAt: db.serverDate(),
        auditedAt: db.serverDate(),
        auditorOpenid: openid,
        updatedAt: db.serverDate()
      }
      if (honorTitle) record.honorTitle = honorTitle
      if (awardOrganization) record.awardOrganization = awardOrganization
      record.awardTime = awardTime

      const addRes = await db.collection('honors').add({ data: record })
      importedHonor += 1

      if (targetUser && targetOpenid) {
        const nextPoints = Number(targetUser.totalPoints || 0) + honorPoints
        const nextHonorPoints = Number(targetUser.honorPoints || 0) + honorPoints
        const userPatch = {
          totalPoints: nextPoints,
          honorPoints: nextHonorPoints,
          updatedAt: db.serverDate()
        }

        /** 导入荣誉数据时，同步补齐用户实名与手机号，避免前端资料页显示为空。 */
        if (rowRealName && !String(targetUser.realName || '').trim()) {
          userPatch.realName = rowRealName
        }
        if (rowPhone && !String(targetUser.phone || '').trim()) {
          userPatch.phone = rowPhone
        }

        await db
          .collection('users')
          .doc(targetUser._id)
          .update({ data: userPatch })
        await db.collection('points_logs').add({
          data: {
            userId: targetUser._id,
            userOpenid: targetOpenid,
            operatorId: openid,
            changeAmount: honorPoints,
            afterPoints: nextPoints,
            reason: '管理员导入荣誉积分',
            type: 'import',
            honorId: addRes._id,
            createdAt: db.serverDate()
          }
        })
      }
    } catch (err) {
      failed.push({ type: 'honor', row, reason: err.message || '导入失败' })
    }
  }

  return {
    code: 0,
    data: {
      importedVolunteer,
      importedHonor,
      failedCount: failed.length,
      failed
    }
  }
}

/** 管理端审核列表，聚合志愿与荣誉，匹配前端 /admin/audit 接口。 */
async function adminAuditList(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const type = String(params.type || '').trim()
  const tab = Number(params.tab)
  const keyword = String(params.keyword || '').trim()
  const year = String(params.year || '').trim()
  const moduleKeyword = String(params.module || params.moduleKeyword || '').trim()
  const onlyTotal = !!params.onlyTotal

  let status = String(params.status || '').trim()
  if (!status && Number.isInteger(tab)) {
    if (tab === 0 || tab === 1) status = 'pending'
    if (tab === 2) status = 'approved'
    if (tab === 3) status = 'rejected'
  }

  const includeVolunteer = !type || type === 'volunteer'
  const includeHonor = !type || type === 'honor'
  const whereStatus = status ? { status } : {}
  const hasAdvancedFilter = !!(keyword || year || moduleKeyword)

  /** 仅统计总数时走轻量路径，避免管理首页多次请求触发超时。 */
  if (onlyTotal && !hasAdvancedFilter) {
    let total = 0
    if (includeVolunteer) {
      const volunteerCountRes = await db.collection('records').where(whereStatus).count()
      total += Number(volunteerCountRes.total || 0)
    }
    if (includeHonor) {
      const honorCountRes = await db.collection('honors').where(whereStatus).count()
      total += Number(honorCountRes.total || 0)
    }

    return {
      code: 0,
      data: {
        list: [],
        total,
        page,
        pageSize
      }
    }
  }

  /** 单类型且无复杂筛选时使用分页查询，避免全量拉取大表。 */
  if (!hasAdvancedFilter && type === 'volunteer') {
    const [countRes, listRes] = await Promise.all([
      db.collection('records').where(whereStatus).count(),
      db
        .collection('records')
        .where(whereStatus)
        .orderBy('checkedAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
    ])

    const records = listRes.data || []
    const openids = Array.from(new Set(records.map((item) => item._openid).filter(Boolean)))
    const users = await fetchByFieldIn('users', '_openid', openids)
    const userMap = new Map((users || []).map((item) => [item._openid, item]))

    const list = records.map((item) => {
      const user = userMap.get(item._openid)
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const declaredPoints = Number(item.declaredPoints || 0)
      return {
        id: item._id,
        type: 'volunteer',
        moduleId: item.moduleId || '',
        title: item.activityName || '志愿服务申报',
        applicantName: user?.realName || '',
        categoryName: item.activityCategory || '志愿服务',
        submitTime: formatYmd(item.checkedAt),
        content: item.remark || '',
        claimedPoints: declaredPoints,
        approvedPoints: item.status === 'approved' ? declaredPoints : 0,
        location: item.activityLocation || '',
        organization: '',
        evidenceFiles: toArray(item.photos),
        levelId: '',
        rejectReason: item.rejectReason || '',
        status: item.status || 'pending',
        statusText: statusMeta.statusText,
        tagType: statusMeta.tagType
      }
    })

    return {
      code: 0,
      data: {
        list,
        total: Number(countRes.total || 0),
        page,
        pageSize
      }
    }
  }

  /** 单类型且无复杂筛选时使用分页查询，避免全量拉取大表。 */
  if (!hasAdvancedFilter && type === 'honor') {
    const [countRes, listRes] = await Promise.all([
      db.collection('honors').where(whereStatus).count(),
      db
        .collection('honors')
        .where(whereStatus)
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
    ])

    const honors = listRes.data || []
    const userIds = Array.from(new Set(honors.map((item) => item.userId).filter(Boolean)))
    const users = await fetchByFieldIn('users', '_id', userIds)
    const userMap = new Map((users || []).map((item) => [item._id, item]))

    const list = honors.map((item) => {
      const user = userMap.get(item.userId)
      const levelId = normalizeHonorLevel(item.honorLevel)
      const levelLabel =
        {
          national: '国家级荣誉',
          provincial: '省部级荣誉',
          bureau: '厅局级荣誉',
          factory: '厂处级荣誉'
        }[levelId] || '荣誉获奖'
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const honorPoints = Number(item.honorPoints || 0)

      return {
        id: item._id,
        type: 'honor',
        levelId,
        title: item.honorTitle || item.title || '荣誉获奖申报',
        applicantName: item.userName || user?.realName || '',
        categoryName: levelLabel,
        submitTime: formatYmd(item.createdAt),
        content: item.honorTitle || item.title || '',
        claimedPoints: honorPoints,
        approvedPoints: item.status === 'approved' ? honorPoints : 0,
        location: '',
        organization: item.awardOrganization || item.organization || '',
        evidenceFiles: toArray(item.proofs),
        rejectReason: item.rejectReason || '',
        status: item.status || 'pending',
        statusText: statusMeta.statusText,
        tagType: statusMeta.tagType
      }
    })

    return {
      code: 0,
      data: {
        list,
        total: Number(countRes.total || 0),
        page,
        pageSize
      }
    }
  }

  let volunteerItems = []
  let honorItems = []

  if (includeVolunteer) {
    const records = await fetchAllByWhere('records', whereStatus, {
      orderByField: 'checkedAt',
      orderDirection: 'desc',
      pageSize: 100
    })
    const openids = Array.from(new Set(records.map((item) => item._openid).filter(Boolean)))
    const users = await fetchByFieldIn('users', '_openid', openids)
    const userMap = new Map((users || []).map((item) => [item._openid, item]))

    volunteerItems = records.map((item) => {
      const user = userMap.get(item._openid)
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const declaredPoints = Number(item.declaredPoints || 0)
      return {
        id: item._id,
        type: 'volunteer',
        moduleId: item.moduleId || '',
        title: item.activityName || '志愿服务申报',
        applicantName: user?.realName || '',
        categoryName: item.activityCategory || '志愿服务',
        submitTime: formatYmd(item.checkedAt),
        content: item.remark || '',
        claimedPoints: declaredPoints,
        approvedPoints: item.status === 'approved' ? declaredPoints : 0,
        location: item.activityLocation || '',
        organization: '',
        evidenceFiles: toArray(item.photos),
        levelId: '',
        rejectReason: item.rejectReason || '',
        status: item.status || 'pending',
        statusText: statusMeta.statusText,
        tagType: statusMeta.tagType
      }
    })
  }

  if (includeHonor) {
    const honors = await fetchAllByWhere('honors', whereStatus, {
      orderByField: 'createdAt',
      orderDirection: 'desc',
      pageSize: 100
    })
    const userIds = Array.from(new Set(honors.map((item) => item.userId).filter(Boolean)))
    const users = await fetchByFieldIn('users', '_id', userIds)
    const userMap = new Map((users || []).map((item) => [item._id, item]))

    honorItems = honors.map((item) => {
      const user = userMap.get(item.userId)
      const levelId = normalizeHonorLevel(item.honorLevel)
      const levelLabel =
        {
          national: '国家级荣誉',
          provincial: '省部级荣誉',
          bureau: '厅局级荣誉',
          factory: '厂处级荣誉'
        }[levelId] || '荣誉获奖'
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const honorPoints = Number(item.honorPoints || 0)

      return {
        id: item._id,
        type: 'honor',
        levelId,
        title: item.honorTitle || item.title || '荣誉获奖申报',
        applicantName: item.userName || user?.realName || '',
        categoryName: levelLabel,
        submitTime: formatYmd(item.createdAt),
        content: item.honorTitle || item.title || '',
        claimedPoints: honorPoints,
        approvedPoints: item.status === 'approved' ? honorPoints : 0,
        location: '',
        organization: item.awardOrganization || item.organization || '',
        evidenceFiles: toArray(item.proofs),
        rejectReason: item.rejectReason || '',
        status: item.status || 'pending',
        statusText: statusMeta.statusText,
        tagType: statusMeta.tagType
      }
    })
  }

  let allItems = [...volunteerItems, ...honorItems]
  if (keyword) {
    allItems = allItems.filter(
      (item) =>
        item.title.includes(keyword) ||
        item.applicantName.includes(keyword) ||
        item.categoryName.includes(keyword) ||
        item.location.includes(keyword) ||
        item.organization.includes(keyword)
    )
  }
  if (year) {
    allItems = allItems.filter((item) => String(item.submitTime || '').startsWith(year))
  }
  if (moduleKeyword) {
    allItems = allItems.filter(
      (item) => item.title.includes(moduleKeyword) || item.categoryName.includes(moduleKeyword)
    )
  }

  allItems.sort((a, b) => {
    const aTime = parseDateOrNull(a.submitTime)?.getTime() || 0
    const bTime = parseDateOrNull(b.submitTime)?.getTime() || 0
    return bTime - aTime
  })

  const total = allItems.length
  const list = allItems.slice(skip, skip + pageSize)

  return {
    code: 0,
    data: {
      list,
      total,
      page,
      pageSize
    }
  }
}

/** 管理端首页摘要，合并统计与最新待审动态，减少前端并发请求。 */
async function adminDashboardSummary(_params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const [
    pendingVolunteerRes,
    pendingHonorRes,
    approvedVolunteerRes,
    approvedHonorRes,
    rejectedVolunteerRes,
    rejectedHonorRes,
    volunteerListRes,
    honorListRes
  ] = await Promise.all([
    db.collection('records').where({ status: 'pending' }).count(),
    db.collection('honors').where({ status: 'pending' }).count(),
    db.collection('records').where({ status: 'approved' }).count(),
    db.collection('honors').where({ status: 'approved' }).count(),
    db.collection('records').where({ status: 'rejected' }).count(),
    db.collection('honors').where({ status: 'rejected' }).count(),
    db
      .collection('records')
      .where({ status: 'pending' })
      .orderBy('checkedAt', 'desc')
      .limit(5)
      .get(),
    db.collection('honors').where({ status: 'pending' }).orderBy('createdAt', 'desc').limit(5).get()
  ])

  const volunteerRecords = volunteerListRes.data || []
  const honorRecords = honorListRes.data || []
  const volunteerOpenids = Array.from(
    new Set(volunteerRecords.map((item) => item._openid).filter(Boolean))
  )
  const honorUserIds = Array.from(new Set(honorRecords.map((item) => item.userId).filter(Boolean)))

  const [volunteerUsers, honorUsers] = await Promise.all([
    fetchByFieldIn('users', '_openid', volunteerOpenids),
    fetchByFieldIn('users', '_id', honorUserIds)
  ])

  const volunteerUserMap = new Map((volunteerUsers || []).map((item) => [item._openid, item]))
  const honorUserMap = new Map((honorUsers || []).map((item) => [item._id, item]))

  const latestLogs = [
    ...volunteerRecords.map((item) => {
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const user = volunteerUserMap.get(item._openid)
      return {
        id: item._id,
        type: 'volunteer',
        title: item.activityName || '志愿服务申报',
        applicantName: user?.realName || '',
        submitTime: formatYmd(item.checkedAt),
        statusText: statusMeta.statusText
      }
    }),
    ...honorRecords.map((item) => {
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const user = honorUserMap.get(item.userId)
      return {
        id: item._id,
        type: 'honor',
        title: item.honorTitle || item.title || '荣誉获奖申报',
        applicantName: item.userName || user?.realName || '',
        submitTime: formatYmd(item.createdAt),
        statusText: statusMeta.statusText
      }
    })
  ]
    .sort((left, right) => {
      const leftTime = parseDateOrNull(left.submitTime)?.getTime() || 0
      const rightTime = parseDateOrNull(right.submitTime)?.getTime() || 0
      return rightTime - leftTime
    })
    .slice(0, 5)

  return {
    code: 0,
    data: {
      summary: {
        pendingVolunteerCount: Number(pendingVolunteerRes.total || 0),
        pendingHonorCount: Number(pendingHonorRes.total || 0),
        approvedCount:
          Number(approvedVolunteerRes.total || 0) + Number(approvedHonorRes.total || 0),
        rejectedCount: Number(rejectedVolunteerRes.total || 0) + Number(rejectedHonorRes.total || 0)
      },
      logs: latestLogs
    }
  }
}

/** 管理端执行审核操作，支持单条与批量通过/驳回。 */
async function adminAuditOperate(data = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const type = String(data.type || '').trim()
  const id = String(data.id || '').trim()
  const ids = Array.isArray(data.ids)
    ? data.ids.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const targetIds = ids.length > 0 ? ids : id ? [id] : []
  const status = String(data.status || '').trim()
  const action = String(data.action || '').trim()
  const pass =
    typeof data.pass === 'boolean' ? data.pass : status === 'approved' || action === 'approve'
  const rejectReason = String(data.rejectReason || '').trim()

  if (targetIds.length === 0) {
    return { code: 400, message: '缺少审核记录 ID' }
  }
  if (!pass && !rejectReason) {
    return { code: 400, message: '驳回时请填写原因' }
  }

  const results = []

  /** 根据记录 ID 自动判断类型，避免批量操作时前端遗漏 type。 */
  const resolveItemType = async (recordId) => {
    if (type === 'volunteer' || type === 'honor') return type
    try {
      const recordRes = await db.collection('records').doc(recordId).get()
      if (recordRes?.data?._id) return 'volunteer'
    } catch (err) {
      // no-op
    }
    try {
      const honorRes = await db.collection('honors').doc(recordId).get()
      if (honorRes?.data?._id) return 'honor'
    } catch (err) {
      // no-op
    }
    return ''
  }

  for (const targetId of targetIds) {
    const currentType = await resolveItemType(targetId)
    if (!currentType) {
      results.push({ id: targetId, code: 404, message: '记录不存在' })
      continue
    }

    let response
    if (currentType === 'volunteer') {
      response = await auditCheckin(
        {
          recordId: targetId,
          pass,
          rejectReason,
          approvedPoints: data.approvedPoints
        },
        openid
      )
    } else {
      response = await adminAuditHonor(
        {
          id: targetId,
          pass,
          rejectReason,
          levelId: data.levelId || data.honorLevel,
          honorLevel: data.levelId || data.honorLevel,
          approvedPoints: data.approvedPoints,
          honorPoints: data.approvedPoints
        },
        openid
      )
    }

    results.push({
      id: targetId,
      code: Number(response?.code ?? 500),
      message: response?.message || '',
      data: response?.data || null
    })
  }

  const successCount = results.filter((item) => item.code === 0).length
  const failCount = results.length - successCount

  return {
    code: failCount > 0 && successCount === 0 ? 400 : 0,
    message: failCount > 0 && successCount === 0 ? '审核操作失败' : '',
    data: {
      successCount,
      failCount,
      results
    }
  }
}

/** 管理端导出全量数据，按筛选生成 CSV 并返回 fileID。 */
async function adminExport(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const auditListRes = await adminAuditList(
    Object.assign({}, params, { page: 1, pageSize: 1000 }),
    openid
  )
  if (auditListRes.code !== 0) {
    return auditListRes
  }

  const rows = [['类型', '标题', '申请人', '分类', '提交时间', '申报积分', '审核状态', '驳回原因']]

  ;(auditListRes.data.list || []).forEach((item) => {
    rows.push([
      item.type === 'volunteer' ? '志愿服务' : '荣誉获奖',
      item.title || '',
      item.applicantName || '',
      item.categoryName || '',
      item.submitTime || '',
      Number(item.claimedPoints || 0),
      item.statusText || '',
      item.status === 'rejected' ? String(item.rejectReason || '') : ''
    ])
  })

  const csvBody = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  const csv = `\uFEFF${csvBody}`
  const stamp = formatStamp(new Date())
  const cloudPath = `admin-exports/${openid}/full-export-${stamp}.csv`
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(csv, 'utf8')
  })

  return {
    code: 0,
    data: {
      fileID: uploadRes.fileID,
      total: auditListRes.data.total
    }
  }
}

async function submitHonor(data = {}, openid) {
  const honorLevel = normalizeHonorLevel(data.levelId || data.honorLevel)
  const honorPointsInput = Number(data.honorPoints || data.points)
  const honorPoints =
    Number.isFinite(honorPointsInput) && honorPointsInput > 0
      ? honorPointsInput
      : Number(HONOR_LEVEL_POINTS_MAP[honorLevel] || 0)
  const proofs = normalizePhotoList(data.proofs || data.files)
  const userId = String(data.userId || '').trim()
  const honorTitle = String(data.honorTitle || data.title || data.honorName || '').trim()
  const awardOrganization = String(data.awardOrganization || data.organization || '').trim()
  const awardTime = parseDateOrNull(data.awardTime || data.time)

  if (!honorLevel || !Number.isFinite(honorPoints) || honorPoints <= 0) {
    return { code: 400, message: '荣誉信息不完整' }
  }

  if (
    (honorTitle || awardOrganization || awardTime || data.time || data.title) &&
    (!honorTitle || !awardOrganization || !awardTime || proofs.length === 0)
  ) {
    return { code: 400, message: '请完整填写荣誉申报信息并上传佐证材料' }
  }

  let user = null
  if (userId) {
    try {
      const res = await db.collection('users').doc(userId).get()
      user = res.data || null
    } catch (err) {
      user = null
    }
  }
  if (!user) {
    user = await ensureUser(openid)
  }

  const record = {
    userId: user?._id || userId || '',
    userName: user?.realName || '',
    phone: user?.phone || '',
    honorLevel,
    honorPoints,
    proofs,
    status: 'pending',
    rejectReason: '',
    _openid: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
  if (honorTitle) record.honorTitle = honorTitle
  if (awardOrganization) record.awardOrganization = awardOrganization
  if (awardTime) record.awardTime = awardTime

  const res = await db.collection('honors').add({ data: record })
  return { code: 0, data: { id: res._id } }
}

async function adminGetUsers(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const keyword = String(params.keyword || '').trim()

  const includeDeleted = String(params.includeDeleted || '').trim() === '1'
  const baseWhere = includeDeleted ? {} : { isDeleted: _.neq(true) }
  let query = db.collection('users').where(baseWhere)
  if (keyword) {
    const kw = db.RegExp({ regexp: keyword, options: 'i' })
    const keywordWhere = _.or([{ realName: kw }, { phone: kw }])
    query = includeDeleted
      ? db.collection('users').where(keywordWhere)
      : db.collection('users').where(_.and([baseWhere, keywordWhere]))
  }

  const countRes = await query.count()
  const listRes = await query.skip(skip).limit(pageSize).get()

  const list = (listRes.data || []).map(normalizeUserData)

  return {
    code: 0,
    data: {
      list,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function adminSetUserRole(data = {}, openid) {
  const superAdminError = await ensureSuperAdmin(openid)
  if (superAdminError) return superAdminError

  const targetUserId = String(data.targetUserId || data.userId || data.id || '').trim()
  const targetRole = normalizeRoleValue(data.targetRole || data.role)

  if (!targetUserId) return { code: 400, message: '缺少目标用户 ID' }
  if (targetRole !== ROLE_ADMIN && targetRole !== ROLE_MEMBER) {
    return { code: 400, message: '仅支持设置为 admin 或 member' }
  }

  const operator = await getUserByOpenid(openid)
  if (!operator || !operator._id) {
    return { code: 403, message: '当前账号无有效权限上下文' }
  }

  let targetUser = null
  try {
    const targetRes = await db.collection('users').doc(targetUserId).get()
    targetUser = targetRes.data || null
  } catch (err) {
    targetUser = null
  }

  if (!targetUser) return { code: 404, message: '目标用户不存在' }
  if (String(targetUser._id) === String(operator._id)) {
    return { code: 403, message: '禁止修改自己的权限' }
  }

  const currentRole = normalizeRoleValue(targetUser.role)
  if (currentRole === ROLE_SUPER_ADMIN) {
    return { code: 403, message: 'super-admin 不可被修改或降级' }
  }

  if (currentRole === targetRole) {
    return {
      code: 0,
      data: {
        unchanged: true,
        user: normalizeUserData(targetUser)
      }
    }
  }

  const updateData = {
    role: targetRole,
    updatedAt: db.serverDate()
  }

  // 由 admin 回收为 member 时，立即清空管理会话，防止旧会话残留。
  if (targetRole === ROLE_MEMBER) {
    updateData.adminSessionAccount = ''
    updateData.adminSessionUserId = ''
    updateData.adminSessionAt = null
    updateData.adminSessionExpiresAt = null
  }

  await db.collection('users').doc(targetUser._id).update({ data: updateData })
  const latestRes = await db.collection('users').doc(targetUser._id).get()

  return {
    code: 0,
    data: {
      previousRole: currentRole,
      role: targetRole,
      user: normalizeUserData(latestRes.data || targetUser)
    }
  }
}

async function adminDisableUser(data = {}, openid) {
  const pureAdminError = await ensurePureAdmin(openid)
  if (pureAdminError) return pureAdminError

  const targetUserId = String(data.targetUserId || data.userId || data.id || '').trim()
  const reason = String(data.reason || '').trim()

  if (!targetUserId) return { code: 400, message: '缺少目标用户 ID' }

  const operator = await getUserByOpenid(openid)
  if (!operator || !operator._id) {
    return { code: 403, message: '当前账号无有效权限上下文' }
  }

  let targetUser = null
  try {
    const targetRes = await db.collection('users').doc(targetUserId).get()
    targetUser = targetRes.data || null
  } catch (err) {
    targetUser = null
  }

  if (!targetUser) return { code: 404, message: '目标用户不存在' }
  if (String(targetUser._id) === String(operator._id)) {
    return { code: 403, message: '禁止禁用自己的账号' }
  }

  const currentRole = normalizeRoleValue(targetUser.role)
  if (currentRole === ROLE_SUPER_ADMIN) {
    return { code: 403, message: 'super-admin 不可被禁用' }
  }

  if (targetUser?.isDeleted || String(targetUser?.status || '') === 'disabled') {
    return {
      code: 0,
      data: {
        unchanged: true,
        user: normalizeUserData(targetUser)
      }
    }
  }

  await db
    .collection('users')
    .doc(targetUser._id)
    .update({
      data: {
        isDeleted: true,
        status: 'disabled',
        deleteReason: reason,
        deletedAt: db.serverDate(),
        deletedBy: operator._id,
        role: ROLE_MEMBER,
        adminSessionAccount: '',
        adminSessionUserId: '',
        adminSessionAt: null,
        adminSessionExpiresAt: null,
        updatedAt: db.serverDate()
      }
    })

  const latestRes = await db.collection('users').doc(targetUser._id).get()
  return {
    code: 0,
    data: {
      user: normalizeUserData(latestRes.data || targetUser)
    }
  }
}

async function adminGetUser(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const id = String(params.id || '').trim()
  if (!id) return { code: 400, message: '缂哄皯鐢ㄦ埛 ID' }

  try {
    const res = await db.collection('users').doc(id).get()
    if (!res.data) return { code: 404, message: '' }
    return { code: 0, data: normalizeUserData(res.data) }
  } catch (err) {
    return { code: 404, message: '' }
  }
}

async function getPointsLogs(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const userId = String(params.userId || '').trim()
  if (!userId) return { code: 400, message: '缂哄皯鐢ㄦ埛 ID' }

  const res = await db
    .collection('points_logs')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get()

  return { code: 0, data: { list: res.data || [] } }
}

async function adjustUserPoints(data = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const targetUserId = String(data.targetUserId || '').trim()
  const amount = Number(data.amount)
  const reason = String(data.reason || '').trim()

  if (!targetUserId) return { code: 400, message: '缂哄皯鐩爣鐢ㄦ埛' }
  if (!Number.isFinite(amount) || amount === 0)
    return { code: 400, message: '璋冩暣鏁板€间笉鍚堟硶' }
  if (!reason) return { code: 400, message: '蹇呴』濉啓璋冩暣鍘熷洜' }

  const transaction = await db.startTransaction()
  try {
    const userRes = await transaction.collection('users').doc(targetUserId).get()
    if (!userRes.data) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

    const user = userRes.data
    const currentPoints = Number(user.totalPoints || 0)
    const nextPoints = currentPoints + amount
    if (nextPoints < 0) {
      await safeRollback(transaction)
      return { code: 400, message: '鎵ｅ噺鍚庣Н鍒嗕笉鍙负璐熸暟' }
    }

    await transaction
      .collection('users')
      .doc(targetUserId)
      .update({
        data: {
          totalPoints: nextPoints,
          updatedAt: db.serverDate()
        }
      })

    await transaction.collection('points_logs').add({
      data: {
        userId: targetUserId,
        userOpenid: user._openid || '',
        operatorId: openid,
        changeAmount: amount,
        afterPoints: nextPoints,
        reason,
        type: 'manual_adjust',
        createdAt: db.serverDate()
      }
    })

    await transaction.commit()
    return { code: 0, data: { success: true } }
  } catch (err) {
    await safeRollback(transaction)
    console.error('[adjustUserPoints] error:', err)
    return { code: 500, message: '鎿嶄綔澶辫触锛岃绋嶅悗閲嶈瘯' }
  }
}

async function adminGetCheckins(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const status = String(params.status || '').trim()
  const whereQuery = status ? { status } : {}

  const countRes = await db.collection('records').where(whereQuery).count()
  const listRes = await db
    .collection('records')
    .where(whereQuery)
    .orderBy('checkedAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const records = listRes.data || []
  const userOpenids = records.map((item) => item._openid).filter(Boolean)
  const users = await fetchByFieldIn('users', '_openid', userOpenids)
  const userMap = new Map((users || []).map((item) => [item._openid, item]))

  const list = records.map((record) => {
    const user = userMap.get(record._openid)
    return {
      ...record,
      realName: user?.realName || '',
      phone: user?.phone || ''
    }
  })

  return {
    code: 0,
    data: {
      list,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function auditCheckin(data = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const recordId = String(data.recordId || '').trim()
  const pass = !!data.pass
  const rejectReason = String(data.rejectReason || '').trim()
  const approvedPointsInput = Number(data.approvedPoints)

  if (!recordId) return { code: 400, message: '缂哄皯璁板綍 ID' }

  const transaction = await db.startTransaction()
  try {
    const recordRes = await transaction.collection('records').doc(recordId).get()
    const record = recordRes.data

    if (!record) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

    if (record.status && record.status !== 'pending') {
      await safeRollback(transaction)
      return { code: 400, message: '璇ヨ褰曞凡瀹℃牳' }
    }

    if (pass) {
      const rawDeclaredPoints = Number(record.declaredPoints || 0)
      const declaredPoints =
        Number.isFinite(approvedPointsInput) && approvedPointsInput > 0
          ? approvedPointsInput
          : rawDeclaredPoints

      if (!Number.isFinite(declaredPoints) || declaredPoints <= 0) {
        await safeRollback(transaction)
        return { code: 400, message: '审核积分不合法' }
      }

      if (record.moduleId && VOLUNTEER_MODULE_RULES[record.moduleId]) {
        const { min, max } = VOLUNTEER_MODULE_RULES[record.moduleId]
        if (declaredPoints < min || declaredPoints > max) {
          await safeRollback(transaction)
          return { code: 400, message: `该模块积分范围为 ${min}-${max}` }
        }
      }

      const userRes = await transaction
        .collection('users')
        .where({ _openid: record._openid })
        .limit(1)
        .get()
      let user = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null

      if (!user) {
        const createRes = await transaction.collection('users').add({
          data: {
            _openid: record._openid,
            realName: record.realName || '',
            phone: record.phone || '',
            role: 'member',
            totalPoints: 0,
            volunteerPoints: 0,
            honorPoints: 0,
            checkinCount: 0,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        const createdUser = await transaction.collection('users').doc(createRes._id).get()
        user = createdUser.data
      }

      const currentPoints = Number(user?.totalPoints || 0)
      const currentVolunteerPoints = Number(user?.volunteerPoints || 0)
      const nextPoints = currentPoints + declaredPoints
      const nextVolunteerPoints = currentVolunteerPoints + declaredPoints
      const nextCheckinCount = Number(user?.checkinCount || 0) + 1

      await transaction
        .collection('users')
        .doc(user._id)
        .update({
          data: {
            totalPoints: nextPoints,
            volunteerPoints: nextVolunteerPoints,
            checkinCount: nextCheckinCount,
            updatedAt: db.serverDate()
          }
        })

      await transaction
        .collection('records')
        .doc(recordId)
        .update({
          data: {
            status: 'approved',
            declaredPoints,
            auditedAt: db.serverDate(),
            auditorOpenid: openid,
            updatedAt: db.serverDate(),
            rejectReason: ''
          }
        })

      await transaction.collection('points_logs').add({
        data: {
          userId: user._id,
          userOpenid: user._openid || '',
          operatorId: openid,
          changeAmount: declaredPoints,
          afterPoints: nextPoints,
          reason: `打卡审核通过：${record.activityName || ''}`,
          type: 'audit_pass',
          recordId,
          createdAt: db.serverDate()
        }
      })
    } else {
      if (!rejectReason) {
        await safeRollback(transaction)
        return { code: 400, message: '蹇呴』濉啓椹冲洖鍘熷洜' }
      }

      await transaction
        .collection('records')
        .doc(recordId)
        .update({
          data: {
            status: 'rejected',
            rejectReason,
            auditedAt: db.serverDate(),
            auditorOpenid: openid,
            updatedAt: db.serverDate()
          }
        })
    }

    await transaction.commit()
    return { code: 0, data: { success: true } }
  } catch (err) {
    await safeRollback(transaction)
    console.error('[auditCheckin] error:', err)
    return { code: 500, message: '瀹℃牳澶辫触锛岃绋嶅悗閲嶈瘯' }
  }
}

async function adminGetStats(_params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const usersCount = await db.collection('users').count()
  const checkinsCount = await db.collection('records').count()

  const pointsAgg = await db
    .collection('users')
    .aggregate()
    .group({ _id: null, totalPointsIssued: $.sum('$totalPoints') })
    .end()

  const totalPointsIssued = pointsAgg.list[0]?.totalPointsIssued || 0

  const topRes = await db.collection('users').orderBy('totalPoints', 'desc').limit(5).get()

  const topUsers = (topRes.data || []).map((item) => ({
    realName: item.realName || '未命名',
    totalPoints: Number(item.totalPoints || 0)
  }))

  return {
    code: 0,
    data: {
      totalUsers: usersCount.total,
      totalCheckins: checkinsCount.total,
      totalPointsIssued,
      topUsers
    }
  }
}

async function adminGetHonors(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const { page, pageSize, skip } = normalizePagination(params.page, params.pageSize)
  const status = String(params.status || '').trim()
  const whereQuery = status ? { status } : {}

  const countRes = await db.collection('honors').where(whereQuery).count()
  const listRes = await db
    .collection('honors')
    .where(whereQuery)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const honors = listRes.data || []
  const userIds = honors.map((item) => item.userId).filter(Boolean)
  const users = await fetchByFieldIn('users', '_id', userIds)
  const userMap = new Map((users || []).map((item) => [item._id, item]))

  const list = honors.map((item) => {
    const user = userMap.get(item.userId)
    return {
      ...item,
      id: item._id,
      userName: item.userName || user?.realName || '',
      phone: item.phone || user?.phone || ''
    }
  })

  return {
    code: 0,
    data: {
      list,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function adminAuditHonor(data = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const honorId = String(data.id || '').trim()
  const pass = !!data.pass
  const rejectReason = String(data.rejectReason || '').trim()
  const levelIdInput = normalizeHonorLevel(data.levelId || data.honorLevel)
  const approvedPointsInput = Number(data.approvedPoints || data.honorPoints)

  if (!honorId) return { code: 400, message: '缂哄皯鑽ｈ獕璁板綍 ID' }

  const transaction = await db.startTransaction()
  try {
    const honorRes = await transaction.collection('honors').doc(honorId).get()
    const honor = honorRes.data

    if (!honor) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

    if (honor.status && honor.status !== 'pending') {
      await safeRollback(transaction)
      return { code: 400, message: '璇ヨ褰曞凡瀹℃牳' }
    }

    if (pass) {
      const honorLevel = levelIdInput || normalizeHonorLevel(honor.honorLevel)
      const fallbackPoints = Number(HONOR_LEVEL_POINTS_MAP[honorLevel] || 0)
      const honorPoints =
        Number.isFinite(approvedPointsInput) && approvedPointsInput > 0
          ? approvedPointsInput
          : Number(honor.honorPoints || fallbackPoints)

      if (!honorLevel || !Number.isFinite(honorPoints) || honorPoints <= 0) {
        await safeRollback(transaction)
        return { code: 400, message: '荣誉级别或积分不合法' }
      }

      let user = null
      if (honor.userId) {
        try {
          const userRes = await transaction.collection('users').doc(honor.userId).get()
          user = userRes.data || null
        } catch (err) {
          user = null
        }
      }
      if (!user && honor._openid) {
        const userRes = await transaction
          .collection('users')
          .where({ _openid: honor._openid })
          .limit(1)
          .get()
        user = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null
      }
      if (!user) {
        await safeRollback(transaction)
        return { code: 404, message: '' }
      }

      const currentPoints = Number(user.totalPoints || 0)
      const currentHonorPoints = Number(user.honorPoints || 0)
      const nextPoints = currentPoints + honorPoints
      const nextHonorPoints = currentHonorPoints + honorPoints

      await transaction
        .collection('users')
        .doc(user._id)
        .update({
          data: {
            totalPoints: nextPoints,
            honorPoints: nextHonorPoints,
            updatedAt: db.serverDate()
          }
        })

      await transaction
        .collection('honors')
        .doc(honorId)
        .update({
          data: {
            status: 'approved',
            honorLevel,
            honorPoints,
            auditedAt: db.serverDate(),
            auditorOpenid: openid,
            updatedAt: db.serverDate(),
            rejectReason: ''
          }
        })

      await transaction.collection('points_logs').add({
        data: {
          userId: user._id,
          userOpenid: user._openid || '',
          operatorId: openid,
          changeAmount: honorPoints,
          afterPoints: nextPoints,
          reason: `荣誉审核通过：${honorLevel || ''}`,
          type: 'audit_pass',
          honorId,
          createdAt: db.serverDate()
        }
      })
    } else {
      if (!rejectReason) {
        await safeRollback(transaction)
        return { code: 400, message: '蹇呴』濉啓椹冲洖鍘熷洜' }
      }

      await transaction
        .collection('honors')
        .doc(honorId)
        .update({
          data: {
            status: 'rejected',
            rejectReason,
            auditedAt: db.serverDate(),
            auditorOpenid: openid,
            updatedAt: db.serverDate()
          }
        })
    }

    await transaction.commit()
    return { code: 0, data: { success: true } }
  } catch (err) {
    await safeRollback(transaction)
    console.error('[adminAuditHonor] error:', err)
    return { code: 500, message: '瀹℃牳澶辫触锛岃绋嶅悗閲嶈瘯' }
  }
}
