<template>
  <view class="page page-with-nav page-shell page-shell--mine">
    <view class="page-hero page-hero--mine">
      <view class="hero-badge">
        <uni-icons type="locked-filled" size="16" color="#ffffff" />
        <text>隐私设置</text>
      </view>
      <text class="hero-title">隐私、权限与账号状态统一查看</text>
      <text class="hero-subtitle">便于用户了解当前授权状态、查看隐私保护说明，并在需要时进行系统权限管理。</text>
    </view>

    <view class="themed-card">
      <text class="card-kicker">当前合规状态</text>
      <text class="card-title-main">已为您汇总当前授权与认证情况</text>
      <view class="privacy-status-list">
        <view class="privacy-status-item">
          <text class="privacy-status-item__label">隐私协议</text>
          <text class="privacy-status-item__value">{{ userStore.privacyAgreed ? '已同意' : '未同意' }}</text>
        </view>
        <view class="privacy-status-item">
          <text class="privacy-status-item__label">用户认证</text>
          <text class="privacy-status-item__value">{{ userStore.hasRealname ? '已完成' : '未完成' }}</text>
        </view>
        <view
          class="privacy-status-item privacy-status-item--clickable"
          hover-class="privacy-status-item--hover"
          @click="handleSubscribe"
        >
          <text class="privacy-status-item__label">消息订阅</text>
          <view class="privacy-status-item__action">
            <text class="privacy-status-item__value">
              {{ subscribing ? '申请中' : subscribeStatusLabel }}
            </text>
            <uni-icons type="right" size="16" color="#1648a5" />
          </view>
        </view>
        <view class="privacy-status-item">
          <text class="privacy-status-item__label">相册权限</text>
          <text class="privacy-status-item__value">{{ albumPermissionLabel }}</text>
        </view>
        <view class="privacy-status-item">
          <text class="privacy-status-item__label">相机权限</text>
          <text class="privacy-status-item__value">{{ cameraPermissionLabel }}</text>
        </view>
      </view>
    </view>

    <view class="simple-list">
      <view class="list-row-card" @click="openGuide">
        <view class="list-row-card__body">
          <text class="list-row-card__title">用户隐私保护指引</text>
          <text class="list-row-card__desc">查看平台收集的信息范围、用途、保存期限和您的相关权利说明。</text>
          <text class="list-row-card__meta">隐私说明详情</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card" @click="openPermissions">
        <view class="list-row-card__body">
          <text class="list-row-card__title">系统权限管理</text>
          <text class="list-row-card__desc">重新开启相册、相机等权限，方便后续上传佐证材料。</text>
          <text class="list-row-card__meta">跳转系统设置</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card privacy-danger-card" @click="confirmCancel">
        <view class="list-row-card__body">
          <text class="list-row-card__title">账号注销</text>
          <text class="list-row-card__desc">提交注销申请后，相关个人信息会按规则进入删除或匿名化流程。</text>
          <text class="list-row-card__meta privacy-danger-card__meta">高敏感操作</text>
        </view>
        <uni-icons type="right" size="18" color="#c85b51" />
      </view>
    </view>

    <GlobalBottomNav current="mine" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useUserStore } from '@/store'
import {
  ensureComplianceReady,
  getSubscribeStatusLabel,
  requestAuditSubscribeMessage
} from '@/utils/auth'
import { showSuccessToast } from '@/utils/feedback'
import { getPermissionStatusLabel, openSystemPermissionSetting } from '@/utils/upload'

/** 隐私设置页，集中展示隐私、订阅和系统权限状态。 */

const userStore = useUserStore()
const subscribing = ref(false)
const subscribeStatusLabel = computed(() => getSubscribeStatusLabel(userStore.subscribeAuditResult))
const albumPermissionLabel = computed(() => getPermissionStatusLabel(userStore.albumPermission))
const cameraPermissionLabel = computed(() => getPermissionStatusLabel(userStore.cameraPermission))

/** 用户主动点击消息订阅时，调用微信订阅消息接口并记录申请结果。 */
const handleSubscribe = async () => {
  if (subscribing.value) return
  if (!ensureComplianceReady(userStore, { redirect: true, toast: true })) {
    return
  }

  subscribing.value = true
  try {
    await requestAuditSubscribeMessage(userStore)
  } finally {
    subscribing.value = false
  }
}

/** 打开隐私指引详情，方便用户再次查阅信息收集范围。 */
const openGuide = () => {
  uni.showModal({
    title: '用户隐私保护指引',
    content:
      '我们仅收集昵称、手机号码、申报数据和通知订阅状态，用于用户认证、积分审核和结果通知。您可在本页查看权限状态并申请账号注销。',
    showCancel: false
  })
}

/** 打开微信系统设置页，供用户重新开启相册或相机权限。 */
const openPermissions = async () => {
  await openSystemPermissionSetting()
}

/** 账号注销时提示后续处理时效，符合隐私告知要求。 */
const confirmCancel = () => {
  uni.showModal({
    title: '账号注销',
    content: '注销后，您的个人信息将在 7 个工作日内删除或匿名化处理。确认提交注销申请吗？',
    success: (res) => {
      if (res.confirm) {
        showSuccessToast('已提交注销申请')
      }
    }
  })
}
</script>

<style scoped>
.privacy-status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.privacy-status-item {
  min-height: 54px;
  padding: 12px 14px;
  border-radius: 18px;
  background: #f8fbff;
  border: 1px solid #dbe7f2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.privacy-status-item__label {
  font-size: 15px;
  color: #35516f;
  font-weight: 700;
}

.privacy-status-item__value {
  font-size: 14px;
  color: #1648a5;
  font-weight: 700;
}

.privacy-status-item--clickable {
  transition: background 0.2s ease, border-color 0.2s ease;
}

.privacy-status-item--hover {
  background: #edf5ff;
  border-color: rgba(29, 99, 216, 0.28);
}

.privacy-status-item__action {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.privacy-danger-card {
  border-color: rgba(216, 181, 181, 0.56);
}

.privacy-danger-card__meta {
  background: rgba(200, 91, 81, 0.1);
  color: #c85b51;
}
</style>
