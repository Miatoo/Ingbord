# 静态部署

构建后将站点文件放到任意静态服务器即可。

## 构建

```bash
npm install
npm run build
```

上传 `dist/` 到服务器或静态托管。

## Nginx 示例

```nginx
server {
    listen 80;
    server_name your.domain.example;
    root /var/www/ingbord-oss/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

也可用 `npx serve dist`、宝塔静态站、Cloudflare Pages 等。

项目数据在用户浏览器本地，换设备或清站点数据会丢失，请自行导出工程备份。
