# 试玩环境部署

试玩服务由一个 Go 进程同时提供网页和 WebSocket，部署为**单实例**。房间与对局随时写入一个 SQLite 文件：重启或重新部署后，未关闭的房间会回到服务器，玩家的页面自动重连并回到原座位，被打断的阶段重新计时。前端连接同一域名下的 `/ws`，反向代理须支持 WebSocket 升级。

## 在服务器上构建和运行

服务器需要 Docker 和可供构建镜像的网络连接。以下命令在仓库根目录运行：

```bash
docker build -t decrypto-demo:latest .
docker run -d --name decrypto-demo --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v decrypto-data:/data \
  --env-file /etc/decrypto/demo.env \
  decrypto-demo:latest
curl -fsS http://127.0.0.1:8080/healthz
```

`-v decrypto-data:/data` 把房间数据放在具名卷里。不加这一项时，数据只跟随当前容器：`docker restart` 后仍在，换新容器（重新部署）后丢失。若改用宿主机目录（`-v /srv/decrypto:/data`），该目录须允许容器内的 `app` 用户写入。

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

## 房间数据

数据库文件由 `DECRYPTO_DB_PATH` 指定，镜像内为 `/data/decrypto.db`，直接运行二进制时默认为工作目录下的 `data/decrypto.db`。文件无法打开时服务拒绝启动。

- **保存什么**：每个未关闭房间的队伍、座位与对局进度；以及谁开过、进过哪些房间。浏览器首次进房时生成一个长期的设备令牌，库中只保存它的哈希（`device_id`），同一浏览器在不同房间里的 `device_id` 相同。座位的恢复令牌同样只保存哈希。
- **保存多久**：房间内没有真人在线满 10 分钟即关闭，重启后重新计这 10 分钟。关闭的房间删除对局状态、释放房间码，保留开房与进房记录。
- **恢复到哪里**：对局在每个阶段开始和每次结算时保存。重启后从被打断的阶段重新开始，已结算的拦截和解码不会重来；该阶段已写未交的线索保留在玩家的页面里。第一位真人回来之前，对局保持暂停。
- **版本更替**：新版本读不懂旧对局状态时，该房间回到大厅，队伍保留；读不懂房间状态时，该房间关闭。两种情况都会写入日志，不影响服务启动。

查询谁开过哪些房间。镜像内没有 `sqlite3`，先把整个数据目录取出来；服务运行时最近的改动在 `decrypto.db-wal` 里，只复制 `decrypto.db` 会漏掉它们：

```bash
docker cp decrypto-demo:/data ./decrypto-data && cd decrypto-data
sqlite3 -header -column decrypto.db "
  SELECT m.device_id, m.nickname, r.code,
         datetime(r.created_at / 1000, 'unixepoch', 'localtime') AS opened,
         datetime(r.closed_at / 1000, 'unixepoch', 'localtime') AS closed
  FROM room_members m JOIN rooms r ON r.id = m.room_id
  WHERE m.creator = 1 ORDER BY r.created_at"
```

去掉 `m.creator = 1` 即为所有进过房间的玩家。正常停止（`docker stop`）后全部数据都在 `decrypto.db` 这一个文件里，此时复制它即是完整备份。

## 上线前验证

1. `curl -fsS https://play.example.com/healthz` 返回 `ok`。
2. 在桌面和手机浏览器打开首页与 `/preview`，确认静态资源加载正常。
3. 用两个不同的浏览器创建房间、加入并进行至少一轮；刷新其中一个页面，确认能回到同一局。
4. 对局进行中执行 `docker restart decrypto-demo`，确认两个页面在几秒内自动回到同一回合、同一阶段，并能继续提交。
5. 若开放 AI，使用服务器上的模型配置完成一局，确认没有持续使用备用线索。
6. 拍摄或录制发布素材时使用这个部署的版本；将版本号或 Git 提交号记录在帖文草稿中。

发布前检查第三方游戏名称、词库和素材的使用范围。当前项目许可证只覆盖有权许可的项目内容。
