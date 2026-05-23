/** 统一轻提示，保持页面反馈文案和展示方式一致。 */
export const showInfoToast = (title) => {
  // 统一保护：确保传给 showToast 的始终是字符串，避免传入对象或非文本导致显示异常
  let text = ''
  try {
    if (typeof title === 'string') text = title
    else if (title === undefined || title === null) text = ''
    else if (typeof title === 'object') text = JSON.stringify(title)
    else text = String(title)
  } catch (e) {
    // 万一 JSON.stringify 失败，降级为空字符串
    text = ''
  }

  // 调试输出：在控制台记录每次 toast 文本，便于排查莫名其妙的乱码或非字符串来源
  try {
    // 在小程序环境下使用 console.log
    console.log('[showInfoToast]', text)
  } catch (e) {
    // ignore
  }

  uni.showToast({
    title: text,
    icon: 'none',
    duration: 2200
  })
}

/** 统一错误提示。 */
export const showErrorToast = (title) => showInfoToast(title)

/** 统一成功提示。 */
export const showSuccessToast = (title) => showInfoToast(title)
