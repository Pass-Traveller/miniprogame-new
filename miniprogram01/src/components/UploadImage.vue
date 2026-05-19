<template>
  <view class="upload-field">
    <view v-if="files.length > 0" class="upload-grid">
      <view v-for="(item, index) in files" :key="item.url || index" class="upload-card">
        <image
          v-if="item.type === 'image'"
          class="upload-image"
          :src="item.url"
          mode="aspectFill"
          @click="previewFile(index)"
        />
        <view v-else class="upload-file">
          <view class="upload-file__icon">
            <uni-icons type="folder-filled" size="28" color="#1648a5" />
          </view>
          <text class="upload-file-name">{{ item.name }}</text>
          <text class="upload-file-size">{{ formatFileSize(item.size) }}</text>
        </view>
        <view class="upload-delete" @click.stop="removeFile(index)">
          <uni-icons type="closeempty" color="#ffffff" size="14" />
        </view>
      </view>
    </view>

    <view class="upload-actions">
      <button class="upload-btn" :disabled="isMaxReached" @click="handleChoose('album')">从相册选择</button>
      <button class="upload-btn" :disabled="isMaxReached" @click="handleChoose('camera')">拍照上传</button>
      <button class="upload-btn upload-btn--accent" :disabled="isMaxReached" @click="handleChooseFile">上传文件</button>
    </view>

    <view class="upload-status-card">
      <text class="upload-status-title">上传状态</text>
      <text class="upload-status-text">已上传 {{ files.length }}/{{ maxCount }} 个文件</text>
      <text class="upload-status-text">相册权限：{{ albumPermissionLabel }}</text>
      <text class="upload-status-text">相机权限：{{ cameraPermissionLabel }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useUserStore } from '@/store'
import { showErrorToast } from '@/utils/feedback'
import { chooseEvidenceImages, chooseEvidenceFiles, getPermissionStatusLabel } from '@/utils/upload'

/** 佐证材料上传组件，统一处理权限说明、图片选择、预览与删除。 */

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  maxCount: {
    type: Number,
    default: 9
  },
  maxSize: {
    type: Number,
    default: 10 * 1024 * 1024
  }
})

const emit = defineEmits(['update:modelValue'])
const userStore = useUserStore()
const files = computed(() => props.modelValue || [])
const isMaxReached = computed(() => files.value.length >= props.maxCount)
const albumPermissionLabel = computed(() => getPermissionStatusLabel(userStore.albumPermission))
const cameraPermissionLabel = computed(() => getPermissionStatusLabel(userStore.cameraPermission))

/** 格式化文件大小显示。 */
const formatFileSize = (size) => {
  if (!size) return '0 B'
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/** 用户主动点击上传后，再申请相册或相机能力。 */
const handleChoose = async (sourceType) => {
  if (isMaxReached.value) {
    showErrorToast('已达到上传数量上限')
    return
  }

  const result = await chooseEvidenceImages({
    sourceType,
    count: props.maxCount - files.value.length,
    maxSize: props.maxSize
  })

  if (result.status === 'granted') {
    userStore.setPermissionStatus(sourceType, 'granted')
  }
  if (result.status === 'denied') {
    userStore.setPermissionStatus(sourceType, 'denied')
  }
  if (result.status === 'failed') {
    userStore.setPermissionStatus(sourceType, 'failed')
  }
  if (!result.files.length) {
    return
  }

  emit('update:modelValue', [...files.value, ...result.files])
}

/** 用户点击上传文件按钮，申请文件选择能力。 */
const handleChooseFile = async () => {
  if (isMaxReached.value) {
    showErrorToast('已达到上传数量上限')
    return
  }

  const result = await chooseEvidenceFiles({
    count: props.maxCount - files.value.length,
    maxSize: props.maxSize
  })

  if (result.status === 'failed') {
    userStore.setPermissionStatus('file', 'failed')
  }
  if (!result.files.length) {
    return
  }

  emit('update:modelValue', [...files.value, ...result.files])
}

/** 删除某张已选择的佐证材料。 */
const removeFile = (index) => {
  emit(
    'update:modelValue',
    files.value.filter((_, fileIndex) => fileIndex !== index)
  )
}

/** 预览已上传的图片或文件。 */
const previewFile = (index) => {
  const item = files.value[index]
  if (!item) return

  if (item.type === 'image') {
    uni.previewImage({
      current: item.url,
      urls: files.value.filter((f) => f.type === 'image').map((f) => f.url)
    })
  } else {
    uni.openDocument({
      filePath: item.url,
      showMenu: true,
      fail: () => {
        showErrorToast('无法打开该文件')
      }
    })
  }
}
</script>

<style scoped>
.upload-field {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.upload-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.upload-card {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid #dbe7f2;
  background: linear-gradient(180deg, #f8fbff 0%, #eef9f7 100%);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 24px rgba(19, 58, 107, 0.08);
}

.upload-image {
  width: 100%;
  height: 100%;
}

.upload-file {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  box-sizing: border-box;
}

.upload-file__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(29, 99, 216, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-file-name {
  font-size: 13px;
  color: #12304e;
  font-weight: 700;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.upload-file-size {
  font-size: 12px;
  color: #7f95a9;
}

.upload-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(18, 48, 78, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.upload-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-btn {
  width: 100%;
  min-height: 50px;
  padding: 0 16px;
  border: 1px solid #c6d7e8;
  border-radius: 16px;
  background: #ffffff;
  color: #1648a5;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.upload-btn--accent {
  background: linear-gradient(135deg, #edf5ff 0%, #eef9f7 100%);
}

.upload-btn:disabled {
  border-color: #d9e4ee;
  color: #9bb0c2;
  background: #f7fafc;
}

.upload-status-card {
  padding: 14px 16px;
  border-radius: 18px;
  background: #f8fbff;
  border: 1px solid #dbe7f2;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.upload-status-title {
  font-size: 15px;
  font-weight: 800;
  color: #12304e;
}

.upload-status-text {
  font-size: 13px;
  color: #5f7992;
  line-height: 1.7;
}
</style>
