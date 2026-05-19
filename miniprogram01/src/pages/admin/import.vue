<template>
  <view class="page page-with-nav page-shell page-shell--admin">
    <view class="page-hero page-hero--admin">
      <view class="hero-badge">
        <uni-icons type="upload-filled" size="16" color="#ffffff" />
        <text>批量数据导入</text>
      </view>
      <text class="hero-title">先看模板字段，再提交 Excel 导入任务</text>
    </view>

    <view class="simple-list">
      <view class="themed-card">
        <text class="card-kicker">导入说明</text>
        <text class="card-title-main">上传前请先确认字段格式一致</text>
        <text class="card-text-main"
          >请选择 `.xlsx` 或 `.xls` 文件，建议先下载模板说明后再导入。</text
        >
      </view>

      <view class="list-row-card" @click="downloadTemplate">
        <view class="list-row-card__body">
          <text class="list-row-card__title">Excel 模板下载</text>
          <text class="list-row-card__desc"
            >包含志愿服务与荣誉获奖所需字段，便于提前整理数据。</text
          >
          <text class="list-row-card__meta">模板字段说明</text>
        </view>
        <uni-icons type="download-filled" size="18" color="#1648a5" />
      </view>

      <view class="list-row-card" @click="uploadFile">
        <view class="list-row-card__body">
          <text class="list-row-card__title">上传 Excel</text>
          <text class="list-row-card__desc">
            {{ currentFileName ? `当前已选择：${currentFileName}` : '支持 .xlsx / .xls 文件' }}
          </text>
          <text class="list-row-card__meta">选择后立即提交导入</text>
        </view>
        <uni-icons type="upload-filled" size="18" color="#1648a5" />
      </view>

      <view class="themed-card">
        <text class="card-kicker">模板字段预览</text>
        <view class="field-group">
          <text class="field-title">志愿服务模板字段</text>
          <text class="field-text">{{ templateFields.volunteer.join('、') }}</text>
        </view>
        <view class="field-group">
          <text class="field-title">荣誉获奖模板字段</text>
          <text class="field-text">{{ templateFields.honor.join('、') }}</text>
        </view>
      </view>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">导入历史</text>
      <text class="section-heading__desc">按最近操作顺序展示</text>
    </view>

    <view v-if="history.length > 0" class="simple-list">
      <view v-for="item in history" :key="item.id" class="list-row-card">
        <view class="list-row-card__body">
          <text class="list-row-card__title">{{ item.fileName }}</text>
          <text class="list-row-card__desc">
            导入条数：{{ item.importedCount }} 条，失败条数：{{ item.failedCount || 0 }} 条
          </text>
          <text class="list-row-card__meta">操作人：{{ item.operator }} · {{ item.time }}</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="folder-add-filled" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">暂无导入历史</text>
      <text class="empty-state-pro__desc">完成首次导入后，这里会展示最近导入记录。</text>
    </view>

    <GlobalBottomNav current="admin" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { importExcel } from '@/api/admin'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

/** 管理后台导入页，展示模板字段并提交真实导入请求。 */

const templateFields = {
  volunteer: [
    '用户姓名',
    '身份证号',
    '模块标识',
    '活动名称',
    '时间',
    '地点',
    '参与内容',
    '积分',
    '佐证材料链接'
  ],
  honor: ['用户姓名', '身份证号', '荣誉级别', '荣誉名称', '获取时间', '授奖单位', '佐证材料链接']
}
const history = ref([])
const currentFileName = ref('')

/** 生成 CSV 模板文件并打开下载。 */
const downloadTemplate = () => {
  const csvContent =
    '志愿服务模板\n' +
    templateFields.volunteer.join(',') +
    '\n\n荣誉获奖模板\n' +
    templateFields.honor.join(',')

  try {
    const fs = uni.getFileSystemManager()
    const filePath = `${uni.env.USER_DATA_PATH}/import_template.csv`
    fs.writeFile({
      filePath,
      data: csvContent,
      encoding: 'utf-8',
      success: () => {
        uni.openDocument({
          filePath,
          showMenu: true,
          fail: () => fallbackClipboard(csvContent)
        })
      },
      fail: () => fallbackClipboard(csvContent)
    })
  } catch {
    fallbackClipboard(csvContent)
  }
}

const fallbackClipboard = (content) => {
  uni.setClipboardData({
    data: content,
    success: () => showSuccessToast('模板内容已复制到剪贴板')
  })
}

/** 选择 Excel 文件并调用真实导入接口。 */
const uploadFile = () => {
  uni.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['xlsx', 'xls'],
    success: async (res) => {
      const file = res?.tempFiles?.[0]
      if (!file) {
        showErrorToast('未选择有效文件')
        return
      }

      currentFileName.value = file.name || '未命名文件'

      try {
        const importData = unwrapApiData(
          await importExcel({
            fileName: file.name || '',
            filePath: file.path || '',
            records: []
          }),
          {}
        )
        const importedCount =
          Number(importData.importedVolunteer || 0) + Number(importData.importedHonor || 0)
        history.value = [
          {
            id: `${Date.now()}`,
            fileName: file.name || '未命名文件',
            importedCount,
            failedCount: Number(importData.failedCount || 0),
            operator: '当前管理员',
            time: new Date().toLocaleString()
          },
          ...history.value
        ]
        showSuccessToast(
          `导入完成：成功 ${importedCount} 条，失败 ${Number(importData.failedCount || 0)} 条`
        )
      } catch (error) {
        showErrorToast(resolveApiErrorMessage(error, '导入失败，请稍后重试'))
      }
    },
    fail: () => {
      showErrorToast('文件选择已取消')
    }
  })
}
</script>

<style scoped>
.field-group + .field-group {
  margin-top: 16px;
}

.field-title {
  display: block;
  font-size: 16px;
  font-weight: 800;
  color: #12304e;
}

.field-text {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.8;
  color: #35516f;
}
</style>
