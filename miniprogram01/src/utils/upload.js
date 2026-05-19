import { showErrorToast } from '@/utils/feedback'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const FILE_SELECT_UNSUPPORTED = 'unsupported'

/** 上传前先说明用途，符合微信“先说明、后申请”的合规要求。 */
export const confirmMediaPermission = (sourceType) =>
  new Promise((resolve) => {
    const sourceLabel = sourceType === 'camera' ? '相机' : '相册'
    uni.showModal({
      title: '权限申请说明',
      content: `需要使用您的${sourceLabel}上传佐证材料，仅在您主动提交申报时使用。是否继续？`,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    })
  })

/** 打开系统权限设置页，便于用户重新授权。 */
export const openSystemPermissionSetting = () =>
  new Promise((resolve) => {
    if (typeof uni.openSetting !== 'function') {
      showErrorToast('当前环境暂不支持打开权限设置')
      resolve(false)
      return
    }

    uni.openSetting({
      success: (res) => resolve(res),
      fail: () => resolve(false)
    })
  })

/** 判断是否属于用户取消选择，取消不应被视为权限拒绝。 */
const isCancelError = (message = '') => /cancel/i.test(message)

/** 判断是否属于权限被拒绝，便于给出打开设置的引导。 */
const isPermissionDeniedError = (message = '') =>
  /auth deny|authorize|permission|denied/i.test(message)

/** 统一调起图片选择，并过滤超过 50MB 的图片。 */
export const chooseEvidenceImages = async ({
  sourceType = 'album',
  count = 1,
  maxSize = MAX_FILE_SIZE
} = {}) => {
  const confirmed = await confirmMediaPermission(sourceType)
  if (!confirmed) {
    return { files: [], status: 'cancelled' }
  }

  try {
    const res = await new Promise((resolve, reject) => {
      uni.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: [sourceType],
        sizeType: ['compressed'],
        camera: sourceType === 'camera' ? 'back' : undefined,
        success: resolve,
        fail: reject
      })
    })

    const selectedFiles = res?.tempFiles || []
    const validFiles = selectedFiles
      .filter((item) => Number(item.size || 0) <= maxSize)
      .map((item, index) => ({
        url: item.tempFilePath,
        name: item.tempFilePath?.split('/').pop() || `evidence-${Date.now()}-${index + 1}.jpg`,
        size: Number(item.size || 0),
        type: 'image',
        sourceType
      }))

    if (validFiles.length !== selectedFiles.length) {
      showErrorToast('超过50MB的图片无法上传，请重新选择')
    }

    return {
      files: validFiles,
      status: 'granted'
    }
  } catch (error) {
    const message = error?.errMsg || ''

    if (isCancelError(message)) {
      return { files: [], status: 'cancelled' }
    }

    if (isPermissionDeniedError(message)) {
      uni.showModal({
        title: '权限未开启',
        content: '未获得所需权限，是否前往系统设置重新开启？',
        success: async (res) => {
          if (res.confirm) {
            await openSystemPermissionSetting()
          }
        }
      })
      return { files: [], status: 'denied' }
    }

    showErrorToast('选择图片失败，请重试')
    return { files: [], status: 'failed' }
  }
}

/** 前端仅做流程占位，真正的文本与图片安全校验由后端接入微信接口完成。 */
export const checkContentSecurity = async (payload = {}) => {
  const hasText = Object.values(payload?.text || {}).some((item) => `${item || ''}`.trim())
  const hasFiles = Array.isArray(payload?.files) && payload.files.length > 0

  if (!hasText && !hasFiles) {
    return false
  }

  uni.showLoading({ title: '内容校验中', mask: true })
  uni.hideLoading()
  return true
}

/** 页面展示用的权限状态文案。 */
export const getPermissionStatusLabel = (status) => {
  const mapping = {
    unknown: '未申请',
    granted: '已允许',
    denied: '已拒绝',
    failed: '申请失败'
  }
  return mapping[status] || '未申请'
}

/** 支持上传的文件扩展名，传给微信接口时不带点号。 */
const ALLOWED_FILE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'csv']

/** 上传文件前的权限说明 */
export const confirmFilePermission = () =>
  new Promise((resolve) => {
    uni.showModal({
      title: '权限申请说明',
      content:
        '需要访问您的文件以上传佐证材料（如 Word、Excel、PDF 等），仅在您主动提交申报时使用。是否继续？',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    })
  })

/** 获取文件路径，兼容 chooseMessageFile 与 chooseFile 返回结构。 */
const getSelectedFilePath = (item = {}) => item.tempFilePath || item.path || item.url || ''

/** 获取文件名，优先使用微信返回的 name，兜底从路径解析。 */
const getSelectedFileName = (item = {}, index = 0) => {
  const filePath = getSelectedFilePath(item)
  return item.name || filePath.split('/').pop() || `file-${Date.now()}-${index + 1}`
}

/** 判断用户所选文件扩展名是否在允许范围内。 */
const isAllowedEvidenceFile = (item = {}, index = 0) => {
  const fileName = getSelectedFileName(item, index)
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  return ALLOWED_FILE_EXTENSIONS.includes(extension)
}

/** 使用微信消息文件选择器选取文件，小程序端优先使用该能力。 */
const chooseMessageEvidenceFiles = ({ count }) =>
  new Promise((resolve, reject) => {
    if (typeof uni.chooseMessageFile !== 'function') {
      reject(new Error(FILE_SELECT_UNSUPPORTED))
      return
    }

    uni.chooseMessageFile({
      count,
      type: 'file',
      extension: ALLOWED_FILE_EXTENSIONS,
      success: resolve,
      fail: reject
    })
  })

/** 使用通用文件选择器兜底，兼容部分非微信端或旧构建环境。 */
const chooseSystemEvidenceFiles = ({ count }) =>
  new Promise((resolve, reject) => {
    if (typeof uni.chooseFile !== 'function') {
      reject(new Error(FILE_SELECT_UNSUPPORTED))
      return
    }

    uni.chooseFile({
      count,
      type: 'file',
      extension: ALLOWED_FILE_EXTENSIONS,
      success: resolve,
      fail: reject
    })
  })

/** 选择原始文件结果，微信端优先走 chooseMessageFile，非取消失败时再兜底。 */
const chooseRawEvidenceFiles = async ({ count }) => {
  try {
    return await chooseMessageEvidenceFiles({ count })
  } catch (messageFileError) {
    const message = messageFileError?.errMsg || messageFileError?.message || ''
    if (isCancelError(message)) {
      throw messageFileError
    }
  }

  return chooseSystemEvidenceFiles({ count })
}

/** 统一调起文件选择，支持 Word、Excel、PDF 等常见格式。 */
export const chooseEvidenceFiles = async ({ count = 1, maxSize = MAX_FILE_SIZE } = {}) => {
  const confirmed = await confirmFilePermission()
  if (!confirmed) {
    return { files: [], status: 'cancelled' }
  }

  try {
    const res = await chooseRawEvidenceFiles({ count })
    const selectedFiles = res?.tempFiles || []
    const allowedFiles = selectedFiles.filter(isAllowedEvidenceFile)
    const validFiles = allowedFiles
      .filter((item) => Number(item.size || 0) <= maxSize)
      .map((item, index) => ({
        url: getSelectedFilePath(item),
        name: getSelectedFileName(item, index),
        size: Number(item.size || 0),
        type: 'file',
        mimeType: item.type || ''
      }))

    if (allowedFiles.length !== selectedFiles.length) {
      showErrorToast('仅支持 Word、Excel、PPT、PDF、TXT、CSV 文件')
    }

    if (validFiles.length !== allowedFiles.length) {
      showErrorToast('部分文件超过 10MB，已自动过滤')
    }

    return {
      files: validFiles,
      status: 'granted'
    }
  } catch (error) {
    const message = error?.errMsg || error?.message || ''

    if (isCancelError(message)) {
      return { files: [], status: 'cancelled' }
    }

    if (message === FILE_SELECT_UNSUPPORTED) {
      showErrorToast('当前环境暂不支持选择文件，请改用图片上传')
      return { files: [], status: 'unsupported' }
    }

    if (isPermissionDeniedError(message)) {
      uni.showModal({
        title: '权限未开启',
        content: '未获得所需权限，是否前往系统设置重新开启？',
        success: async (res) => {
          if (res.confirm) {
            await openSystemPermissionSetting()
          }
        }
      })
      return { files: [], status: 'denied' }
    }

    showErrorToast('选择文件失败，请重试')
    return { files: [], status: 'failed' }
  }
}
