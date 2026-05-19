const fs = require('fs')
const path = require('path')

/**
 * 生成微信开发者工具热重载兼容占位文件。
 * 旧版热重载缓存可能仍会读取已移除的模块路径，导致 ENOENT 报错。
 */
const [, , outputType = 'build', platform = 'mp-weixin'] = process.argv
const outputDir = path.resolve(__dirname, '..', 'dist', outputType, platform)

const compatFiles = [
  {
    relativePath: path.join('utils', 'ui.js'),
    content: [
      '"use strict";',
      '',
      '/** 兼容旧热重载缓存：业务代码已不再依赖此文件。 */',
      'exports.safeHideTabBar = function safeHideTabBar() {',
      '  if (typeof uni === "undefined" || typeof uni.hideTabBar !== "function") {',
      '    return',
      '  }',
      '',
      '  uni.hideTabBar({',
      '    fail: function fail() {}',
      '  })',
      '}',
      ''
    ].join('\n')
  }
]

if (!fs.existsSync(outputDir)) {
  console.log(`[compat] skip missing output: ${outputDir}`)
  process.exit(0)
}

compatFiles.forEach(({ relativePath, content }) => {
  const targetPath = path.join(outputDir, relativePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, content, 'utf8')
    console.log(`[compat] created: ${targetPath}`)
    return
  }

  console.log(`[compat] exists: ${targetPath}`)
})
