<template>
  <view class="page page-with-nav page-shell page-shell--mine login-page">
    <view class="page-hero page-hero--mine">
      <view class="hero-badge">
        <uni-icons type="locked-filled" size="16" color="#ffffff" />
        <text>登录与隐私授权</text>
      </view>
      <text class="hero-title">先完成隐私同意与用户认证，再进入首页</text>
      <text class="hero-subtitle"
        >整个流程分为隐私确认、用户信息填写和进入系统三个阶段，页面会根据当前状态自动切换。</text
      >
    </view>

    <view class="login-steps">
      <view class="login-step" :class="{ 'login-step--active': step === 'privacy' }">
        <text class="login-step__index">1</text>
        <text class="login-step__label">隐私同意</text>
      </view>
      <view class="login-step-line"></view>
      <view class="login-step" :class="{ 'login-step--active': step === 'realname' }">
        <text class="login-step__index">2</text>
        <text class="login-step__label">用户认证</text>
      </view>
      <view class="login-step-line"></view>
      <view class="login-step" :class="{ 'login-step--active': step === 'done' }">
        <text class="login-step__index">3</text>
        <text class="login-step__label">进入系统</text>
      </view>
    </view>

    <view v-if="step === 'privacy'" class="themed-card">
      <text class="card-kicker">隐私说明</text>
      <text class="card-title-main">使用前请先阅读并同意《用户隐私保护指引》</text>
      <view class="login-info-list">
        <view class="login-info-item">
          <text class="login-info-item__title">我们收集的信息</text>
          <text class="login-info-item__desc">昵称、密码、志愿服务与荣誉申报数据。</text>
        </view>
        <view class="login-info-item">
          <text class="login-info-item__title">使用目的</text>
          <text class="login-info-item__desc">用于身份核验、积分审核与服务通知。</text>
        </view>
        <view class="login-info-item">
          <text class="login-info-item__title">保存期限</text>
          <text class="login-info-item__desc">仅在实现服务目的所必需期限内保存。</text>
        </view>
        <view class="login-info-item">
          <text class="login-info-item__title">您的权利</text>
          <text class="login-info-item__desc">您可以查询、更正、删除个人信息并申请账号注销。</text>
        </view>
      </view>

      <view class="action-group">
        <u-button type="primary" text="同意并继续" size="large" @click="handleAgree" />
        <u-button type="info" text="拒绝并退出" size="large" @click="handleReject" />
      </view>
    </view>

    <view v-else-if="step === 'realname'" class="themed-form-card">
      <text class="card-kicker">用户认证</text>
      <text class="card-title-main">请填写昵称和密码</text>
      <text class="field-helper"
        >后续将用于登录识别、积分审核与结果通知，请确保填写真实有效的信息。</text
      >

      <u-form :model="form" label-position="top">
        <view class="field-shell">
          <text class="field-label">昵称</text>
          <u-input v-model="form.name" placeholder="请输入昵称" />
        </view>
        <view class="field-shell">
          <text class="field-label">密码</text>
          <u-input v-model="form.phone" placeholder="请输入密码" />
        </view>
      </u-form>

      <view class="action-group">
        <u-button type="primary" text="提交用户信息" size="large" @click="handleSubmit" />
      </view>
    </view>

    <view v-else class="themed-card">
      <text class="card-kicker">流程完成</text>
      <text class="card-title-main">隐私协议与用户认证均已完成</text>
      <text class="card-text-main">系统正在为您进入首页，请稍候。</text>
    </view>

    <GlobalBottomNav current="index" :show-back="false" />
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { reactive, ref } from 'vue'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { login, submitRealname, fetchUserProfile } from '@/api/user'
import { useUserStore } from '@/store'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { wxLogin } from '@/utils/auth'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import { isPhoneValid } from '@/utils/rules'

const isAdminRole = (role) => role === 'admin' || role === 'super-admin'

/** 登录与合规入口页，统一处理隐私同意、微信登录和用户认证。 */

const userStore = useUserStore()
const step = ref('privacy')

const form = reactive({
  name: userStore.name || '',
  phone: userStore.phone || ''
})

/** 根据当前合规状态同步登录步骤，避免首屏反复切换节点。 */
const syncStep = () => {
  if (userStore.privacyAgreed && userStore.hasRealname) {
    step.value = 'done'
    return
  }
  step.value =
    userStore.privacyAgreed && (userStore.sessionCode || userStore.openid) ? 'realname' : 'privacy'
}

/** 同步后端返回的用户资料与积分信息。 */
const applyUserProfile = (profile = {}) => {
  const userInfo = profile.userInfo || {}
  const userName = userInfo.realName || userInfo.name || ''
  const userPhone = userInfo.phone || ''
  userStore.setUserInfo({
    name: userName,
    realName: userName,
    phone: userPhone,
    role: userInfo.role || '',
    submittedAt: new Date().toISOString()
  })
  userStore.setAdmin(isAdminRole(userInfo.role))
  if (profile.scoreSummary) {
    userStore.setPoints({
      volunteerPoints: Number(profile.scoreSummary.volunteerPoints || 0),
      honorPoints: Number(profile.scoreSummary.honorPoints || 0)
    })
  }
}

/** 拉取用户资料，补齐实名、角色与积分。 */
const refreshUserProfile = async () => {
  const profileData = unwrapApiData(await fetchUserProfile(), {})
  applyUserProfile(profileData)
  return profileData
}

/** 用户同意隐私后，再发起微信登录并进入用户认证步骤。 */
const handleAgree = async () => {
  userStore.setPrivacyAgreed(true)
  syncStep()
  uni.showLoading({ title: '登录中', mask: true })
  const wxLoginRes = await wxLogin()
  uni.hideLoading()

  if (!wxLoginRes?.code) {
    uni.showModal({
      title: '登录失败',
      content: '暂时无法获取微信登录凭证，请稍后重试。',
      showCancel: false
    })
    return
  }

  try {
    const loginData = unwrapApiData(await login({ code: wxLoginRes.code }), {})
    const now = new Date().toISOString()
    userStore.setLoginSession({
      sessionCode: wxLoginRes.code,
      openid: loginData.openid || '',
      token: loginData.token || '',
      loginAt: now
    })
    userStore.setAuthInfo({
      openid: loginData.openid || '',
      token: loginData.token || '',
      isAdmin: isAdminRole(loginData.userInfo?.role)
    })

    if (loginData.userInfo) {
      const userName = loginData.userInfo.realName || ''
      userStore.setUserInfo({
        name: userName,
        realName: userName,
        phone: loginData.userInfo.phone || '',
        role: loginData.userInfo.role || '',
        submittedAt: now
      })
    }

    if (loginData.needBinding) {
      syncStep()
      return
    }

    await refreshUserProfile()
    syncStep()
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '登录失败，请稍后重试'))
  }
}

/** 用户拒绝隐私协议时，直接退出小程序。 */
const handleReject = () => {
  uni.showModal({
    title: '提示',
    content: '您需要同意隐私指引才能使用本小程序。',
    confirmText: '退出',
    showCancel: false,
    success: () => {
      if (typeof uni.exitMiniProgram === 'function') {
        uni.exitMiniProgram()
      } else {
        uni.navigateBack()
      }
    }
  })
}

/** 校验用户信息并提交实名信息，完成后进入首页。 */
const handleSubmit = async () => {
  if (!form.name || !form.phone) {
    showErrorToast('请完整填写用户信息')
    return
  }
  if (!isPhoneValid(form.phone)) {
    showErrorToast('密码格式不正确')
    return
  }

  try {
    const bindData = unwrapApiData(
      await submitRealname({
        realName: form.name.trim(),
        phone: form.phone.trim(),
        openid: userStore.openid
      }),
      {}
    )

    userStore.setAuthInfo({
      openid: bindData.openid || userStore.openid,
      token: bindData.token || userStore.token,
      isAdmin: isAdminRole(bindData.userInfo?.role)
    })

    if (bindData.userInfo) {
      const userName = bindData.userInfo.realName || ''
      userStore.setUserInfo({
        name: userName,
        realName: userName,
        phone: bindData.userInfo.phone || '',
        role: bindData.userInfo.role || '',
        submittedAt: new Date().toISOString()
      })
    }

    await refreshUserProfile()
    syncStep()
    showSuccessToast('用户信息已提交')
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '提交失败，请稍后重试'))
  }
}

/** 登录页展示时，若已完成合规则直接回首页。 */
onShow(() => {
  syncStep()
  if (userStore.privacyAgreed && userStore.hasRealname) {
    uni.reLaunch({ url: '/pages/index/index' })
  }
})
</script>

<style scoped>
.login-page {
  gap: 18px;
}

.login-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.login-step {
  flex: 1;
  min-height: 78px;
  padding: 12px 10px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(172, 199, 231, 0.42);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.login-step--active {
  background: linear-gradient(135deg, rgba(29, 99, 216, 0.12), rgba(15, 168, 157, 0.12));
  border-color: rgba(29, 99, 216, 0.28);
}

.login-step__index {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #eaf2ff;
  color: #1648a5;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-step__label {
  font-size: 14px;
  color: #35516f;
  font-weight: 700;
}

.login-step-line {
  width: 12px;
  height: 2px;
  background: rgba(127, 149, 169, 0.4);
  flex-shrink: 0;
}

.login-info-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.login-info-item {
  padding: 14px 14px 12px;
  border-radius: 18px;
  background: #f8fbff;
  border: 1px solid #dbe7f2;
}

.login-info-item__title {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: #12304e;
}

.login-info-item__desc {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.75;
  color: #35516f;
}

.action-group {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
