<template>
  <view class="page page-with-tabbar page-shell page-shell--admin">
    <view class="page-hero page-hero--admin">
      <view class="hero-badge">
        <uni-icons type="gear-filled" size="16" color="#ffffff" />
        <text>管理后台</text>
      </view>
      <text class="hero-title">待办优先呈现，审核与数据处理更高效</text>
      <text class="hero-subtitle"
        >集中查看待审核数量、已处理情况和最近申报动态，便于管理员快速进入下一步操作。</text
      >
    </view>

    <view class="data-grid-two">
      <view class="data-stat-card data-stat-card--blue">
        <text class="data-stat-card__label">待审志愿服务</text>
        <text class="data-stat-card__value">{{ summary.pendingVolunteerCount }}</text>
      </view>
      <view class="data-stat-card data-stat-card--green">
        <text class="data-stat-card__label">待审荣誉获奖</text>
        <text class="data-stat-card__value">{{ summary.pendingHonorCount }}</text>
      </view>
      <view class="data-stat-card data-stat-card--amber">
        <text class="data-stat-card__label">已审核</text>
        <text class="data-stat-card__value">{{ summary.approvedCount }}</text>
      </view>
      <view class="data-stat-card data-stat-card--red">
        <text class="data-stat-card__label">已驳回</text>
        <text class="data-stat-card__value">{{ summary.rejectedCount }}</text>
      </view>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">管理功能</text>
      <text class="section-heading__desc">按场景进入具体页面</text>
    </view>

    <view class="feature-grid">
      <view
        v-if="userStore.isAdmin"
        class="feature-card feature-card--admin"
        @click="goTo('/pages/admin/roles')"
      >
        <view class="feature-card__head">
          <view class="feature-card__icon">
            <uni-icons type="personadd-filled" size="28" color="#ffffff" />
          </view>
          <text class="feature-card__title">{{ roleEntryTitle }}</text>
          <text class="feature-card__desc">{{ roleEntryDesc }}</text>
        </view>
        <view class="feature-card__foot">
          <text class="feature-card__meta">高风险操作需谨慎确认</text>
        </view>
      </view>

      <view class="list-row-card" @click="goTo('/pages/admin/import')">
        <view class="list-row-card__body">
          <text class="list-row-card__title">批量数据导入</text>
          <text class="list-row-card__desc">查看模板字段、选择 Excel 文件并提交导入任务。</text>
          <text class="list-row-card__meta">支持模板字段预览</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card" @click="goTo('/pages/admin/audit')">
        <view class="list-row-card__body">
          <text class="list-row-card__title">数据审核</text>
          <text class="list-row-card__desc">处理志愿服务与荣誉获奖申报，支持单条和批量操作。</text>
          <text class="list-row-card__meta">审核队列管理</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card" @click="goTo('/pages/admin/export')">
        <view class="list-row-card__body">
          <text class="list-row-card__title">全量数据导出</text>
          <text class="list-row-card__desc">按条件筛选并导出真实审核数据，便于统计与归档。</text>
          <text class="list-row-card__meta">支持筛选预览</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">最近申报动态</text>
      <text class="section-heading__desc">帮助快速掌握近期变化</text>
    </view>

    <view v-if="logs.length > 0" class="simple-list">
      <view v-for="item in logs" :key="item.id" class="themed-card log-card-pro">
        <text class="card-title-main log-card-pro__title">{{ item.content }}</text>
        <text class="card-text-main">{{ item.operator }} · {{ item.time }}</text>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="notification-filled" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">暂无最新申报动态</text>
      <text class="empty-state-pro__desc">当有新的提交或状态变化后，这里会自动展示最近记录。</text>
    </view>

    <GlobalBottomNav v-if="userStore.isAdmin" current="admin" :show-back="false" />
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { fetchAdminDashboard } from '@/api/admin'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast } from '@/utils/feedback'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import { useUserStore } from '@/store'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

/** 管理后台首页，展示审核统计和最近操作日志。 */

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.role === 'super-admin')
const roleEntryTitle = computed(() => (isSuperAdmin.value ? '设置管理员' : '禁用用户'))
const roleEntryDesc = computed(() =>
  isSuperAdmin.value
    ? '进入账号列表，一键设为管理员或回收管理员。'
    : '进入账号列表，按需禁用普通用户或管理员账号。'
)
const summary = ref({
  pendingVolunteerCount: 0,
  pendingHonorCount: 0,
  approvedCount: 0,
  rejectedCount: 0
})
const logs = ref([])

/** 跳转到具体管理功能页。 */
const goTo = (url) => {
  uni.navigateTo({ url })
}

/** 刷新管理首页统计与动态。 */
const loadDashboard = async () => {
  try {
    const data = unwrapApiData(await fetchAdminDashboard(), { summary: {}, logs: [] })
    summary.value = {
      pendingVolunteerCount: Number(data.summary?.pendingVolunteerCount || 0),
      pendingHonorCount: Number(data.summary?.pendingHonorCount || 0),
      approvedCount: Number(data.summary?.approvedCount || 0),
      rejectedCount: Number(data.summary?.rejectedCount || 0)
    }

    logs.value = (data.logs || []).map((item) => ({
      id: item.id,
      operator: item.applicantName || '未知用户',
      time: item.submitTime || '',
      content: `${item.type === 'volunteer' ? '志愿服务' : '荣誉获奖'}：${item.title || ''}（${item.statusText || '待审核'}）`
    }))
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '管理数据加载失败，请稍后重试'))
    summary.value = {
      pendingVolunteerCount: 0,
      pendingHonorCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    }
    logs.value = []
  }
}

/** 页面展示时刷新统计与日志，并同步 TabBar 选中状态。 */
onShow(() => {
  if (!userStore.isAdmin) {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  uni.hideTabBar()
  loadDashboard()
})
</script>

<style scoped>
.log-card-pro__title {
  margin-top: 0;
}
</style>
