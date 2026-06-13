# 线上计分扑克

在线计分扑克牌游戏，支持多人房间、积分管理。

## 项目结构

```
├── server/          # Node.js 服务端（PM2 管理）
│   └── server.js    # 主服务，端口 3000，处理房间/成员/积分 API
├── h5/              # H5 前端页面
│   └── poker.html   # 完整 H5 单页应用
└── miniapp/         # 微信小程序端
    └── pages/       # 小程序页面
```

## 部署

### 服务端
```bash
# 上传 server.js 到服务器 /opt/poker-server/
scp server/server.js root@YOUR_DOMAIN_HERE:/opt/poker-server/
pm2 restart poker-server
```

### H5
```bash
scp h5/poker.html root@YOUR_DOMAIN_HERE:/var/www/html/
```

### 小程序
修改 `miniapp/utils/api.js` 中的域名后，通过微信开发者工具或 miniprogram-ci 上传。

## 配置

部署前需将代码中的占位符替换为实际值：
- `YOUR_DOMAIN_HERE` → 实际域名
- `YOUR_APPID_HERE` → 微信小程序 AppID
