<template>
  <view class="page page-with-nav page-shell page-shell--mine">
    <view class="page-hero page-hero--mine">
      <view class="hero-badge">
        <uni-icons type="compose" size="16" color="#ffffff" />
        <text>我的申请</text>
      </view>
      <text class="hero-title">申报状态集中查看，驳回记录可快速重提</text>
      <text class="hero-subtitle"
        >统一查看志愿服务与荣誉获奖申请，便于及时了解审核进度与处理结果。</text
      >
    </view>

    <view class="data-grid-three">
      <view class="data-mini-card data-mini-card--amber">
        <text class="data-mini-card__label">待审核</text>
        <text class="data-mini-card__value">{{ stats.pending }}</text>
      </view>
      <view class="data-mini-card data-mini-card--green">
        <text class="data-mini-card__label">已通过</text>
        <text class="data-mini-card__value">{{ stats.approved }}</text>
      </view>
      <view class="data-mini-card data-mini-card--red">
        <text class="data-mini-card__label">已驳回</text>
        <text class="data-mini-card__value">{{ stats.rejected }}</text>
      </view>
    </view>

    <view class="themed-card tabs-shell">
      <u-tabs :list="tabs" :current="current" @change="onTabChange" />
    </view>

    <view v-if="filtered.length > 0" class="simple-list">
      <view v-for="item in filtered" :key="item.id" class="list-row-card" @click="showDetail(item)">
        <view class="list-row-card__body">
          <view class="application-card__head">
            <text class="list-row-card__title">{{ item.title }}</text>
            <u-tag :text="item.statusText" size="mini" :type="item.tagType" />
          </view>
          <text class="list-row-card__desc">{{ item.categoryName }}</text>
          <text class="list-row-card__desc">{{ item.recordDesc }}</text>
          <text class="list-row-card__meta">提交时间：{{ item.submitTime }}</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="paperplane-filled" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">当前状态下暂无申报记录</text>
      <text class="empty-state-pro__desc">后续提交新申请后，会自动出现在对应状态列表中。</text>
    </view>

    <view v-if="selectedRecord" class="detail-mask" @click.self="closeDetail">
      <view class="detail-panel">
        <text class="detail-title">{{ selectedRecord.title }}</text>
        <view class="detail-grid">
          <view class="detail-row">
            <text class="detail-label">申报类型</text>
            <text class="detail-text">{{ selectedRecord.categoryName }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">活动/获奖时间</text>
            <text class="detail-text">{{ selectedRecord.activityTime }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">申报积分</text>
            <text class="detail-text">{{ selectedRecord.claimedPoints }} 分</text>
          </view>
          <view v-if="selectedRecord.status === 'approved'" class="detail-row">
            <text class="detail-label">审核通过积分</text>
            <text class="detail-text">{{ selectedRecord.approvedPoints }} 分</text>
          </view>
          <view v-if="selectedRecord.location" class="detail-row">
            <text class="detail-label">活动地点</text>
            <text class="detail-text">{{ selectedRecord.location }}</text>
          </view>
          <view v-if="selectedRecord.organization" class="detail-row">
            <text class="detail-label">授奖单位</text>
            <text class="detail-text">{{ selectedRecord.organization }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">内容说明</text>
            <text class="detail-text">{{ selectedRecord.content }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">佐证材料</text>
            <text class="detail-text">{{
              selectedRecord.evidenceFiles.join('、') || '暂无材料'
            }}</text>
          </view>
          <view v-if="selectedRecord.rejectReason" class="detail-row">
            <text class="detail-label">驳回原因</text>
            <text class="detail-text warning-text">{{ selectedRecord.rejectReason }}</text>
          </view>
        </view>

        <view class="detail-actions">
          <u-button
            v-if="selectedRecord.status === 'rejected'"
            type="primary"
            text="修改并重提"
            size="large"
            @click="resubmitSelected"
          />
          <u-button type="info" plain text="关闭" size="large" @click="closeDetail" />
        </view>
      </view>
    </view>

    <GlobalBottomNav current="mine" />
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { fetchHonorRecords } from '@/api/honor'
import { fetchVolunteerRecords } from '@/api/volunteer'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useUserStore } from '@/store'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import { ensureComplianceReady } from '@/utils/auth'
import { getHonorLevel, getVolunteerModule } from '@/utils/rules'

/** 我的申请页面，展示待审核、已通过、已驳回记录，并支持驳回后重提。 */

const tabs = [{ name: '待审核' }, { name: '已通过' }, { name: '已驳回' }]

const current = ref(0)
const records = ref([])
const selectedRecord = ref(null)
const userStore = useUserStore()
const stats = computed(() => ({
  pending: records.value.filter((item) => item.status === 'pending').length,
  approved: records.value.filter((item) => item.status === 'approved').length,
  rejected: records.value.filter((item) => item.status === 'rejected').length
}))

/** 批量拉取某个接口的全部分页数据。 */
const fetchAllPages = async (fetcher, params = {}) => {
  const result = []
  let page = 1
  const pageSize = 50
  let total = 0

  do {
    const data = unwrapApiData(await fetcher({ ...params, page, pageSize }), { list: [], total: 0 })
    const list = Array.isArray(data.list) ? data.list : []
    total = Number(data.total || 0)
    result.push(...list)
    if (list.length < pageSize) {
      break
    }
    page += 1
  } while (result.length < total)

  return result
}

/** 映射志愿记录为页面统一展示结构。 */
const mapVolunteerRecord = (item = {}) => ({
  id: item.id,
  type: 'volunteer',
  moduleId: item.moduleId || '',
  title: item.title || '志愿服务申报',
  categoryName: item.categoryName || getVolunteerModule(item.moduleId)?.name || '志愿服务',
  activityTime: item.activityTime || '',
  submitTime: item.submitTime || item.activityTime || '',
  location: item.location || '',
  organization: '',
  content: item.content || '',
  claimedPoints: Number(item.claimedPoints || item.points || 0),
  approvedPoints: Number(item.approvedPoints || 0),
  status: item.status || 'pending',
  statusText: item.statusText || '待审核',
  tagType: item.tagType || 'warning',
  rejectReason: item.rejectReason || '',
  evidenceFiles: Array.isArray(item.evidenceFiles) ? item.evidenceFiles : []
})

/** 映射荣誉记录为页面统一展示结构。 */
const mapHonorRecord = (item = {}) => ({
  id: item.id,
  type: 'honor',
  levelId: item.levelId || '',
  title: item.title || '荣誉获奖申报',
  categoryName: item.categoryName || getHonorLevel(item.levelId)?.name || '荣誉获奖',
  activityTime: item.activityTime || '',
  submitTime: item.submitTime || item.activityTime || '',
  location: '',
  organization: item.organization || '',
  content: item.content || item.title || '',
  claimedPoints: Number(item.claimedPoints || item.points || 0),
  approvedPoints: Number(item.approvedPoints || 0),
  status: item.status || 'pending',
  statusText: item.statusText || '待审核',
  tagType: item.tagType || 'warning',
  rejectReason: item.rejectReason || '',
  evidenceFiles: Array.isArray(item.evidenceFiles) ? item.evidenceFiles : []
})

/** 拉取并合并真实申请记录。 */
const loadRecords = async () => {
  if (!ensureComplianceReady(userStore, { redirect: true, toast: false })) {
    return
  }

  try {
    const [volunteerList, honorList] = await Promise.all([
      fetchAllPages(fetchVolunteerRecords),
      fetchAllPages(fetchHonorRecords)
    ])

    records.value = [
      ...volunteerList.map(mapVolunteerRecord),
      ...honorList.map(mapHonorRecord)
    ].sort(
      (left, right) =>
        new Date(right.submitTime || 0).getTime() - new Date(left.submitTime || 0).getTime()
    )
  } catch (error) {
    records.value = []
    showErrorToast(resolveApiErrorMessage(error, '申请记录加载失败，请稍后重试'))
  }
}

/** 根据当前页签返回展示记录。 */
const filtered = computed(() => {
  const statusKey = ['pending', 'approved', 'rejected'][current.value]
  return records.value
    .filter((item) => item.status === statusKey)
    .map((item) => ({
      ...item,
      recordDesc:
        item.type === 'volunteer'
          ? `志愿服务申报 ${item.claimedPoints} 分`
          : `荣誉获奖申报 ${item.claimedPoints} 分`
    }))
})

/** 切换顶部状态 Tab。 */
const onTabChange = (index) => {
  current.value = typeof index === 'number' ? index : index?.index || 0
}

/** 打开申报详情弹层。 */
const showDetail = (item) => {
  selectedRecord.value = item
}

/** 关闭申报详情弹层。 */
const closeDetail = () => {
  selectedRecord.value = null
}

/** 驳回记录引导用户回到对应申报页重新提交。 */
const resubmitSelected = () => {
  if (!selectedRecord.value) return
  const record = selectedRecord.value
  closeDetail()
  current.value = 0
  if (record.type === 'volunteer') {
    const volunteerRouteMap = {
      'red-culture': '/pages/volunteer/redCulture',
      'community-governance': '/pages/volunteer/governance',
      'enterprise-service': '/pages/volunteer/enterprise',
      'elder-help': '/pages/volunteer/helpOld',
      'other-service': '/pages/volunteer/other'
    }
    uni.navigateTo({ url: volunteerRouteMap[record.moduleId] || '/pages/volunteer/index' })
    showSuccessToast('请修改后重新提交')
    return
  }
  const honorRouteMap = {
    national: '/pages/honor/national',
    provincial: '/pages/honor/provincial',
    bureau: '/pages/honor/bureau',
    factory: '/pages/honor/factory'
  }
  uni.navigateTo({ url: honorRouteMap[record.levelId] || '/pages/honor/index' })
  showSuccessToast('请修改后重新提交')
}

onShow(() => {
  loadRecords()
})
</script>

<style scoped>
.data-grid-three {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.data-mini-card {
  border-radius: 22px;
  padding: 16px 12px;
  color: #ffffff;
  box-shadow: 0 16px 28px rgba(19, 58, 107, 0.12);
}

.data-mini-card--amber {
  background: linear-gradient(135deg, #d58b18 0%, #efb14a 100%);
}

.data-mini-card--green {
  background: linear-gradient(135deg, #11907f 0%, #16b39f 100%);
}

.data-mini-card--red {
  background: linear-gradient(135deg, #c85b51 0%, #e27b69 100%);
}

.data-mini-card__label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
}

.data-mini-card__value {
  display: block;
  margin-top: 10px;
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}

.tabs-shell {
  padding-top: 14px;
}

.application-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-mask {
  position: fixed;
  inset: 0;
  background: rgba(13, 34, 58, 0.44);
  display: flex;
  align-items: flex-end;
  z-index: 30;
}

.detail-panel {
  width: 100%;
  max-height: 82vh;
  background: #ffffff;
  border-radius: 28px 28px 0 0;
  padding: 22px 18px calc(22px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow-y: auto;
}

.detail-title {
  font-size: 20px;
  font-weight: 800;
  color: #12304e;
}

.detail-grid {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-label {
  font-size: 13px;
  color: #7f95a9;
}

.detail-text {
  font-size: 15px;
  color: #35516f;
  line-height: 1.75;
}

.warning-text {
  color: #c85b51;
}

.detail-actions {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
