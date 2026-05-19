<template>
  <view class="page page-with-nav page-shell">
    <view class="page-hero">
      <view class="hero-badge">
        <uni-icons type="staff-filled" size="16" color="#ffffff" />
        <text>银才荟适老服务平台</text>
      </view>
      <text class="hero-title">国网退休人员积分申报平台</text>

      <view class="hero-metrics">
        <view class="hero-pill">
          <text class="hero-pill__label">当前总积分</text>
          <text class="hero-pill__value">{{ totalPoints }}</text>
        </view>
      </view>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">常用申报入口</text>
      <text class="section-heading__desc">按业务类型快速进入</text>
    </view>

    <view class="feature-grid">
      <view class="feature-card feature-card--volunteer" @click="goVolunteer">
        <view class="feature-card__head">
          <view class="feature-card__title-row">
            <view class="feature-card__icon">
              <uni-icons type="heart-filled" size="28" color="#ffffff" />
            </view>
            <text class="feature-card__title">志愿服务</text>
          </view>
          <text class="feature-card__desc">申报志愿活动、查看积分规则与历史记录。</text>
          <text class="feature-card__meta">五类服务模块可选</text>
        </view>
      </view>

      <view class="feature-card feature-card--honor" @click="goHonor">
        <view class="feature-card__head">
          <view class="feature-card__title-row">
            <view class="feature-card__icon">
              <uni-icons type="medal" size="28" color="#ffffff" />
            </view>
            <text class="feature-card__title">荣誉获奖</text>
          </view>
          <text class="feature-card__desc">按荣誉级别提交材料，系统自动带出对应积分。</text>
          <text class="feature-card__meta">四级荣誉一键申报</text>
        </view>
      </view>
    </view>

    <view class="themed-card quick-guide">
      <text class="card-kicker">使用说明</text>
      <text class="card-title-main">按步骤操作，填写过程更省心</text>
      <view class="guide-list">
        <view class="guide-item">
          <text class="guide-index">01</text>
          <text class="guide-text">选择对应业务模块，查看积分说明后进入申报。</text>
        </view>
        <view class="guide-item">
          <text class="guide-index">02</text>
          <text class="guide-text">按页面提示填写时间、地点、内容并上传佐证材料。</text>
        </view>
        <view class="guide-item">
          <text class="guide-index">03</text>
          <text class="guide-text">提交后等待管理员审核，可在“我的申请”中查看结果。</text>
        </view>
      </view>
    </view>

    <GlobalBottomNav current="index" :show-back="false" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'

/** 首页，展示品牌欢迎信息、总积分和两大业务入口。 */

const userStore = useUserStore()
const totalPoints = computed(() => userStore.totalPoints)

/** 标记是否已初始化积分数据，避免重复加载。 */
let initialized = false

/** 进入志愿服务模块。 */
const goVolunteer = () => {
  uni.navigateTo({ url: '/pages/volunteer/index' })
}

/** 进入荣誉获奖模块。 */
const goHonor = () => {
  uni.navigateTo({ url: '/pages/honor/index' })
}

/** 页面显示时同步积分，仅在首次加载时获取数据。 */
const syncPoints = () => {
  if (initialized) return
  userStore.setPoints({
    volunteerPoints: 0,
    honorPoints: 0
  })
  initialized = true
}

onShow(() => {
  uni.hideTabBar()
  syncPoints()
})
</script>

<style scoped>
.feature-card__head {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.feature-card__title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.feature-card__icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 10px 18px rgba(18, 67, 140, 0.12);
  flex-shrink: 0;
}

.feature-card__title {
  margin-top: 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  flex: 1;
}

.feature-card__desc {
  margin-top: 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.92);
  max-width: 100%;
}

.feature-card__meta {
  margin-top: 0;
  width: fit-content;
  min-width: 176px;
  max-width: 100%;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.2px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.feature-card {
  min-height: 182px;
  padding: 20px 22px 12px;
}

.feature-card::after {
  left: 18px;
  bottom: 8px;
  width: 72px;
  height: 72px;
  opacity: 0.18;
}

.quick-guide {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.guide-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.guide-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.guide-index {
  min-width: 38px;
  height: 38px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(29, 99, 216, 0.14), rgba(21, 164, 144, 0.16));
  color: #1648a5;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.guide-text {
  flex: 1;
  font-size: 15px;
  line-height: 1.75;
  color: #35516f;
}

.hero-pill__value--small {
  font-size: 20px;
  line-height: 1.2;
}
</style>
