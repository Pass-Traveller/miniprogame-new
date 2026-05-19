<template>
  <view class="chart-wrapper">
    <view class="chart-head">
      <text class="chart-title">年度积分趋势</text>
      <text class="chart-subtitle">按年度展示积分变化，便于查看积累情况</text>
    </view>

    <view v-show="hasData" class="chart-canvas-wrap">
      <canvas
        type="2d"
        id="trendChart"
        canvas-id="trendChart"
        class="chart-canvas"
        :style="{ width: '100%', height: '500rpx' }"
      />
    </view>

    <view v-show="!hasData" class="chart-empty">
      <text class="chart-empty__title">暂未生成年度积分趋势</text>
      <text class="chart-empty__desc">当年积分产生后，这里会自动展示近年变化情况。</text>
    </view>
  </view>
</template>

<script>
import uCharts from '@qiun/ucharts'

export default {
  name: 'Chart',
  props: {
    refreshKey: { type: Number, default: 0 },
    trendData: { type: Array, default: () => [] }
  },
  emits: [],
  data() {
    return {
      chartInstance: null
    }
  },
  computed: {
    trend() {
      if (Array.isArray(this.trendData) && this.trendData.length > 0) {
        return this.trendData.map((item) => ({
          label: item.label || '',
          total: Number(item.total || 0)
        }))
      }
      const currentYear = new Date().getFullYear()
      return Array.from({ length: 4 }, (_, index) => ({
        label: `${currentYear - 3 + index}年`,
        total: 0
      }))
    },
    hasData() {
      return this.trend.some((item) => item.total > 0)
    }
  },
  watch: {
    refreshKey() {
      this.$nextTick(() => {
        setTimeout(() => this.renderChart(), 200)
      })
    }
  },
  mounted() {
    this.$nextTick(() => {
      setTimeout(() => this.renderChart(), 300)
    })
  },
  methods: {
    getChartData() {
      return {
        categories: this.trend.map((item) => item.label),
        series: [{ name: '积分', data: this.trend.map((item) => item.total) }]
      }
    },
    renderChart() {
      if (!this.hasData) return

      const query = uni.createSelectorQuery().in(this)
      query
        .select('#trendChart')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return
          const { width } = res[0]
          const ctx = res[0].node.getContext('2d')

          const opts = {
            type: 'column',
            canvasId: 'trendChart',
            canvas2d: true,
            context: ctx,
            ...this.getChartData(),
            width: width || 320,
            height: 200,
            padding: [15, 15, 0, 5],
            color: ['#1d63d8'],
            background: 'transparent',
            pixelRatio: 1,
            animation: true,
            legend: { show: false },
            xAxis: {
              disableGrid: true,
              fontColor: '#7f95a9',
              fontSize: 12
            },
            yAxis: {
              data: [{ min: 0 }],
              fontColor: '#7f95a9',
              fontSize: 11,
              gridColor: 'rgba(131,160,191,0.2)'
            },
            extra: {
              column: {
                type: 'group',
                width: 20,
                barBorderCircle: true,
                linearType: 'custom',
                linearColor: ['#76b5ff', '#1d63d8']
              }
            }
          }

          if (this.chartInstance) {
            this.chartInstance.updateData({
              ...opts,
              categories: this.getChartData().categories,
              series: this.getChartData().series
            })
            return
          }

          this.chartInstance = new uCharts(opts)
        })
    }
  }
}
</script>

<style scoped>
.chart-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.chart-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-title {
  font-size: 20px;
  font-weight: 800;
  color: #12304e;
}

.chart-subtitle {
  font-size: 14px;
  color: #5f7992;
  line-height: 1.7;
}

.chart-canvas-wrap {
  width: 100%;
  height: 500rpx;
}

.chart-canvas {
  width: 100%;
  height: 500rpx;
}

.chart-empty {
  padding: 14px 10px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-empty__title {
  font-size: 15px;
  font-weight: 700;
  color: #12304e;
}

.chart-empty__desc {
  font-size: 13px;
  line-height: 1.7;
  color: #5f7992;
}
</style>