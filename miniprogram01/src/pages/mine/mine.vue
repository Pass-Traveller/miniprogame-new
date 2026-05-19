<template>
  <view class="page page-with-tabbar page-shell page-shell--mine">
    <view class="page-hero page-hero--mine">
      <view class="hero-badge">
        <uni-icons type="person-filled" size="16" color="#ffffff" />
        <text>我的积分中心</text>
      </view>

      <view class="mine-score-board">
        <view class="mine-score-board__main">
          <text class="mine-score-board__label">总积分</text>
          <text class="mine-score-board__value">{{ userStore.totalPoints }}</text>
        </view>
        <view class="mine-score-board__split"></view>
        <view class="mine-score-board__aside">
          <view class="mine-score-chip">
            <text class="mine-score-chip__label">志愿服务</text>
            <text class="mine-score-chip__value">{{ userStore.volunteerPoints }}</text>
          </view>
          <view class="mine-score-chip mine-score-chip--accent">
            <text class="mine-score-chip__label">荣誉获奖</text>
            <text class="mine-score-chip__value">{{ userStore.honorPoints }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-show="chartReady" class="glass-card">
      <Chart :refresh-key="chartRefreshKey" :trend-data="trendData" />
    </view>

    <view class="section-heading">
      <text class="section-heading__title">常用功能</text>
      <text class="section-heading__desc">点击进入对应页面</text>
    </view>

    <view class="simple-list">
      <view class="list-row-card" @click="goTo('/pages/application/index')">
        <view class="list-row-card__body">
          <text class="list-row-card__title">我的申请</text>
          <text class="list-row-card__meta">申报进度查询</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card" @click="showProfile">
        <view class="list-row-card__body">
          <text class="list-row-card__title">个人信息</text>
          <text class="list-row-card__meta">敏感信息已脱敏</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card" @click="goTo('/pages/privacy/index')">
        <view class="list-row-card__body">
          <text class="list-row-card__title">隐私设置</text>
          <text class="list-row-card__meta">授权与说明</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card list-row-card--logout" @click="logout">
        <view class="list-row-card__body">
          <text class="list-row-card__title">退出登录</text>
          <text class="list-row-card__meta list-row-card__meta--danger">安全退出</text>
        </view>
        <uni-icons type="right" size="18" color="#c85b51" />
      </view>
    </view>

    <GlobalBottomNav current="mine" :show-back="false" />
  </view>
</template>

<script setup>
import { onShow, onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { fetchUserProfile } from '@/api/user'
import { useUserStore } from '@/store'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { ensureComplianceReady } from '@/utils/auth'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import { maskName, maskPhone } from '@/utils/rules'
import Chart from '@/components/Chart.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'

const isAdminRole = (role) => role === 'admin' || role === 'super-admin'

/** 我的页面，展示积分、趋势图和常用功能入口。 */

const userStore = useUserStore()
const chartRefreshKey = ref(0)
const trendData = ref([])
const chartReady = ref(false)

/** 跳转到指定功能页。 */
const goTo = (url) => {
  uni.navigateTo({ url })
}

/** 脱敏展示用户认证信息，避免在前端完整暴露敏感字段。 */
const showProfile = () => {
  const maskedName = maskName(userStore.name)
  const maskedPhone = maskPhone(userStore.phone)
  uni.showModal({
    title: '个人信息',
    content: `昵称：${maskedName || '未填写'}\n手机号码：${maskedPhone || '未填写'}`,
    showCancel: false
  })
}

/** 退出登录后清理会话并回到合规登录入口。 */
const logout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确认退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        userStore.reset()
        showSuccessToast('已退出')
        uni.reLaunch({ url: '/pages/login/login' })
      }
    }
  })
}

/** 页面展示时拉取真实用户资料并刷新积分。 */
const syncProfile = async () => {
  try {
    const profileData = unwrapApiData(await fetchUserProfile(), {})
    const userInfo = profileData.userInfo || {}
    userStore.setUserInfo({
      name: userInfo.realName || userInfo.name || '',
      realName: userInfo.realName || userInfo.name || '',
      phone: userInfo.phone || '',
      role: userInfo.role || '',
      submittedAt: new Date().toISOString()
    })
    userStore.setAdmin(isAdminRole(userInfo.role))
    if (profileData.scoreSummary) {
      const volunteerPoints = Number(profileData.scoreSummary.volunteerPoints || 0)
      const honorPoints = Number(profileData.scoreSummary.honorPoints || 0)
      const totalPoints = volunteerPoints + honorPoints
      userStore.setPoints({
        volunteerPoints,
        honorPoints
      })

      /** 使用真实积分生成近 5 年趋势，当前年显示总积分。 */
      const currentYear = new Date().getFullYear()
      trendData.value = Array.from({ length: 5 }, (_, index) => {
        const year = currentYear - 4 + index
        return {
          label: `${year}年`,
          total: year === currentYear ? totalPoints : 0
        }
      })
    }
    chartRefreshKey.value += 1
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '个人信息加载失败，请稍后重试'))
  }
}

onLoad(() => {
  chartReady.value = true
})

onShow(() => {
  uni.hideTabBar()
  if (!ensureComplianceReady(userStore, { redirect: true, toast: false })) {
    return
  }
  syncProfile()
})
</script>

<style scoped>
.mine-score-board {
  margin-top: 20px;
  border-radius: 24px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  gap: 16px;
}

.mine-score-board__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mine-score-board__label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.84);
}

.mine-score-board__value {
  margin-top: 10px;
  font-size: 52px;
  font-weight: 800;
  line-height: 1;
}

.mine-score-board__split {
  width: 1px;
  background: rgba(255, 255, 255, 0.2);
}

.mine-score-board__aside {
  width: 118px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mine-score-chip {
  border-radius: 18px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.16);
}

.mine-score-chip--accent {
  background: rgba(255, 240, 209, 0.18);
}

.mine-score-chip__label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.84);
}

.mine-score-chip__value {
  display: block;
  margin-top: 8px;
  font-size: 24px;
  font-weight: 800;
}

.list-row-card--logout {
  border-color: rgba(216, 181, 181, 0.52);
}

.list-row-card__meta--danger {
  background: rgba(200, 91, 81, 0.1);
  color: #c85b51;
}
</style>
