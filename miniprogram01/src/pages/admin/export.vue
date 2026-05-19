<template>
  <view class="page page-with-nav page-shell page-shell--admin">
    <view class="page-hero page-hero--admin">
      <view class="hero-badge">
        <uni-icons type="download-filled" size="16" color="#ffffff" />
        <text>全量数据导出</text>
      </view>
      <text class="hero-title">先筛选、后预览，再执行 Excel 导出</text>
      <text class="hero-subtitle"
        >支持按年度、模块、审核状态和用户进行筛选，减少导出结果重复核对的工作量。</text
      >
    </view>

    <view class="themed-form-card">
      <u-form :model="form" label-position="top">
        <view class="field-shell">
          <text class="field-label">年度</text>
          <view
            class="picker-input-theme"
            :class="{ 'picker-input-theme--muted': !form.year }"
            @click="showYearPicker = true"
          >
            <text>{{ form.year || '请选择' }}</text>
            <uni-icons type="bottom" size="16" color="#7f95a9" />
          </view>
        </view>

        <view class="field-shell">
          <text class="field-label">模块 / 荣誉级别</text>
          <view
            class="picker-input-theme"
            :class="{ 'picker-input-theme--muted': !form.module }"
            @click="showModulePicker = true"
          >
            <text>{{ form.module || '请选择' }}</text>
            <uni-icons type="bottom" size="16" color="#7f95a9" />
          </view>
        </view>

        <view class="field-shell">
          <text class="field-label">审核状态</text>
          <view
            class="picker-input-theme"
            :class="{ 'picker-input-theme--muted': !form.status }"
            @click="showStatusPicker = true"
          >
            <text>{{ form.status || '请选择' }}</text>
            <uni-icons type="bottom" size="16" color="#7f95a9" />
          </view>
        </view>

        <view class="field-shell">
          <text class="field-label">用户</text>
          <view
            class="picker-input-theme"
            :class="{ 'picker-input-theme--muted': !form.keyword }"
            @click="showUserPicker = true"
          >
            <text>{{ form.keyword || '请选择' }}</text>
            <uni-icons type="bottom" size="16" color="#7f95a9" />
          </view>
        </view>
      </u-form>

      <view class="action-group">
        <u-button type="primary" text="导出 Excel" size="large" @click="handleExport" />
        <u-button type="info" plain text="重置筛选" size="large" @click="handleReset" />
      </view>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">导出预览</text>
      <text class="section-heading__desc">当前共 {{ previewRows.length }} 条</text>
    </view>

    <view v-if="previewRows.length > 0" class="simple-list">
      <view v-for="item in previewRows" :key="item.id" class="list-row-card">
        <view class="list-row-card__body">
          <text class="list-row-card__title">{{ item.title }}</text>
          <text class="list-row-card__desc">{{ item.applicantName }} · {{ item.typeLabel }}</text>
          <text class="list-row-card__desc"
            >{{ item.moduleLabel }} · {{ item.statusText }} · {{ item.scoreText }}</text
          >
          <text class="list-row-card__meta">提交时间：{{ item.submitTime }}</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="download-filled" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">当前筛选下暂无可导出记录</text>
      <text class="empty-state-pro__desc">可调整筛选条件后再次查看预览结果。</text>
    </view>

    <u-picker
      :show="showYearPicker"
      :columns="[yearOptions]"
      @confirm="onYearConfirm"
      @cancel="showYearPicker = false"
    />
    <u-picker
      :show="showModulePicker"
      :columns="[moduleOptions]"
      @confirm="onModuleConfirm"
      @cancel="showModulePicker = false"
    />
    <u-picker
      :show="showStatusPicker"
      :columns="[statusOptions]"
      @confirm="onStatusConfirm"
      @cancel="showStatusPicker = false"
    />
    <u-picker
      :show="showUserPicker"
      :columns="[userOptions]"
      @confirm="onUserConfirm"
      @cancel="showUserPicker = false"
    />

    <GlobalBottomNav current="admin" />
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { reactive, ref, watch, computed } from 'vue'
import { exportExcel, fetchAuditList } from '@/api/admin'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import { useUserStore } from '@/store'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

/** 管理后台导出页，按筛选条件预览并导出真实审核数据。 */

const form = reactive({
  year: '',
  module: '',
  status: '',
  keyword: ''
})

const previewRows = ref([])
const showYearPicker = ref(false)
const showModulePicker = ref(false)
const showStatusPicker = ref(false)
const showUserPicker = ref(false)

/** 最近五年的年度选项。 */
const currentYear = new Date().getFullYear()
const yearOptions = computed(() =>
  Array.from({ length: 5 }, (_, index) => `${currentYear - index}`)
)

/** 模块/荣誉级别选项。 */
const moduleOptions = [
  '传承红色文化',
  '参与基层治理',
  '服务企业发展',
  '实施以老助老',
  '其他服务',
  '国家级荣誉',
  '省部级荣誉',
  '厅局级荣誉',
  '厂处级荣誉'
]

/** 审核状态选项。 */
const statusOptions = ['待审核', '已审核', '已驳回']

/** 用户选项，当前使用前端占位数据。 */
const userOptions = ['全部用户', '张三', '李四', '王五', '赵六']

/** 标准化状态输入，兼容中文与英文筛选。 */
const normalizeStatus = (value = '') => {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
  if (!raw) return ''
  if (raw === 'pending' || raw.includes('待')) return 'pending'
  if (raw === 'approved' || raw.includes('通过') || raw.includes('审核')) return 'approved'
  if (raw === 'rejected' || raw.includes('驳回')) return 'rejected'
  return raw
}

/** 生成预览与导出的统一筛选参数。 */
const buildQuery = () => ({
  year: form.year.trim(),
  module: form.module.trim(),
  status: normalizeStatus(form.status),
  keyword: form.keyword === '全部用户' ? '' : form.keyword.trim()
})

/** 年度选择确认。 */
const onYearConfirm = ({ value }) => {
  form.year = value?.[0] || ''
  showYearPicker.value = false
}

/** 模块选择确认。 */
const onModuleConfirm = ({ value }) => {
  form.module = value?.[0] || ''
  showModulePicker.value = false
}

/** 状态选择确认。 */
const onStatusConfirm = ({ value }) => {
  form.status = value?.[0] || ''
  showStatusPicker.value = false
}

/** 用户选择确认。 */
const onUserConfirm = ({ value }) => {
  form.keyword = value?.[0] || ''
  showUserPicker.value = false
}

/** 拉取全部预览分页数据。 */
const fetchAllPreviewPages = async () => {
  const list = []
  let page = 1
  const pageSize = 50
  let total = 0

  do {
    const data = unwrapApiData(
      await fetchAuditList({
        ...buildQuery(),
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

/** 拉取导出预览数据。 */
const loadPreview = async () => {
  try {
    const list = await fetchAllPreviewPages()
    previewRows.value = list.map((item) => ({
      id: item.id,
      applicantName: item.applicantName || '未知用户',
      typeLabel: item.type === 'volunteer' ? '志愿服务' : '荣誉获奖',
      moduleLabel: item.categoryName || '',
      title: item.title || '',
      statusText: item.statusText || '',
      scoreText: `${Number(item.claimedPoints || 0)} 分`,
      submitTime: item.submitTime || ''
    }))
  } catch (error) {
    previewRows.value = []
    showErrorToast(resolveApiErrorMessage(error, '预览加载失败，请稍后重试'))
  }
}

/** 调用后端导出接口并提示文件信息。 */
const handleExport = async () => {
  try {
    const data = unwrapApiData(await exportExcel(buildQuery()), {})
    showSuccessToast(`导出完成，共 ${Number(data.total || 0)} 条`)
    if (data.fileID) {
      uni.showModal({
        title: '导出文件',
        content: `文件 ID：${data.fileID}`,
        showCancel: false
      })
    }
  } catch (error) {
    showErrorToast(resolveApiErrorMessage(error, '导出失败，请稍后重试'))
  }
}

/** 清空筛选条件，恢复完整预览列表。 */
const handleReset = () => {
  form.year = ''
  form.module = ''
  form.status = ''
  form.keyword = ''
  loadPreview()
}

watch(
  () => [form.year, form.module, form.status, form.keyword],
  () => {
    loadPreview()
  }
)

onShow(() => {
  if (!userStore.isAdmin) {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  loadPreview()
})
</script>

<style scoped>
.action-group {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
