<template>
  <view class="page page-with-nav page-shell page-shell--volunteer">
    <view class="page-hero">
      <view class="hero-badge">
        <uni-icons type="heart-filled" size="16" color="#ffffff" />
        <text>志愿服务积分申报</text>
      </view>
      <text class="hero-title">五类服务模块\n按实际参与内容申报</text>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">选择服务模块</text>
      <text class="section-heading__desc">进入后可查看积分说明和打卡记录</text>
    </view>

    <view class="module-list-grid">
      <view
        v-for="item in modules"
        :key="item.path"
        class="module-card-pro module-card-pro--volunteer"
        @click="goDetail(item)"
      >
        <view class="module-card-pro__icon">
          <uni-icons :type="item.icon" size="26" color="#0f8e88" />
        </view>
        <view class="module-card-pro__body">
          <text class="module-card-pro__title">{{ item.name }}</text>
          <text class="module-card-pro__desc">{{ item.description }}</text>
          <text class="module-card-pro__meta">{{ item.scoreTip }}</text>
        </view>
        <uni-icons type="right" size="18" color="#1648a5" />
      </view>
    </view>

    <GlobalBottomNav current="index" />
  </view>
</template>

<script setup>
import GlobalBottomNav from '@/components/GlobalBottomNav.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

/** 志愿服务模块列表页，展示五类可申报服务模块。 */

const modules = [
  {
    name: '传承红色文化',
    description: '红色主题宣讲、青少年教育等',
    scoreTip: '每次可申报 3-10 分',
    icon: 'flag-filled',
    path: '/pages/volunteer/redCulture'
  },
  {
    name: '参与基层治理',
    description: '政策宣传、矛盾调解、治安巡逻等',
    scoreTip: '每次可申报 1-5 分',
    icon: 'home-filled',
    path: '/pages/volunteer/governance'
  },
  {
    name: '服务企业发展',
    description: '技术咨询、经验指导等',
    scoreTip: '每次可申报 3-10 分',
    icon: 'gear-filled',
    path: '/pages/volunteer/enterprise'
  },
  {
    name: '实施以老助老',
    description: '帮扶困难老同志等',
    scoreTip: '每次可申报 1-5 分',
    icon: 'staff-filled',
    path: '/pages/volunteer/helpOld'
  },
  {
    name: '其他服务',
    description: '未涵盖的社区服务',
    scoreTip: '每次可申报 1-5 分',
    icon: 'paperplane-filled',
    path: '/pages/volunteer/other'
  }
]

/** 跳转到对应模块详情页。 */
const goDetail = (item) => {
  uni.navigateTo({ url: item.path })
}
</script>
