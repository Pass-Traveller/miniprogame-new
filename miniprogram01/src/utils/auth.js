import { showErrorToast } from '@/utils/feedback'

const LOGIN_PAGE = '/pages/login/login'
let interceptorReady = false

const getSubscribeTemplateIds = () => {
  const raw = import.meta.env.VITE_SUBSCRIBE_TEMPLATE_IDS || ''
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 统一获取当前页面路径，供全局守卫判断是否需要放行。 */
const getCurrentRoute = () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  return currentPage ? `/${currentPage.route}` : ''
}

/** 判断当前跳转目标是否为登录页。 */
const isLoginRoute = (url = '') => url.split('?')[0] === LOGIN_PAGE

const ADMIN_ROUTE_PREFIX = '/pages/admin/'

/** 在未完成合规前，统一跳回登录页。 */
const redirectToLogin = (message = '') => {
  if (message) {
    showErrorToast(message)
  }
  if (!isLoginRoute(getCurrentRoute())) {
    uni.reLaunch({ url: LOGIN_PAGE })
  }
}

/** 校验隐私协议与用户认证状态，未通过时阻止继续访问业务页面。 */
export const ensureComplianceReady = (userStore, options = {}) => {
  const { redirect = true, toast = true } = options
  let message = ''

  if (!userStore.privacyAgreed) {
    message = '请先同意隐私保护指引'
  } else if (!userStore.hasRealname) {
    message = '请先完成用户认证'
  }

  if (!message) {
    return true
  }

  if (redirect) {
    redirectToLogin(toast ? message : '')
  } else if (toast) {
    showErrorToast(message)
  }

  return false
}

/** 注册全局路由拦截，避免未完成认证的用户直接进入业务页。 */
export const setupComplianceInterceptors = (userStore) => {
  if (interceptorReady) return

  const methods = ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab']
  methods.forEach((method) => {
    uni.addInterceptor(method, {
      invoke(args) {
        const url = args?.url || ''
        if (!url || isLoginRoute(url)) {
          return args
        }

        if (url.startsWith(ADMIN_ROUTE_PREFIX) && !userStore.isAdmin) {
          setTimeout(() => showErrorToast('无权访问管理页面'), 0)
          return false
        }

        if (ensureComplianceReady(userStore, { redirect: false, toast: false })) {
          return args
        }
        setTimeout(() => redirectToLogin('请先完成隐私同意与用户认证'), 0)
        return false
      }
    })
  })

  interceptorReady = true
}

/** 调用微信登录接口，获取前端会话 code。 */
export const wxLogin = () =>
  new Promise((resolve) => {
    uni.login({
      success: (res) => resolve(res),
      fail: () => resolve(false)
    })
  })

/** 在隐私同意后发起微信登录，并把会话 code 存入本地状态。 */
export const completeLogin = async (userStore) => {
  if (!userStore?.privacyAgreed) {
    showErrorToast('请先同意隐私保护指引')
    return false
  }

  uni.showLoading({ title: '登录中', mask: true })
  const res = await wxLogin()
  uni.hideLoading()

  if (!res?.code) {
    uni.showModal({
      title: '登录失败',
      content: '暂时无法获取微信登录凭证，请稍后重试。',
      showCancel: false
    })
    return false
  }

  userStore.setLoginSession({
    sessionCode: res.code,
    loginAt: new Date().toISOString()
  })

  return res
}

/** 规范化订阅消息状态，供页面提示与进度展示使用。 */
const resolveSubscribeStatus = (result = {}, tmplIds = []) => {
  const values = tmplIds.map((id) => result[id]).filter(Boolean)
  if (values.includes('accept')) return 'accepted'
  if (values.length === 0) return 'unknown'
  return 'rejected'
}

/** 审核结果订阅申请，提交成功后调用。 */
export const requestAuditSubscribeMessage = (userStore) => {
  const tmplIds = getSubscribeTemplateIds()
  if (tmplIds.length === 0) {
    userStore?.setSubscribeStatus('unconfigured')
    showErrorToast('订阅模板未配置，已跳过')
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const status = resolveSubscribeStatus(res, tmplIds)
        userStore?.setSubscribeStatus(status)
        showErrorToast(status === 'accepted' ? '已订阅审核通知' : '您可以稍后在“我的”页再次订阅')
        resolve(res)
      },
      fail: () => {
        userStore?.setSubscribeStatus('failed')
        showErrorToast('订阅申请未完成')
        resolve(false)
      }
    })
  })
}

/** 将订阅状态转为页面可直接显示的中文文本。 */
export const getSubscribeStatusLabel = (status) => {
  const mapping = {
    unknown: '未申请',
    accepted: '已订阅',
    rejected: '已拒绝',
    failed: '申请失败',
    unconfigured: '模板未配置'
  }
  return mapping[status] || '未申请'
}
