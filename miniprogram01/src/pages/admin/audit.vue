<template>
  <view class="page page-with-nav page-shell page-shell--admin">
    <view class="page-hero page-hero--admin">
      <view class="hero-badge">
        <uni-icons type="checkbox-filled" size="16" color="#ffffff" />
        <text>数据审核</text>
      </view>
      <text class="hero-title">待审核数据集中处理，支持单条与批量操作</text>
      <text class="hero-subtitle"
        >按页签查看志愿服务、荣誉获奖和历史处理记录，提高审核效率与准确性。</text
      >
    </view>

    <view class="themed-card tabs-shell">
      <u-tabs :list="tabs" :current="current" @change="onTabChange" />
    </view>

    <view class="toolbar-shell">
      <text class="toolbar-shell__text">当前列表 {{ filtered.length }} 条</text>
      <text v-if="isPendingTab" class="toolbar-shell__text">已选 {{ selectedIds.length }} 条</text>
    </view>

    <view v-if="isPendingTab" class="action-group">
      <u-button type="info" plain :text="selectAllText" @click="toggleSelectAll" />
      <u-button
        type="primary"
        text="批量通过"
        :disabled="selectedIds.length === 0"
        @click="approveSelected"
      />
      <u-button
        type="error"
        text="批量驳回"
        :disabled="selectedIds.length === 0"
        @click="rejectSelected"
      />
    </view>

    <view v-if="filtered.length > 0" class="simple-list">
      <view v-for="item in filtered" :key="item.id" class="list-row-card audit-card-pro">
        <view class="list-row-card__body" @click="openDetail(item)">
          <view class="audit-card-pro__head">
            <text class="list-row-card__title">{{ item.title }}</text>
            <u-tag :text="item.statusText" size="mini" :type="item.tagType" />
          </view>
          <text class="list-row-card__desc"
            >{{ item.applicantName }} · {{ item.categoryName }}</text
          >
          <text class="list-row-card__desc">{{ item.desc }}</text>
        </view>

        <view v-if="isPendingTab" class="audit-card-pro__actions">
          <u-button
            type="info"
            plain
            :text="selectedIds.includes(item.id) ? '取消勾选' : '勾选'"
            @click="toggleSelect(item.id)"
          />
          <u-button type="primary" plain text="审核" @click="openDetail(item)" />
        </view>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="checkbox-filled" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">当前筛选下暂无审核数据</text>
      <text class="empty-state-pro__desc">后续有新的申报提交后，会自动出现在对应列表中。</text>
    </view>

    <view v-if="detailRecord" class="detail-mask" @click.self="closeDetail">
      <view class="detail-panel">
        <text class="detail-title">{{ detailRecord.title }}</text>
        <view class="detail-grid">
          <view class="detail-row">
            <text class="detail-label">申报人</text>
            <text class="detail-text">{{ detailRecord.applicantName }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">申报时间</text>
            <text class="detail-text">{{ detailRecord.submitTime }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">申报类型</text>
            <text class="detail-text">{{ detailRecord.categoryName }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">申报内容</text>
            <text class="detail-text">{{ detailRecord.content }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">申报积分</text>
            <text class="detail-text">{{ detailRecord.claimedPoints }} 分</text>
          </view>
          <view v-if="detailRecord.location" class="detail-row">
            <text class="detail-label">活动地点</text>
            <text class="detail-text">{{ detailRecord.location }}</text>
          </view>
          <view v-if="detailRecord.organization" class="detail-row">
            <text class="detail-label">授奖单位</text>
            <text class="detail-text">{{ detailRecord.organization }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">佐证材料</text>
            <text class="detail-text">{{
              detailRecord.evidenceFiles.join('、') || '暂无材料'
            }}</text>
          </view>
        </view>

        <view v-if="detailRecord.status === 'pending'" class="detail-form-card">
          <view v-if="detailRecord.type === 'volunteer'" class="form-group">
            <text class="form-label">调整积分</text>
            <u-input
              v-model="reviewForm.approvedPoints"
              type="number"
              placeholder="请输入审核积分"
            />
          </view>

          <view v-if="detailRecord.type === 'honor'" class="form-group">
            <text class="form-label">调整荣誉级别</text>
            <view class="level-row">
              <view
                v-for="item in honorLevelOptions"
                :key="item.id"
                class="level-chip"
                :class="{ active: reviewForm.levelId === item.id }"
                @click="onLevelSelect(item.id)"
              >
                <text class="level-chip-text">{{ item.name }}</text>
              </view>
            </view>
          </view>

          <view class="form-group">
            <text class="form-label">驳回原因</text>
            <u-textarea v-model="reviewForm.rejectReason" placeholder="请输入驳回原因" />
          </view>
        </view>

        <view class="action-group">
          <u-button
            v-if="detailRecord.status === 'pending'"
            type="primary"
            text="通过"
            size="large"
            @click="approveRecord(detailRecord)"
          />
          <u-button
            v-if="detailRecord.status === 'pending'"
            type="error"
            text="驳回"
            size="large"
            @click="rejectRecord(detailRecord)"
          />
          <u-button type="info" plain text="关闭" size="large" @click="closeDetail" />
        </view>
      </view>
    </view>

    <GlobalBottomNav current="admin" />
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { computed, reactive, ref } from 'vue'
import { fetchAuditList, submitAudit } from '@/api/admin'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import { useUserStore } from '@/store'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import { honorLevels } from '@/utils/rules'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

/** 管理员审核页，支持单条审核、批量通过和批量驳回。 */

const tabs = [
  { name: '待审核志愿服务' },
  { name: '待审核荣誉获奖' },
  { name: '已审核' },
  { name: '已驳回' }
]

const current = ref(0)
const records = ref([])
const selectedIds = ref([])
const detailRecord = ref(null)
const honorLevelOptions = honorLevels
const reviewForm = reactive({
  approvedPoints: '',
  levelId: '',
  rejectReason: ''
})

/** 根据当前页签筛选审核记录。 */
const filtered = computed(() => {
  if (current.value === 0) {
    return records.value.filter((item) => item.type === 'volunteer' && item.status === 'pending')
  }
  if (current.value === 1) {
    return records.value.filter((item) => item.type === 'honor' && item.status === 'pending')
  }
  if (current.value === 2) {
    return records.value.filter((item) => item.status === 'approved')
  }
  return records.value.filter((item) => item.status === 'rejected')
})

const isPendingTab = computed(() => current.value === 0 || current.value === 1)
const selectAllText = computed(() =>
  filtered.value.length > 0 && selectedIds.value.length === filtered.value.length
    ? '取消全选'
    : '全选'
)

/** 将后端审核记录映射为页面展示字段。 */
const normalizeAuditRecord = (item = {}) => ({
  ...item,
  evidenceFiles: Array.isArray(item.evidenceFiles) ? item.evidenceFiles : [],
  desc:
    item.type === 'volunteer'
      ? `申报积分 ${Number(item.claimedPoints || 0)} 分 · ${item.submitTime || ''}`
      : `${item.categoryName || '荣誉获奖'} · ${item.submitTime || ''}`
})

/** 分页拉取审核列表，避免仅显示前 50 条。 */
const fetchAllAuditPages = async (params = {}) => {
  const list = []
  let page = 1
  const pageSize = 50
  let total = 0

  do {
    const data = unwrapApiData(
      await fetchAuditList({
        ...params,
        page,
        pageSize
      }),
      { list: [], total: 0 }
    )
    const currentList = Array.isArray(data.list) ? data.list : []
    total = Number(data.total || 0)
    list.push(...currentList)
    if (currentList.length < pageSize) {
      break
    }
    page += 1
  } while (list.length < total)

  return list
}

/** 根据当前页签拉取审核列表。 */
const refreshRecords = async () => {
  const queryByTab = [
    { type: 'volunteer', status: 'pending' },
    { type: 'honor', status: 'pending' },
    { status: 'approved' },
    { status: 'rejected' }
  ]
  const params = queryByTab[current.value] || {}

  try {
    const list = await fetchAllAuditPages({
      ...params,
      tab: current.value
    })
    records.value = list.map(normalizeAuditRecord)
  } catch (error) {
    records.value = []
    showErrorToast(resolveApiErrorMessage(error, '审核列表加载失败，请稍后重试'))
  }
}

/** 重置审核表单，避免上一次输入残留。 */
const resetReviewForm = (record) => {
  reviewForm.approvedPoints = `${record?.claimedPoints || ''}`
  reviewForm.levelId = record?.levelId || honorLevelOptions[0]?.id || ''
  reviewForm.rejectReason = record?.rejectReason || ''
}

/** 选择荣誉级别。 */
const onLevelSelect = (levelId) => {
  reviewForm.levelId = levelId
}

/** 切换审核页签时清空已勾选项。 */
const onTabChange = (index) => {
  current.value = typeof index === 'number' ? index : index?.index || 0
  selectedIds.value = []
  refreshRecords()
}

/** 打开单条记录详情，并带出可调整字段。 */
const openDetail = (record) => {
  detailRecord.value = record
  resetReviewForm(record)
}

/** 关闭详情弹层。 */
const closeDetail = () => {
  detailRecord.value = null
}

/** 勾选或取消勾选单条待审核记录。 */
const toggleSelect = (recordId) => {
  selectedIds.value = selectedIds.value.includes(recordId)
    ? selectedIds.value.filter((item) => item !== recordId)
    : [...selectedIds.value, recordId]
}

/** 全选或取消全选当前页签下的待审核记录。 */
const toggleSelectAll = () => {
  if (selectedIds.value.length === filtered.value.length) {
    selectedIds.value = []
    return
  }
  selectedIds.value = filtered.value.map((item) => item.id)
}

/** 通过单条记录，并支持调整积分或荣誉级别。 */
const approveRecord = async (record) => {
  const payload = {
    id: record.id,
    ids: [record.id],
    type: record.type,
    pass: true,
    status: 'approved',
    approvedPoints:
      record.type === 'volunteer'
        ? Number(reviewForm.approvedPoints || record.claimedPoints)
        : honorLevelOptions.find((item) => item.id === (reviewForm.levelId || record.levelId))
            ?.points || Number(record.claimedPoints || 0),
    levelId: record.type === 'honor' ? reviewForm.levelId || record.levelId : ''
  }

  try {
    unwrapApiData(await submitAudit(payload), {})
    await refreshRecords()
    closeDetail()
    selectedIds.value = selectedIds.value.filter((item) => item !== record.id)
    showSuccessToast('审核已通过')
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '审核失败，请稍后重试'))
  }
}

/** 驳回单条记录，并记录驳回原因。 */
const rejectRecord = async (record) => {
  try {
    unwrapApiData(
      await submitAudit({
        id: record.id,
        ids: [record.id],
        type: record.type,
        pass: false,
        status: 'rejected',
        rejectReason: reviewForm.rejectReason || '请补充材料后重新提交。'
      }),
      {}
    )
    await refreshRecords()
    closeDetail()
    selectedIds.value = selectedIds.value.filter((item) => item !== record.id)
    showSuccessToast('已驳回该申报')
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '驳回失败，请稍后重试'))
  }
}

/** 批量通过当前勾选的待审核记录。 */
const approveSelected = async () => {
  if (selectedIds.value.length === 0) return
  const type = current.value === 0 ? 'volunteer' : current.value === 1 ? 'honor' : ''
  try {
    unwrapApiData(
      await submitAudit({
        ids: selectedIds.value,
        type,
        pass: true,
        status: 'approved'
      }),
      {}
    )
    await refreshRecords()
    selectedIds.value = []
    showSuccessToast('批量通过完成')
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '批量通过失败，请稍后重试'))
  }
}

/** 批量驳回当前勾选的待审核记录。 */
const rejectSelected = async () => {
  if (selectedIds.value.length === 0) return
  const type = current.value === 0 ? 'volunteer' : current.value === 1 ? 'honor' : ''
  try {
    unwrapApiData(
      await submitAudit({
        ids: selectedIds.value,
        type,
        pass: false,
        status: 'rejected',
        rejectReason: '批量驳回，请补充说明后重新提交。'
      }),
      {}
    )
    await refreshRecords()
    selectedIds.value = []
    showSuccessToast('批量驳回完成')
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '批量驳回失败，请稍后重试'))
  }
}

onShow(() => {
  if (!userStore.isAdmin) {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  refreshRecords()
})
</script>

<style scoped>
.tabs-shell {
  padding-top: 14px;
}

.action-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audit-card-pro__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.audit-card-pro__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 110px;
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
  max-height: 84vh;
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
  line-height: 1.75;
  color: #35516f;
}

.detail-form-card {
  margin-top: 18px;
  padding: 18px;
  border-radius: 22px;
  background: #f8fbff;
  border: 1px solid #dbe7f2;
}

.form-group + .form-group {
  margin-top: 16px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 800;
  color: #12304e;
}

.level-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.level-chip {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #edf4fb;
  border: 1px solid #d6e4f0;
}

.level-chip.active {
  background: linear-gradient(135deg, rgba(29, 99, 216, 0.12), rgba(21, 164, 144, 0.12));
  border-color: rgba(29, 99, 216, 0.26);
}

.level-chip-text {
  font-size: 14px;
  color: #35516f;
  font-weight: 700;
}
</style>
