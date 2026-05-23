<template>
  <view class="page page-with-nav page-with-tabbar page-shell page-shell--admin">
    <view class="page-hero page-hero--admin">
      <view class="hero-badge">
        <uni-icons type="personadd-filled" size="16" color="#ffffff" />
        <text>{{ pageTitle }}</text>
      </view>
      <text class="hero-title">{{ isSuperAdmin ? '管理员权限配置' : '账号状态管理' }}</text>
      <text class="hero-subtitle">{{ pageHelperText }}</text>
    </view>

    <view class="themed-form-card">
      <text class="field-label">搜索账号</text>
      <text class="field-helper">可按姓名或手机号查找目标用户，提升管理效率。</text>
      <view class="search-wrap">
        <u-search
          v-model="keyword"
          placeholder="按姓名或手机号搜索"
          :show-action="false"
          bg-color="#f9fbff"
          @search="refreshUsers"
          @custom="refreshUsers"
          @clear="refreshUsers"
        />
      </view>
    </view>

    <view class="themed-card">
      <text class="card-kicker">筛选条件</text>
      <text class="card-text-main">根据角色或账号状态快速缩小结果范围。</text>
      <view class="filter-options">
        <view
          v-for="item in filterOptions"
          :key="item.value"
          class="filter-chip"
          :class="{ 'filter-chip--active': activeFilterValue === item.value }"
          @click="setActiveFilter(item.value)"
        >
          <text class="filter-chip-text">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <view v-if="displayUsers.length > 0" class="simple-list">
      <view v-for="item in displayUsers" :key="item._id" class="list-row-card user-card-pro">
        <view class="list-row-card__body">
          <view class="user-card-pro__head">
            <text class="list-row-card__title">{{ item.realName || '未实名用户' }}</text>
            <u-tag
              :text="formatRoleText(item.role)"
              size="mini"
              :type="formatRoleTagType(item.role)"
            />
          </view>
          <text class="list-row-card__desc">{{ item.phone || '未绑定手机号' }}</text>
          <text class="list-row-card__meta">
            {{ item.isDeleted ? '当前状态：已禁用' : '当前状态：可用' }}
          </text>
        </view>

        <view class="user-card-pro__actions">
          <u-button
            v-if="isSuperAdmin && item.role === 'member'"
            type="primary"
            text="设为管理员"
            size="small"
            :loading="submittingId === item._id"
            @click="setRole(item, 'admin')"
          />
          <u-button
            v-else-if="isSuperAdmin && item.role === 'admin'"
            type="info"
            plain
            text="回收管理员"
            size="small"
            :loading="submittingId === item._id"
            @click="setRole(item, 'member')"
          />
          <u-button
            v-else-if="isAdmin && item.role !== 'super-admin' && !item.isDeleted"
            type="error"
            plain
            text="禁用用户"
            size="small"
            :loading="submittingId === item._id"
            @click="disableTargetUser(item)"
          />
          <text v-else-if="item.isDeleted" class="fixed-text">已禁用</text>
          <text v-else class="fixed-text">super-admin 固定角色</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-state-pro">
      <view class="empty-state-pro__icon">
        <uni-icons type="person" size="30" color="#1648a5" />
      </view>
      <text class="empty-state-pro__title">暂无可管理用户</text>
      <text class="empty-state-pro__desc">当前筛选条件下没有符合条件的用户记录。</text>
    </view>

    <GlobalBottomNav current="admin" />
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { fetchAdminUsers, setUserRole, disableUser } from '@/api/admin'
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import { unwrapApiData, resolveApiErrorMessage } from '@/utils/api'
import { showErrorToast, showSuccessToast } from '@/utils/feedback'
import { useUserStore } from '@/store'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

/** 账号与角色管理页，支持管理员设置、回收和禁用操作。 */

const keyword = ref('')
const users = ref([])
const submittingId = ref('')
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.role === 'super-admin')
const isAdmin = computed(() => userStore.role === 'admin')
const roleFilter = ref('all')
const statusFilter = ref('all')
const pageTitle = computed(() => (isSuperAdmin.value ? '设置管理员' : '禁用用户'))
const pageHelperText = computed(() =>
  isSuperAdmin.value
    ? '仅 super-admin 可操作：支持一键设为管理员与回收管理员。'
    : '仅 admin 可操作：支持逻辑禁用用户账号，不可操作 super-admin。'
)

/** 根据当前身份动态返回筛选项。 */
const filterOptions = computed(() => {
  if (isSuperAdmin.value) {
    return [
      { label: '全部', value: 'all' },
      { label: '普通用户', value: 'member' },
      { label: '管理员', value: 'admin' },
      { label: '超级管理员', value: 'super-admin' }
    ]
  }

  return [
    { label: '全部', value: 'all' },
    { label: '可用账号', value: 'active' },
    { label: '已禁用', value: 'disabled' }
  ]
})

/** 当前选中的筛选值。 */
const activeFilterValue = computed(() =>
  isSuperAdmin.value ? roleFilter.value : statusFilter.value
)

/** 按角色或状态过滤最终展示列表。 */
const displayUsers = computed(() => {
  if (isSuperAdmin.value) {
    if (roleFilter.value === 'all') return users.value
    return users.value.filter((item) => item.role === roleFilter.value)
  }

  if (statusFilter.value === 'all') return users.value
  if (statusFilter.value === 'active') {
    return users.value.filter((item) => !item.isDeleted && String(item.status || '') !== 'disabled')
  }
  return users.value.filter((item) => item.isDeleted || String(item.status || '') === 'disabled')
})

/** 格式化角色文案。 */
const formatRoleText = (role = '') => {
  if (role === 'super-admin') return '超级管理员'
  if (role === 'admin') return '管理员'
  return '普通用户'
}

/** 根据角色返回标签样式类型。 */
const formatRoleTagType = (role = '') => {
  if (role === 'super-admin') return 'error'
  if (role === 'admin') return 'primary'
  return 'info'
}

/** 切换筛选项。 */
const setActiveFilter = (value) => {
  if (isSuperAdmin.value) {
    roleFilter.value = value
    return
  }
  statusFilter.value = value
}

/** 拉取用户列表（分页拉全量），用于角色配置。 */
const refreshUsers = async () => {
  try {
    const list = []
    let page = 1
    const pageSize = 50
    let total = 0

    do {
      const data = unwrapApiData(
        await fetchAdminUsers({
          page,
          pageSize,
          keyword: keyword.value.trim()
        }),
        { list: [], total: 0 }
      )

      const current = Array.isArray(data.list) ? data.list : []
      total = Number(data.total || 0)
      list.push(...current)
      if (current.length < pageSize) {
        break
      }
      page += 1
    } while (list.length < total)

    users.value = list.filter((item) => {
      if (isSuperAdmin.value) return true
      if (isAdmin.value) return item.role !== 'super-admin'
      return false
    })
  } catch (error) {
    users.value = []
    showErrorToast(resolveApiErrorMessage(error, '用户列表加载失败，请稍后重试'))
  }
}

/** 一键设置或回收管理员角色。 */
const setRole = async (item, targetRole) => {
  if (!isSuperAdmin.value) {
    showErrorToast('仅 super-admin 可设置管理员')
    return
  }
  if (!item?._id) {
    showErrorToast('缺少目标用户信息')
    return
  }

  const actionText = targetRole === 'admin' ? '设为管理员' : '回收管理员'
  uni.showModal({
    title: '确认操作',
    content: `确认将 ${item.realName || '该用户'} ${actionText}吗？`,
    success: async (res) => {
      if (!res.confirm) return

      try {
        submittingId.value = item._id
        unwrapApiData(
          await setUserRole({
            targetUserId: item._id,
            targetRole
          }),
          {}
        )
        showSuccessToast(`${actionText}成功`)
        await refreshUsers()
      } catch (error) {
        showErrorToast(resolveApiErrorMessage(error, `${actionText}失败，请稍后重试`))
      } finally {
        submittingId.value = ''
      }
    }
  })
}

/** admin 逻辑禁用用户账号。 */
const disableTargetUser = async (item) => {
  if (!isAdmin.value) {
    showErrorToast('仅 admin 可禁用用户')
    return
  }
  if (!item?._id) {
    showErrorToast('缺少目标用户信息')
    return
  }

  uni.showModal({
    title: '确认禁用',
    content: `确认禁用 ${item.realName || '该用户'} 吗？禁用后该账号将无法登录。`,
    success: async (res) => {
      if (!res.confirm) return

      try {
        submittingId.value = item._id
        unwrapApiData(
          await disableUser({
            targetUserId: item._id,
            reason: '管理员手动禁用'
          }),
          {}
        )
        showSuccessToast('禁用成功')
        await refreshUsers()
      } catch (error) {
        showErrorToast(resolveApiErrorMessage(error, '禁用失败，请稍后重试'))
      } finally {
        submittingId.value = ''
      }
    }
  })
}

onShow(() => {
  if (!userStore.isAdmin) {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  roleFilter.value = 'all'
  statusFilter.value = 'all'
  refreshUsers()
})
</script>

<style scoped>
.search-wrap {
  margin-top: 12px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.filter-chip {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d6e4f0;
  background: #f8fbff;
}

.filter-chip--active {
  border-color: rgba(29, 99, 216, 0.3);
  background: linear-gradient(135deg, rgba(29, 99, 216, 0.12), rgba(21, 164, 144, 0.12));
}

.filter-chip-text {
  font-size: 14px;
  color: #35516f;
  font-weight: 700;
}

.user-card-pro {
  align-items: center;
}

.user-card-pro__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.user-card-pro__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.fixed-text {
  font-size: 13px;
  color: #7f95a9;
  line-height: 1.6;
}
</style>
