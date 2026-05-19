# 银才荟 - 志愿服务积分申报微信小程序

面向中国国网的老同志的志愿服务与荣誉获奖积分申报平台，支持用户便捷申报、管理员高效审核与数据管理。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| uni-app (Vue 3) | 3.0+ | 跨端开发框架，面向微信小程序 |
| Vite | 5.2+ | 构建工具 |
| Pinia | 3.0+ | 状态管理 |
| uView Plus | 3.7+ | UI 组件库 |
| @dcloudio/uni-ui | 1.5+ | uni-app 官方组件 |
| 微信云开发 | wx-server-sdk 2.6+ | 后端云函数与云数据库 |
| ESLint + Prettier | - | 代码规范 |

## 快速开始

```bash
cd miniprogram01
npm install
npm run dev:mp-weixin       # 开发模式，输出到 dist/dev/mp-weixin，用微信开发者工具打开
npm run build:mp-weixin     # 生产构建
npm run lint                # 代码检查与自动修复
npm run format              # 代码格式化
```

## 项目结构

```
miniprogram01/
├── src/
│   ├── pages/
│   │   ├── index/              # 首页
│   │   ├── login/              # 登录与隐私授权
│   │   ├── volunteer/          # 志愿服务模块
│   │   │   ├── index.vue       # 子模块列表（5个子模块）
│   │   │   ├── redCulture.vue  # 传承红色文化
│   │   │   ├── governance.vue  # 参与基层治理
│   │   │   ├── enterprise.vue  # 服务企业发展
│   │   │   ├── helpOld.vue     # 实施以老助老
│   │   │   ├── other.vue       # 其他服务
│   │   │   └── record.vue      # 打卡记录
│   │   ├── honor/              # 荣誉获奖模块
│   │   │   ├── index.vue       # 荣誉级别列表
│   │   │   ├── national.vue    # 国家级荣誉
│   │   │   ├── provincial.vue  # 省部级荣誉
│   │   │   ├── bureau.vue      # 厅局级荣誉
│   │   │   └── factory.vue     # 厂处级荣誉
│   │   ├── application/        # 我的申请
│   │   ├── mine/               # 个人中心
│   │   ├── privacy/            # 隐私协议
│   │   └── admin/              # 管理员模块
│   │       ├── index.vue       # 管理后台首页
│   │       ├── audit.vue       # 数据审核
│   │       ├── import.vue      # 批量导入
│   │       ├── export.vue      # 数据导出
│   │       └── roles.vue       # 角色与用户管理
│   ├── components/             # 公共组件
│   │   ├── GlobalBottomNav.vue # 全局底部导航
│   │   ├── VolunteerCheckin.vue# 志愿打卡表单
│   │   ├── HonorApply.vue      # 荣誉申报表单
│   │   ├── Chart.vue           # 积分趋势图表
│   │   ├── AuthModal.vue       # 实名认证弹窗
│   │   ├── PrivacyModal.vue    # 隐私协议弹窗
│   │   └── UploadImage.vue     # 图片上传组件
│   ├── api/                    # 接口层
│   ├── store/                  # Pinia 状态管理
│   ├── utils/                  # 工具函数
│   └── static/                 # 静态资源
├── cloudfunctions/
│   └── volunteer-service/      # 云函数（全部后端逻辑）
│       └── index.js            # 单文件云函数入口
└── package.json
```

## 功能模块

### 用户端

- **志愿服务申报**：5个子模块，每项有独立积分范围限制，支持图片佐证上传
- **荣誉获奖申报**：4个荣誉级别，积分自动填充（国家级20分、省部级16分、厅局级12分、厂处级10分）
- **积分查看**：总积分、分项积分、年度趋势图表
- **我的申请**：查看审核状态，驳回记录可修改重提
- **订阅通知**：提交后引导订阅审核结果推送

### 管理端

- **管理后台首页**：待审/已审/驳回统计，最近申报动态
- **数据审核**：支持单条和批量审批/驳回，可调整积分和荣誉级别
- **批量导入**：Excel 上传，自动匹配用户并录入
- **数据导出**：按年度/模块/状态/用户筛选，导出 CSV
- **角色管理**：三级角色体系（super-admin / admin / member），支持角色设置与用户禁用

## 积分规则

| 模块 | 子项 | 积分范围 |
|------|------|----------|
| 志愿服务 | 传承红色文化（关心下一代） | 3-10 分/次 |
| 志愿服务 | 参与基层治理 | 1-5 分/次 |
| 志愿服务 | 服务企业发展 | 3-10 分/次 |
| 志愿服务 | 实施以老助老 | 1-5 分/次 |
| 志愿服务 | 其他服务 | 1-5 分/次 |
| 荣誉获奖 | 国家级荣誉 | 20 分/项（固定） |
| 荣誉获奖 | 省部级荣誉 | 16 分/项（固定） |
| 荣誉获奖 | 厅局级荣誉 | 12 分/项（固定） |
| 荣誉获奖 | 厂处级荣誉 | 10 分/项（固定） |

## 权限体系

| 角色 | 说明 | 权限 |
|------|------|------|
| super-admin | 超级管理员（全局唯一） | 设置/回收 admin 角色，全部管理功能 |
| admin | 管理员 | 数据审核、导入导出、禁用普通用户 |
| member | 普通用户 | 申报、查看积分、查看申请记录 |

## 后端架构

后端为单个微信云函数 `volunteer-service`，通过 action 路由分发请求：

| 前端路由 | 云函数 Action | 说明 |
|----------|--------------|------|
| POST /auth/login | wechatLogin | 微信登录 |
| POST /admin/login | adminLogin | 管理员凭证登录 |
| GET /admin/dashboard | adminDashboardSummary | 管理首页统计 |
| GET /admin/audit | adminAuditList | 审核列表 |
| POST /admin/audit | adminAuditOperate | 执行审核 |
| POST /admin/import | adminImport | 批量导入 |
| GET /admin/export | adminExport | 数据导出 |
| GET /admin/users | adminGetUsers | 用户列表 |
| POST /admin/users/role | adminSetUserRole | 设置角色 |
| POST /admin/users/disable | adminDisableUser | 禁用用户 |

## 合规说明

- 隐私协议先行：用户首次使用需同意《隐私保护指引》后方可登录
- 实名认证：需提供姓名与手机号完成认证
- 内容安全：文本和图片提交前经微信 msgSecCheck / imgSecCheck 校验
- 权限按需申请：相册/相机权限仅在用户触发上传时申请
- 敏感信息脱敏：前端展示时对姓名、手机号做脱敏处理

## 相关文档

- [AGENTS.md](AGENTS.md) - 完整业务需求与开发规范
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - AI 编程指南
