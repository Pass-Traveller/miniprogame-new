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
const TEST_DATA_TEXT_PATTERN = /(测试|调试|示例|样例|演示|游客|mock|demo|test|dummy|sample|seed)/i
const TEST_OPENID_PATTERN = /^(test|mock|demo|debug|sample|dummy|visitor|tourist)[-_]*/i
const TEST_PHONE_VALUES = new Set([
  '00000000000',
  '11111111111',
  '12345678901',
  '13000000000',
  '13100000000',
  '13800138000',
  '18888888888',
  '19999999999'
])
const TEST_FLAG_FIELDS = [
  'isTest',
  'isTestData',
  'testData',
  'debugOnly',
  'mock',
  'isMock',
  'demo',
  'isDemo',
  'sample',
  'seed'
]
const TEST_TEXT_FIELDS = [
  'realName',
  'userName',
  'name',
  'nickName',
  'phone',
  'title',
  'activityName',
  'activityCategory',
  'activityLocation',
  'remark',
  'content',
  'honorTitle',
  'honorName',
  'awardOrganization',
  'organization',
  'description',
  'source',
  'dataSource',
  'importBatchName'
]

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
        return await getActivityById(data.id, effectiveOpenid, data)
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

/** 解析布尔开关，兼容小程序请求中常见的字符串与数字写法。 */
function isTruthyFlag(value) {
  if (value === true || value === 1) return true
  const text = String(value == null ? '' : value)
    .trim()
    .toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'debug'].includes(text)
}

/** 判断本次请求是否显式开启调试数据查看。 */
function isDebugModeRequested(params = {}) {
  return (
    isTruthyFlag(params.debug) ||
    isTruthyFlag(params.debugMode) ||
    isTruthyFlag(params.showTestData) ||
    isTruthyFlag(params.includeTestData)
  )
}

/** 按 A 方案解析调试上下文：只有管理员显式 debug=true 才能查看测试数据。 */
async function resolveDebugContext(params = {}, openid = '') {
  const debugRequested = isDebugModeRequested(params)
  if (!debugRequested) {
    return { debugRequested: false, includeTestData: false, role: ROLE_MEMBER }
  }

  const role = await getUserRole(openid)
  return {
    debugRequested: true,
    includeTestData: isAdminLikeRole(role),
    role
  }
}

/** 判断文本是否带有测试/演示特征，用于识别未显式打标的测试数据。 */
function hasTestText(value) {
  if (value == null) return false
  return TEST_DATA_TEXT_PATTERN.test(String(value))
}

/** 判断手机号是否为常见测试号码。 */
function isTestPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? TEST_PHONE_VALUES.has(digits) : false
}

/** 判断单个对象是否带有测试数据特征。 */
function hasTestMarker(source = {}) {
  if (!source || typeof source !== 'object') return false

  if (TEST_FLAG_FIELDS.some((field) => isTruthyFlag(source[field]))) {
    return true
  }

  const openid = String(source._openid || source.openid || source.userOpenid || '').trim()
  if (openid && TEST_OPENID_PATTERN.test(openid)) {
    return true
  }

  if (isTestPhone(source.phone || source.mobile || source['手机号'] || source['手机号码'])) {
    return true
  }

  return TEST_TEXT_FIELDS.some((field) => hasTestText(source[field]))
}

/** 综合业务记录与所属用户识别测试数据，普通模式下统一隐藏。 */
function isTestDataItem(item = {}, owner = null) {
  return hasTestMarker(item) || hasTestMarker(owner)
}

/** 普通模式过滤测试数据，debug 模式保留并打标，便于管理员排查。 */
function filterVisibleItems(items = [], debugContext = {}, resolveOwner = null) {
  const list = Array.isArray(items) ? items : []
  if (debugContext.includeTestData) {
    return list.map((item) => {
      const owner = typeof resolveOwner === 'function' ? resolveOwner(item) : null
      const isTestData = isTestDataItem(item, owner)
      return isTestData ? { ...item, isTestData: true } : item
    })
  }

  return list.filter((item) => {
    const owner = typeof resolveOwner === 'function' ? resolveOwner(item) : null
    return !isTestDataItem(item, owner)
  })
}

/** 按时间字段排序并分页，确保先过滤测试数据再给前端返回 total。 */
function paginateItems(items = [], pageInfo = {}, sortField = '') {
  const list = Array.isArray(items) ? [...items] : []
  const { page, pageSize, skip } = pageInfo

  if (sortField) {
    list.sort((left, right) => {
      const leftTime = parseDateOrNull(left[sortField])?.getTime() || 0
      const rightTime = parseDateOrNull(right[sortField])?.getTime() || 0
      return rightTime - leftTime
    })
  }

  return {
    list: list.slice(skip, skip + pageSize),
    total: list.length,
    page,
    pageSize
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
  const debugContext = await resolveDebugContext(params, openid)

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

  const allActivities = await fetchAllByWhere('activities', matchQuery, {
    orderByField: 'createdAt',
    orderDirection: 'desc',
    pageSize: 100
  })
  const pageData = paginateItems(filterVisibleItems(allActivities, debugContext), {
    page,
    pageSize,
    skip
  })
  const activities = pageData.list
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
      total: pageData.total,
      page,
      pageSize
    }
  }
}

async function getActivityById(id, openid, params = {}) {
  if (!id) {
    return { code: 400, message: '缂哄皯娲诲姩 ID' }
  }

  const activityRes = await db.collection('activities').where({ _id: id }).limit(1).get()
  if (!activityRes.data || activityRes.data.length === 0) {
    return { code: 404, message: '' }
  }

  const activity = activityRes.data[0]
  const debugContext = await resolveDebugContext(params, openid)
  if (isTestDataItem(activity) && !debugContext.includeTestData) {
    return { code: 404, message: '' }
  }

  const [signupRes, checkinRecordRes, currentUser] = await Promise.all([
    db.collection('signups').where({ activityId: id, _openid: openid }).count(),
    db.collection('records').where({ activityId: id, _openid: openid }).limit(100).get(),
    getUserByOpenid(openid)
  ])
  const visibleCheckinRecords = filterVisibleItems(
    checkinRecordRes.data || [],
    debugContext,
    () => currentUser
  )

  activity.isSignedUp = signupRes.total > 0
  activity.isCheckedIn = visibleCheckinRecords.length > 0

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
  newActivity.isTestData = isTestDataItem(newActivity, form)

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
    if (isTestDataItem(activity)) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }
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

  const [activities, records, currentUser] = await Promise.all([
    fetchByFieldIn('activities', '_id', activityIds),
    fetchByFieldIn('records', 'activityId', activityIds, { _openid: openid }),
    getUserByOpenid(openid)
  ])

  const activityMap = new Map((activities || []).map((item) => [item._id, item]))
  const checkedSet = new Set(
    filterVisibleItems(records || [], {}, () => currentUser).map((item) => item.activityId)
  )

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
  const visibleList = filterVisibleItems(list, {}, () => currentUser)

  return { code: 0, data: visibleList }
}

async function submitCheckin(data = {}, openid) {
  const activityId = String(data.activityId || '').trim()
  const declaredPoints = Number(data.declaredPoints)
  const activityCategory = String(data.activityCategory || '').trim()
  const serviceHours = Number(data.serviceHours)
  const serviceCount = Number(data.serviceCount)
  const photos = Array.isArray(data.photos) ? data.photos.filter(Boolean) : []
  const remark = String(data.remark || '').trim()
  const currentUser = await getUserByOpenid(openid)

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
      .limit(100)
      .get()

    const visibleExistingRecords = filterVisibleItems(
      existingRecordRes.data || [],
      {},
      () => currentUser
    )
    if (visibleExistingRecords.length > 0) {
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
    if (isTestDataItem(activity)) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

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
    record.isTestData = isTestDataItem(record, data)

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
  const debugContext = await resolveDebugContext(params, openid)

  const records = await fetchAllByWhere(
    'records',
    { _openid: openid },
    { orderByField: 'checkedAt', orderDirection: 'desc', pageSize: 100 }
  )
  const currentUser = await getUserByOpenid(openid)
  const pageData = paginateItems(
    filterVisibleItems(records, debugContext, () => currentUser),
    {
      page,
      pageSize,
      skip
    }
  )

  return {
    code: 0,
    data: {
      list: pageData.list,
      total: pageData.total,
      page,
      pageSize
    }
  }
}

async function getStatistics(openid) {
  const [userRes, checkinRecordsRes, honorRecordsRes] = await Promise.all([
    db.collection('users').where({ _openid: openid }).limit(1).get(),
    fetchAllByWhere(
      'records',
      { _openid: openid },
      { orderByField: 'checkedAt', orderDirection: 'desc', pageSize: 100 }
    ),
    fetchAllByWhere(
      'honors',
      { _openid: openid },
      { orderByField: 'createdAt', orderDirection: 'desc', pageSize: 100 }
    )
  ])
  const user = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null
  const visibleCheckinRecords = filterVisibleItems(checkinRecordsRes, {}, () => user)
  const visibleHonorRecords = filterVisibleItems(honorRecordsRes, {}, () => user)
  const approvedRecords = visibleCheckinRecords.filter((item) => item.status === 'approved')
  const stats = approvedRecords.reduce(
    (result, item) => ({
      totalHours: result.totalHours + Number(item.serviceHours || 0),
      totalCount: result.totalCount + 1,
      totalServed: result.totalServed + Number(item.serviceCount || 0)
    }),
    { totalHours: 0, totalCount: 0, totalServed: 0 }
  )
  const byActivityMap = new Map()
  const byCategoryMap = new Map()
  approvedRecords.forEach((item) => {
    const activityName = item.activityName || '未知活动'
    const location = item.activityLocation || '未分类'
    const serviceCount = Number(item.serviceCount || 0)
    const serviceHours = Number(item.serviceHours || 0)
    const activityStat = byActivityMap.get(activityName) || {
      activityName,
      personCount: 0,
      totalHours: 0
    }
    activityStat.personCount += serviceCount
    activityStat.totalHours += serviceHours
    byActivityMap.set(activityName, activityStat)

    const categoryStat = byCategoryMap.get(location) || {
      category: location,
      count: 0,
      totalHours: 0
    }
    categoryStat.count += 1
    categoryStat.totalHours += serviceHours
    byCategoryMap.set(location, categoryStat)
  })
  const totalPoints =
    visibleCheckinRecords
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + Number(item.declaredPoints || 0), 0) +
    visibleHonorRecords
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + Number(item.honorPoints || 0), 0)

  return {
    code: 0,
    data: {
      totalHours: Number(stats.totalHours || 0),
      totalCount: Number(stats.totalCount || 0),
      totalServed: Number(stats.totalServed || 0),
      totalPoints: Number(totalPoints || user?.totalPoints || 0),
      totalCheckins: visibleCheckinRecords.length,
      totalHonors: visibleHonorRecords.length,
      checkinRecords: visibleCheckinRecords.slice(0, 50),
      honorRecords: visibleHonorRecords.slice(0, 50),
      byCategory: Array.from(byCategoryMap.values()).sort(
        (left, right) => right.totalHours - left.totalHours
      ),
      byActivity: Array.from(byActivityMap.values()).sort(
        (left, right) => right.totalHours - left.totalHours
      )
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
    const userByNamePhoneRes = await db
      .collection('users')
      .where({ realName, phone })
      .limit(2)
      .get()
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

  /** 个人积分始终按非测试、已通过记录重算，避免测试数据进入用户可见总分。 */
  const [allVolunteerRecords, allHonorRecords] = await Promise.all([
    fetchAllByWhere(
      'records',
      { _openid: openid, status: 'approved' },
      { orderByField: 'checkedAt', orderDirection: 'desc', pageSize: 100 }
    ),
    fetchAllByWhere(
      'honors',
      { _openid: openid, status: 'approved' },
      { orderByField: 'createdAt', orderDirection: 'desc', pageSize: 100 }
    )
  ])
  const visibleVolunteerRecords = filterVisibleItems(allVolunteerRecords, {}, () => user)
  const visibleHonorRecords = filterVisibleItems(allHonorRecords, {}, () => user)
  const volunteerPoints = visibleVolunteerRecords.reduce(
    (sum, item) => sum + Number(item.declaredPoints || 0),
    0
  )
  const honorPoints = visibleHonorRecords.reduce(
    (sum, item) => sum + Number(item.honorPoints || 0),
    0
  )
  const totalPoints = volunteerPoints + honorPoints
  const storedVolunteerPoints = Number(user?.volunteerPoints || 0)
  const storedHonorPoints = Number(user?.honorPoints || 0)
  const storedTotalPoints = Number(user?.totalPoints || 0)
  const needSyncScoreFields =
    storedVolunteerPoints !== volunteerPoints ||
    storedHonorPoints !== honorPoints ||
    storedTotalPoints !== totalPoints

  if (needSyncScoreFields) {
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
  }

  const normalizedUser = normalizeUserData({
    ...(user || {}),
    volunteerPoints,
    honorPoints,
    totalPoints
  })
  const needBinding = !normalizedUser?.realName || !normalizedUser?.phone

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
  record.isTestData = isTestDataItem(record, data)

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

  const pageInfo = normalizePagination(params.page, params.pageSize)
  const { page, pageSize } = pageInfo
  const status = String(params.status || '').trim()
  const moduleId = String(params.moduleId || '').trim()
  const yearWindow = resolveYearWindow(params.year)
  const debugContext = await resolveDebugContext(params, openid)
  const currentUser = await getUserByOpenid(openid)

  const whereQuery = { _openid: openid }
  if (status) {
    whereQuery.status = status
  }
  if (yearWindow) {
    whereQuery.checkedAt = _.gte(yearWindow.start).and(_.lte(yearWindow.end))
  }

  const allList = await fetchAllByWhere('records', whereQuery, {
    orderByField: 'checkedAt',
    orderDirection: 'desc',
    pageSize: 100
  })
  /** 用户侧记录必须先按调试规则过滤，再分页，避免 total 泄露测试数据数量。 */
  const visibleList = filterVisibleItems(allList, debugContext, () => currentUser)
  const filteredList = moduleId
    ? visibleList.filter((item) => item.moduleId === moduleId || item.activityCategory === moduleId)
    : visibleList
  const pageData = paginateItems(filteredList, pageInfo, 'checkedAt')

  const list = pageData.list.map((item) => {
    const statusMeta = resolveStatusMeta(item.status || 'pending')
    const declaredPoints = Number(item.declaredPoints || 0)
    return {
      id: item._id,
      type: 'volunteer',
      isTestData: !!item.isTestData,
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
      total: pageData.total,
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

  const pageInfo = normalizePagination(params.page, params.pageSize)
  const { page, pageSize } = pageInfo
  const status = String(params.status || '').trim()
  const levelId = normalizeHonorLevel(params.levelId || params.honorLevel)
  const yearWindow = resolveYearWindow(params.year)
  const debugContext = await resolveDebugContext(params, openid)
  const currentUser = await getUserByOpenid(openid)

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

  const allList = await fetchAllByWhere('honors', whereQuery, {
    orderByField: 'createdAt',
    orderDirection: 'desc',
    pageSize: 100
  })
  /** 荣誉记录同样先过滤测试数据，再计算分页总数给前端。 */
  const pageData = paginateItems(
    filterVisibleItems(allList, debugContext, () => currentUser),
    pageInfo,
    'createdAt'
  )

  const list = pageData.list.map((item) => {
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
      isTestData: !!item.isTestData,
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
      total: pageData.total,
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
      const recordIsTestData = isTestDataItem(record, row)
      record.isTestData = recordIsTestData

      const addRes = await db.collection('records').add({ data: record })
      importedVolunteer += 1

      /** 测试导入只保留明细，不写入用户正式积分，防止普通模式看到测试分数。 */
      if (targetOpenid && !recordIsTestData) {
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

        await db.collection('users').doc(targetUser._id).update({ data: userPatch })
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
      const recordIsTestData = isTestDataItem(record, row)
      record.isTestData = recordIsTestData

      const addRes = await db.collection('honors').add({ data: record })
      importedHonor += 1

      /** 测试荣誉导入不累计正式积分，debug 模式仍可在明细中看到。 */
      if (targetUser && targetOpenid && !recordIsTestData) {
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

        await db.collection('users').doc(targetUser._id).update({ data: userPatch })
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

  const pageInfo = normalizePagination(params.page, params.pageSize)
  const { page, pageSize, skip } = pageInfo
  const type = String(params.type || '').trim()
  const tab = Number(params.tab)
  const keyword = String(params.keyword || '').trim()
  const year = String(params.year || '').trim()
  const moduleKeyword = String(params.module || params.moduleKeyword || '').trim()
  const onlyTotal = !!params.onlyTotal
  const debugContext = await resolveDebugContext(params, openid)

  let status = String(params.status || '').trim()
  if (!status && Number.isInteger(tab)) {
    if (tab === 0 || tab === 1) status = 'pending'
    if (tab === 2) status = 'approved'
    if (tab === 3) status = 'rejected'
  }

  const includeVolunteer = !type || type === 'volunteer'
  const includeHonor = !type || type === 'honor'
  const whereStatus = status ? { status } : {}

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
    /** 管理端也先过滤测试数据，再参与关键字筛选、分页与 total 统计。 */
    const visibleRecords = filterVisibleItems(records, debugContext, (item) =>
      userMap.get(item._openid)
    )

    volunteerItems = visibleRecords.map((item) => {
      const user = userMap.get(item._openid)
      const statusMeta = resolveStatusMeta(item.status || 'pending')
      const declaredPoints = Number(item.declaredPoints || 0)
      return {
        id: item._id,
        type: 'volunteer',
        isTestData: !!item.isTestData,
        moduleId: item.moduleId || '',
        title: item.activityName || '志愿服务申报',
        applicantName: user?.realName || '',
        applicantPhone: user?.phone || '',
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
    const userOpenids = Array.from(new Set(honors.map((item) => item._openid).filter(Boolean)))
    const [usersById, usersByOpenid] = await Promise.all([
      fetchByFieldIn('users', '_id', userIds),
      fetchByFieldIn('users', '_openid', userOpenids)
    ])
    const userMapById = new Map((usersById || []).map((item) => [item._id, item]))
    const userMapByOpenid = new Map((usersByOpenid || []).map((item) => [item._openid, item]))
    const resolveHonorUser = (item) =>
      userMapById.get(item.userId) || userMapByOpenid.get(item._openid)
    const visibleHonors = filterVisibleItems(honors, debugContext, resolveHonorUser)

    honorItems = visibleHonors.map((item) => {
      const user = resolveHonorUser(item)
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
        isTestData: !!item.isTestData,
        levelId,
        title: item.honorTitle || item.title || '荣誉获奖申报',
        applicantName: item.userName || user?.realName || '',
        applicantPhone: item.phone || user?.phone || '',
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
        item.applicantPhone.includes(keyword) ||
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
  const list = onlyTotal ? [] : allItems.slice(skip, skip + pageSize)

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
async function adminDashboardSummary(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const debugContext = await resolveDebugContext(params, openid)
  const dashboardStatuses = ['pending', 'approved', 'rejected']
  const [records, honors] = await Promise.all([
    fetchAllByWhere(
      'records',
      { status: _.in(dashboardStatuses) },
      { orderByField: 'checkedAt', orderDirection: 'desc', pageSize: 100 }
    ),
    fetchAllByWhere(
      'honors',
      { status: _.in(dashboardStatuses) },
      { orderByField: 'createdAt', orderDirection: 'desc', pageSize: 100 }
    )
  ])

  const volunteerOpenids = Array.from(new Set(records.map((item) => item._openid).filter(Boolean)))
  const honorUserIds = Array.from(new Set(honors.map((item) => item.userId).filter(Boolean)))
  const honorOpenids = Array.from(new Set(honors.map((item) => item._openid).filter(Boolean)))

  const [volunteerUsers, honorUsersById, honorUsersByOpenid] = await Promise.all([
    fetchByFieldIn('users', '_openid', volunteerOpenids),
    fetchByFieldIn('users', '_id', honorUserIds),
    fetchByFieldIn('users', '_openid', honorOpenids)
  ])

  const volunteerUserMap = new Map((volunteerUsers || []).map((item) => [item._openid, item]))
  const honorUserMapById = new Map((honorUsersById || []).map((item) => [item._id, item]))
  const honorUserMapByOpenid = new Map(
    (honorUsersByOpenid || []).map((item) => [item._openid, item])
  )
  const resolveHonorUser = (item) =>
    honorUserMapById.get(item.userId) || honorUserMapByOpenid.get(item._openid)
  /** 首页卡片的数量也必须基于过滤后的数据，避免测试数据通过 count 暴露。 */
  const visibleRecords = filterVisibleItems(records, debugContext, (item) =>
    volunteerUserMap.get(item._openid)
  )
  const visibleHonors = filterVisibleItems(honors, debugContext, resolveHonorUser)
  const countByStatus = (list, targetStatus) =>
    list.filter((item) => String(item.status || '') === targetStatus).length

  const latestLogs = [
    ...visibleRecords
      .filter((item) => item.status === 'pending')
      .map((item) => {
        const statusMeta = resolveStatusMeta(item.status || 'pending')
        const user = volunteerUserMap.get(item._openid)
        return {
          id: item._id,
          type: 'volunteer',
          isTestData: !!item.isTestData,
          title: item.activityName || '志愿服务申报',
          applicantName: user?.realName || '',
          submitTime: formatYmd(item.checkedAt),
          statusText: statusMeta.statusText
        }
      }),
    ...visibleHonors
      .filter((item) => item.status === 'pending')
      .map((item) => {
        const statusMeta = resolveStatusMeta(item.status || 'pending')
        const user = resolveHonorUser(item)
        return {
          id: item._id,
          type: 'honor',
          isTestData: !!item.isTestData,
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
        pendingVolunteerCount: countByStatus(visibleRecords, 'pending'),
        pendingHonorCount: countByStatus(visibleHonors, 'pending'),
        approvedCount:
          countByStatus(visibleRecords, 'approved') + countByStatus(visibleHonors, 'approved'),
        rejectedCount:
          countByStatus(visibleRecords, 'rejected') + countByStatus(visibleHonors, 'rejected')
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
  const debugPassThrough = {
    debug: data.debug,
    debugMode: data.debugMode,
    showTestData: data.showTestData,
    includeTestData: data.includeTestData
  }

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
          approvedPoints: data.approvedPoints,
          ...debugPassThrough
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
          honorPoints: data.approvedPoints,
          ...debugPassThrough
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
  record.isTestData = isTestDataItem(record, data)

  const res = await db.collection('honors').add({ data: record })
  return { code: 0, data: { id: res._id } }
}

async function adminGetUsers(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const pageInfo = normalizePagination(params.page, params.pageSize)
  const { page, pageSize } = pageInfo
  const keyword = String(params.keyword || '').trim()
  const debugContext = await resolveDebugContext(params, openid)

  const includeDeleted = String(params.includeDeleted || '').trim() === '1'
  const baseWhere = includeDeleted ? {} : { isDeleted: _.neq(true) }
  const users = await fetchAllByWhere('users', baseWhere, {
    orderByField: 'createdAt',
    orderDirection: 'desc',
    pageSize: 100
  })
  let filteredUsers = filterVisibleItems(users, debugContext)

  if (keyword) {
    /** 账号管理列表支持按姓名、手机号、openid 搜索，搜索结果仍遵守测试数据过滤规则。 */
    filteredUsers = filteredUsers.filter(
      (item) =>
        String(item.realName || '').includes(keyword) ||
        String(item.phone || '').includes(keyword) ||
        String(item._openid || '').includes(keyword)
    )
  }

  const pageData = paginateItems(filteredUsers, pageInfo, 'createdAt')
  const list = pageData.list.map((item) =>
    normalizeUserData({
      ...item,
      isTestData: !!item.isTestData
    })
  )

  return {
    code: 0,
    data: {
      list,
      total: pageData.total,
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
  const debugContext = await resolveDebugContext(params, openid)

  try {
    const res = await db.collection('users').doc(id).get()
    if (!res.data) return { code: 404, message: '' }
    const visibleUsers = filterVisibleItems([res.data], debugContext)
    if (visibleUsers.length === 0) return { code: 404, message: '' }
    return { code: 0, data: normalizeUserData(visibleUsers[0]) }
  } catch (err) {
    return { code: 404, message: '' }
  }
}

async function getPointsLogs(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const userId = String(params.userId || '').trim()
  if (!userId) return { code: 400, message: '缂哄皯鐢ㄦ埛 ID' }
  const debugContext = await resolveDebugContext(params, openid)

  const userRes = await db.collection('users').doc(userId).get()
  const visibleUsers = filterVisibleItems(userRes?.data ? [userRes.data] : [], debugContext)
  if (visibleUsers.length === 0) {
    return { code: 404, message: '' }
  }

  const res = await db
    .collection('points_logs')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get()

  const logs = res.data || []
  const recordIds = logs.map((item) => item.recordId).filter(Boolean)
  const honorIds = logs.map((item) => item.honorId).filter(Boolean)
  const [records, honors] = await Promise.all([
    fetchByFieldIn('records', '_id', recordIds),
    fetchByFieldIn('honors', '_id', honorIds)
  ])
  const recordMap = new Map((records || []).map((item) => [item._id, item]))
  const honorMap = new Map((honors || []).map((item) => [item._id, item]))
  const visibleLogs = filterVisibleItems(logs, debugContext, (item) => {
    if (item.recordId) return recordMap.get(item.recordId)
    if (item.honorId) return honorMap.get(item.honorId)
    return visibleUsers[0]
  })

  return { code: 0, data: { list: visibleLogs } }
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

  const pageInfo = normalizePagination(params.page, params.pageSize)
  const { page, pageSize } = pageInfo
  const status = String(params.status || '').trim()
  const whereQuery = status ? { status } : {}
  const debugContext = await resolveDebugContext(params, openid)

  const records = await fetchAllByWhere('records', whereQuery, {
    orderByField: 'checkedAt',
    orderDirection: 'desc',
    pageSize: 100
  })
  const userOpenids = records.map((item) => item._openid).filter(Boolean)
  const users = await fetchByFieldIn('users', '_openid', userOpenids)
  const userMap = new Map((users || []).map((item) => [item._openid, item]))
  const pageData = paginateItems(
    filterVisibleItems(records, debugContext, (item) => userMap.get(item._openid)),
    pageInfo,
    'checkedAt'
  )

  const list = pageData.list.map((record) => {
    const user = userMap.get(record._openid)
    return {
      ...record,
      isTestData: !!record.isTestData,
      realName: user?.realName || '',
      phone: user?.phone || ''
    }
  })

  return {
    code: 0,
    data: {
      list,
      total: pageData.total,
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
  const debugContext = await resolveDebugContext(data, openid)

  if (!recordId) return { code: 400, message: '缂哄皯璁板綍 ID' }

  const transaction = await db.startTransaction()
  try {
    const recordRes = await transaction.collection('records').doc(recordId).get()
    const record = recordRes.data

    if (!record) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
    }

    const userRes = await transaction
      .collection('users')
      .where({ _openid: record._openid })
      .limit(1)
      .get()
    let user = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null

    const recordIsTestData = isTestDataItem(record, user)
    /** 直接审核接口也遵守测试数据隔离，避免绕过列表按 ID 操作测试数据。 */
    if (recordIsTestData && !debugContext.includeTestData) {
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

      if (!user && !recordIsTestData) {
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

      let nextPoints = Number(user?.totalPoints || 0)
      if (!recordIsTestData && user) {
        const currentVolunteerPoints = Number(user?.volunteerPoints || 0)
        nextPoints += declaredPoints
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
      }

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

      /** 测试记录可在 debug 下审核流转，但不写入正式积分流水。 */
      if (!recordIsTestData && user) {
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
      }
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

async function adminGetStats(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const debugContext = await resolveDebugContext(params, openid)
  const [users, records, honors] = await Promise.all([
    fetchAllByWhere('users', {}, { pageSize: 100 }),
    fetchAllByWhere(
      'records',
      {},
      { orderByField: 'checkedAt', orderDirection: 'desc', pageSize: 100 }
    ),
    fetchAllByWhere(
      'honors',
      {},
      { orderByField: 'createdAt', orderDirection: 'desc', pageSize: 100 }
    )
  ])
  const userMapByOpenid = new Map((users || []).map((item) => [item._openid, item]))
  const userMapById = new Map((users || []).map((item) => [item._id, item]))
  const visibleUsers = filterVisibleItems(users, debugContext)
  const visibleRecords = filterVisibleItems(records, debugContext, (item) =>
    userMapByOpenid.get(item._openid)
  )
  const visibleHonors = filterVisibleItems(
    honors,
    debugContext,
    (item) => userMapById.get(item.userId) || userMapByOpenid.get(item._openid)
  )
  const visibleOpenids = new Set(visibleUsers.map((item) => item._openid).filter(Boolean))
  const scoreByOpenid = new Map()

  visibleRecords
    .filter((item) => item.status === 'approved')
    .forEach((item) => {
      const key = item._openid || ''
      scoreByOpenid.set(key, Number(scoreByOpenid.get(key) || 0) + Number(item.declaredPoints || 0))
    })
  visibleHonors
    .filter((item) => item.status === 'approved')
    .forEach((item) => {
      const owner = userMapById.get(item.userId) || userMapByOpenid.get(item._openid)
      const key = item._openid || owner?._openid || ''
      scoreByOpenid.set(key, Number(scoreByOpenid.get(key) || 0) + Number(item.honorPoints || 0))
    })

  const totalPointsIssued = Array.from(scoreByOpenid.values()).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  )
  const topUsers = visibleUsers
    .map((item) => ({
      realName: item.realName || '未命名',
      totalPoints: Number(scoreByOpenid.get(item._openid) || 0)
    }))
    .filter((item) => item.totalPoints > 0 || visibleOpenids.size > 0)
    .sort((left, right) => right.totalPoints - left.totalPoints)
    .slice(0, 5)

  return {
    code: 0,
    data: {
      totalUsers: visibleUsers.length,
      totalCheckins: visibleRecords.length,
      totalPointsIssued,
      topUsers
    }
  }
}

async function adminGetHonors(params = {}, openid) {
  const adminError = await ensureAdmin(openid)
  if (adminError) return adminError

  const pageInfo = normalizePagination(params.page, params.pageSize)
  const { page, pageSize } = pageInfo
  const status = String(params.status || '').trim()
  const whereQuery = status ? { status } : {}
  const debugContext = await resolveDebugContext(params, openid)

  const honors = await fetchAllByWhere('honors', whereQuery, {
    orderByField: 'createdAt',
    orderDirection: 'desc',
    pageSize: 100
  })
  const userIds = honors.map((item) => item.userId).filter(Boolean)
  const userOpenids = honors.map((item) => item._openid).filter(Boolean)
  const [usersById, usersByOpenid] = await Promise.all([
    fetchByFieldIn('users', '_id', userIds),
    fetchByFieldIn('users', '_openid', userOpenids)
  ])
  const userMapById = new Map((usersById || []).map((item) => [item._id, item]))
  const userMapByOpenid = new Map((usersByOpenid || []).map((item) => [item._openid, item]))
  const resolveHonorUser = (item) =>
    userMapById.get(item.userId) || userMapByOpenid.get(item._openid)
  const pageData = paginateItems(
    filterVisibleItems(honors, debugContext, resolveHonorUser),
    pageInfo,
    'createdAt'
  )

  const list = pageData.list.map((item) => {
    const user = resolveHonorUser(item)
    return {
      ...item,
      id: item._id,
      isTestData: !!item.isTestData,
      userName: item.userName || user?.realName || '',
      phone: item.phone || user?.phone || ''
    }
  })

  return {
    code: 0,
    data: {
      list,
      total: pageData.total,
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
  const debugContext = await resolveDebugContext(data, openid)

  if (!honorId) return { code: 400, message: '缂哄皯鑽ｈ獕璁板綍 ID' }

  const transaction = await db.startTransaction()
  try {
    const honorRes = await transaction.collection('honors').doc(honorId).get()
    const honor = honorRes.data

    if (!honor) {
      await safeRollback(transaction)
      return { code: 404, message: '' }
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

    const honorIsTestData = isTestDataItem(honor, user)
    /** 直接审核荣誉时同样隔离测试数据，默认不允许通过 ID 触达。 */
    if (honorIsTestData && !debugContext.includeTestData) {
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

      if (!user && !honorIsTestData) {
        await safeRollback(transaction)
        return { code: 404, message: '' }
      }

      let nextPoints = Number(user?.totalPoints || 0)
      if (!honorIsTestData && user) {
        const currentHonorPoints = Number(user.honorPoints || 0)
        nextPoints += honorPoints
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
      }

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

      /** 测试荣誉只走审核状态，不写正式积分流水。 */
      if (!honorIsTestData && user) {
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
      }
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
