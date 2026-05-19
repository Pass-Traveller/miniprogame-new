const fs = require('fs')
const path = require('path')

/**
 * 禁用 uni-mp-weixin 运行时里的外链图片预加载。
 * 该预加载会请求 https://cdn1.dcloud.net.cn/img/shadow-grey.png，
 * 在网络受限环境里容易触发超时和渲染层网络错误。
 */
const targets = [
  'node_modules/@dcloudio/uni-mp-weixin/dist/uni.mp.esm.js',
  'node_modules/@dcloudio/uni-mp-weixin/dist-x/uni.mp.esm.js'
]

const root = path.resolve(__dirname, '..')

const patchRuntimeFile = (relativePath) => {
  const fullPath = path.resolve(root, relativePath)
  if (!fs.existsSync(fullPath)) {
    console.log(`[uni-runtime-patch] skip missing: ${relativePath}`)
    return
  }

  const original = fs.readFileSync(fullPath, 'utf8')
  const next = original.replace(
    /function preloadAsset\(\) \{[\s\S]*?\n\}/,
    [
      'function preloadAsset() {',
      '    // 已禁用外链资源预加载，避免开发环境网络超时和控制台噪音。',
      '}',
    ].join('\n')
  )

  if (next === original) {
    console.log(`[uni-runtime-patch] no change: ${relativePath}`)
    return
  }

  fs.writeFileSync(fullPath, next, 'utf8')
  console.log(`[uni-runtime-patch] patched: ${relativePath}`)
}

targets.forEach(patchRuntimeFile)
