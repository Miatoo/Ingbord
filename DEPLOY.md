# 静态部署

当前仓库已通过 GitHub Pages 发布：

https://miatoo.github.io/Ingbord/

（`gh-pages` 分支为构建产物；更新网页时重新 `npm run build` 后推送 `dist` 到该分支即可。）

构建后也可将站点文件放到任意静态服务器。

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
