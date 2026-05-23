<template>
  <view class="page page-with-nav page-shell page-shell--honor">
    <view class="page-hero page-hero--honor">
      <view class="hero-badge">
        <uni-icons type="medal" size="16" color="#ffffff" />
        <text>荣誉获奖积分申报</text>
      </view>
      <text class="hero-title">按荣誉级别提交材料\n系统自动填充积分</text>
    </view>

    <view class="section-heading">
      <text class="section-heading__title">选择荣誉级别</text>
      <text class="section-heading__desc">不同级别对应固定积分</text>
    </view>

    <view class="module-list-grid">
      <view
        v-for="item in levels"
        :key="item.path"
        class="module-card-pro module-card-pro--honor"
        @click="goApply(item)"
      >
        <view class="module-card-pro__icon">
          <uni-icons :type="item.icon" size="26" color="#cc8a11" />
        </view>
        <view class="module-card-pro__body">
          <text class="module-card-pro__title">{{ item.name }}</text>
          <text class="module-card-pro__desc">{{ item.desc }}</text>
          <text class="module-card-pro__meta">固定积分 +{{ item.points }} 分</text>
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

/** 荣誉获奖列表页，按荣誉级别进入对应申报页面。 */

const levels = [
  {
    name: '国家级荣誉',
    desc: '获得国家级单位授予的各类荣誉称号',
    points: 20,
    icon: 'medal-filled',
    path: '/pages/honor/national'
  },
  {
    name: '省部级荣誉',
    desc: '获得上海市、国网公司、全国电力行业等授予的各类荣誉称号',
    points: 16,
    icon: 'star-filled',
    path: '/pages/honor/provincial'
  },
  {
    name: '厅局级荣誉',
    desc: '获得分部、市经信委、退管会、区等单位授予的各类荣誉称号',
    points: 12,
    icon: 'fire-filled',
    path: '/pages/honor/bureau'
  },
  {
    name: '厂处级荣誉',
    desc: '获得街道党工委、街道办事处等授予的各类荣誉称号',
    points: 10,
    icon: 'shop-filled',
    path: '/pages/honor/factory'
  }
]

/** 跳转到对应荣誉级别的申报页。 */
const goApply = (item) => {
  uni.navigateTo({ url: item.path })
}
</script>
