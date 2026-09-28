# 试玩环境部署

试玩服务由一个 Go 进程同时提供网页和 WebSocket。房间与对局只存在该进程的内存中，因此部署为**单实例**；重启或重新部署会结束正在进行的对局。前端连接同一域名下的 `/ws`，反向代理须支持 WebSocket 升级。

## 在服务器上构建和运行

服务器需要 Docker 和可供构建镜像的网络连接。以下命令在仓库根目录运行：

```bash
docker build -t decrypto-demo:latest .
docker run -d --name decrypto-demo --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  --env-file /etc/decrypto/demo.env \
  decrypto-demo:latest
curl -fsS http://127.0.0.1:8080/healthz
```

`/etc/decrypto/demo.env` 是服务器上的私有文件，不要加入仓库。需要 AI 时至少配置一个提供商，例如：

```dotenv
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=your-model
# 可按模型能力设置 OPENAI_REASONING_EFFORT、OPENAI_MAX_TOKENS、OPENAI_EXTRA_BODY
```

也可以使用 `ANTHROPIC_API_KEY`。未设置 Key 时，AI 席位只会给出备用答案；如要在公开试玩中展示 AI，请用部署环境的模型完成一次真实对局。

若服务器使用 Caddy，域名指向服务器后可配置：

```caddyfile
play.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy 会处理 HTTPS 和 WebSocket 升级。若现有反向代理修改了上游的 `Host`，设置 `DECRYPTO_ALLOWED_ORIGINS=https://play.example.com`，只列出实际访问域名；多个域名以逗号分隔。默认接受同域名的浏览器 WebSocket 连接，以及本机 Vite 开发端口。

## 上线前验证

1. `curl -fsS https://play.example.com/healthz` 返回 `ok`。
2. 在桌面和手机浏览器打开首页与 `/preview`，确认静态资源加载正常。
3. 用两个不同的浏览器创建房间、加入并进行至少一轮；刷新其中一个页面，确认能回到同一局。
4. 若开放 AI，使用服务器上的模型配置完成一局，确认没有持续使用备用线索。
5. 拍摄或录制发布素材时使用这个部署的版本；将版本号或 Git 提交号记录在帖文草稿中。

发布前检查第三方游戏名称、词库和素材的使用范围。当前项目许可证只覆盖有权许可的项目内容。
