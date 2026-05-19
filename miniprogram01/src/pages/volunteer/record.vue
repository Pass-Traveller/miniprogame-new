<template>
  <view class="page page-with-nav page-shell page-shell--volunteer">
    <view class="page-hero">
      <view class="hero-badge">
        <uni-icons type="calendar" size="16" color="#ffffff" />
        <text>志愿记录</text>
      </view>
      <text class="hero-title">{{ pageTitle }}</text>
      <text class="hero-subtitle"
        >支持按年度查看该模块下的打卡记录，点击单条可查看审核状态和详细内容。</text
      >
    </view>

    <view class="themed-card record-filter-card">
      <text class="card-kicker">年度筛选</text>
      <view class="picker-input-theme" @click="showYearPicker = true">
        <text>{{ selectedYear }}年度</text>
        <uni-icons type="bottom" size="16" color="#7f95a9" />
      </view>
    </view>

    <view v-if="records.length > 0" class="simple-list">
      <view
        v-for="record in records"
        :key="record.id"
        class="list-row-card"
        @click="showDetail(record)"
      >
        <view class="list-row-card__body">
          <view class="record-card__head">
            <text class="list-row-card__title">{{ record.title }}</text>
            <text class="record-card__points"
              >+ {{ record.approvedPoints || record.points || 0 }} 分</text
            >
          </view>
          <text class="list-row-card__desc">{{ record.activityTime }}</text>
          <text class="list-row-card__meta">{{ record.statusText }}</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="calendar" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">当前年度暂无打卡记录</text>
      <text class="empty-state-pro__desc"
        >可以切换其他年度查看，或返回上一步继续发起新的志愿服务申报。</text
      >
    </view>

    <u-picker
      :show="showYearPicker"
      :columns="[yearOptions]"
      @confirm="onYearConfirm"
      @cancel="showYearPicker = false"
    />

    <view v-if="selectedRecord" class="detail-mask" @click.self="closeDetail">
      <view class="detail-panel">
        <text class="detail-title">{{ selectedRecord.title }}</text>
        <view class="detail-grid">
          <view class="detail-row">
            <text class="detail-label">活动时间</text>
            <text class="detail-text">{{ selectedRecord.activityTime }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">活动地点</text>
            <text class="detail-text">{{ selectedRecord.location || '未填写' }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">参与内容</text>
            <text class="detail-text">{{ selectedRecord.content || '未填写' }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">审核状态</text>
            <text class="detail-text">{{ selectedRecord.statusText }}</text>
          </view>
          <view v-if="selectedRecord.rejectReason" class="detail-row">
            <text class="detail-label">驳回原因</text>
            <text class="detail-text warning-text">{{ selectedRecord.rejectReason }}</text>
          </view>
          <view
            v-if="selectedRecord.evidenceFiles && selectedRecord.evidenceFiles.length"
            class="detail-row"
          >
            <text class="detail-label">佐证材料</text>
            <text class="detail-text">{{ selectedRecord.evidenceFiles.join('、') }}</text>
          </view>
        </view>

        <view class="detail-actions">
          <u-button type="info" plain text="关闭" size="large" @click="closeDetail" />
        </view>
      </view>
    </view>

    <GlobalBottomNav current="index" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { fetchVolunteerRecords } from '@/api/volunteer'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast } from '@/utils/feedback'
import { getVolunteerModule } from '@/utils/rules'

/** 志愿服务打卡记录页，支持按年度查看审核通过记录。 */

const currentYear = new Date().getFullYear()
const yearOptions = Array.from({ length: 5 }, (_, idx) => String(currentYear - idx))

const showYearPicker = ref(false)
const selectedYear = ref(String(currentYear))
const moduleId = ref('')
const selectedRecord = ref(null)
const records = ref([])

const pageTitle = computed(() => {
  const moduleInfo = getVolunteerModule(moduleId.value)
  return moduleInfo ? `${moduleInfo.name}打卡记录` : '我的打卡记录'
})

/** 按当前筛选条件加载志愿记录。 */
const loadRecords = async () => {
  try {
    const responseData = unwrapApiData(
      await fetchVolunteerRecords({
        year: selectedYear.value,
        moduleId: moduleId.value,
        page: 1,
        pageSize: 50
      }),
      { list: [] }
    )
    records.value = (responseData.list || []).map((item) => ({
      ...item,
      activityTime: item.activityTime || '',
      evidenceFiles: Array.isArray(item.evidenceFiles) ? item.evidenceFiles : []
    }))
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '记录加载失败，请稍后重试'))
    records.value = []
  }
}

/** 接收上一个页面传入的模块标识。 */
onLoad((options) => {
  moduleId.value = options?.moduleId || ''
  loadRecords()
})

/** 切换年份后刷新记录列表。 */
const onYearConfirm = ({ value }) => {
  selectedYear.value = value?.[0] || selectedYear.value
  showYearPicker.value = false
  loadRecords()
}

/** 打开记录详情。 */
const showDetail = (record) => {
  selectedRecord.value = record
}

/** 关闭记录详情。 */
const closeDetail = () => {
  selectedRecord.value = null
}

/** 页面回显时刷新最新记录。 */
onShow(() => {
  loadRecords()
})
</script>

<style scoped>
.record-filter-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.record-card__points {
  font-size: 18px;
  font-weight: 800;
  color: #1648a5;
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
}
</style>
