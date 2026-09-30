# Deployment Runbook

> Eotion 正式环境的构建、部署、验证与回滚流程。当前部署模式为宿主机 Nginx + Docker Compose；MongoDB 与 ali-oss-server 作为独立服务，通过 Docker external network 接入。

## Topology

```text
Internet
  ↓
https://<EOTION_DOMAIN>
  ↓
Host Nginx :443
  ↓
127.0.0.1:8001
  ↓
eotion-web (nginx)
  ├─ static web
  └─ /api/* → eotion-api:7137
                   ├─ mongo network → mongodb:27017
                   └─ ali-oss network → ali-oss-server:9512
```

公网只需要开放 80/443。Eotion API 不映射宿主机端口；Web 仅绑定 `127.0.0.1:8001`。

## Prerequisites

部署前必须满足：

- Docker / Docker Compose 可用。
- 外部 Docker network `mongo` 已存在，且 MongoDB 容器已加入。
- MongoDB 已启用 replica set；当前正式环境使用单节点 `rs0`，member 为 `mongodb:27017`，状态为 `PRIMARY`。
- MongoDB 已创建 Eotion 专用用户，并具有 `eotion` 数据库的 `readWrite` 权限。
- 外部 Docker network `ali-oss` 已存在，且 `ali-oss-server` 容器已加入。
- ali-oss-server 已创建供 Eotion 使用的 client id / client secret。
- 正式域名 A/AAAA 记录已经指向服务器。
- 宿主机 Nginx 可用。

检查外部网络：

```bash
docker network inspect mongo >/dev/null && echo "mongo network OK"
docker network inspect ali-oss >/dev/null && echo "ali-oss network OK"
```

MongoDB 与 ali-oss-server 应分别出现在对应 network 的 Containers 中。

## Environment

在仓库根目录创建未提交的 `.env`：

```env
WEB_ORIGIN=https://eotion.example.com
API_ORIGIN=https://eotion.example.com

MONGODB_URI=mongodb://eotion:<EOTION_MONGO_PASSWORD>@mongodb:27017/eotion?authSource=eotion&replicaSet=rs0

REDIS_URL=
KAFKA_BROKERS=

ALI_OSS_SERVER_URL=http://ali-oss-server:9512
ALI_OSS_CLIENT_ID=<EOTION_OSS_CLIENT_ID>
ALI_OSS_CLIENT_SECRET=<EOTION_OSS_CLIENT_SECRET>
ALI_OSS_OBJECT_PREFIX=eotion
ALI_OSS_MAX_UPLOAD_BYTES=20971520
```

要求：

- 将 `eotion.example.com` 替换为正式域名，Origin 不要带末尾 `/`。
- MongoDB 密码取 MongoDB 部署配置中的 Eotion 专用用户密码。
- Eotion API 在 Docker 内访问 MongoDB 时使用 `mongodb:27017`，不要使用 `127.0.0.1`。
- Eotion API 在 Docker 内访问 ali-oss-server 时使用 `http://ali-oss-server:9512`。
- client secret 只存在服务端环境变量中，不得暴露给 Web。
- `.env` 已被仓库 `.gitignore` 忽略。

展开并检查 Compose：

```bash
docker compose config
```

重点确认 `WEB_ORIGIN`、`API_ORIGIN`、`MONGODB_URI` 和 `ALI_OSS_SERVER_URL`。

## First Deploy

拉取代码：

```bash
git checkout master
git pull --ff-only origin master
```

构建并启动：

```bash
docker compose up -d --build
```

检查状态：

```bash
docker compose ps
docker logs --tail=100 eotion-api
docker logs --tail=100 eotion-web
```

验证 Docker DNS：

```bash
docker exec eotion-api getent hosts mongodb
docker exec eotion-api getent hosts ali-oss-server
```

验证宿主机到 Web：

```bash
curl -I http://127.0.0.1:8001
curl http://127.0.0.1:8001/api/health
```

`/api/health` 只能证明 API 链路和配置基本正常；MongoDB 最终需要通过实际注册、登录、页面写入和同步验证。

## Host Nginx

示例配置：

```nginx
server {
    listen 80;
    server_name eotion.example.com;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

注意：

- 外层 Nginx 必须配置 `client_max_body_size 25m`，否则附件可能在到达 Eotion 前被默认 1 MB 限制拒绝。
- 必须传递 `X-Forwarded-Proto`，使内层反向代理继续向 API 传递真实 HTTPS scheme。

检查并加载：

```bash
nginx -t
systemctl reload nginx
```

## HTTPS

生产环境必须使用 HTTPS。使用 Certbot 时可执行：

```bash
certbot --nginx -d eotion.example.com
nginx -t
systemctl reload nginx
```

正式环境 `NODE_ENV=production`，Session Cookie 使用安全属性；同时 Web Service Worker / 离线恢复也应在安全 Origin 下验收。

## Acceptance

部署完成后至少验证：

1. `https://<domain>/api/health` 可访问。
2. 注册、登录和 Session 恢复正常。
3. 创建 Workspace / Page 后刷新或重新打开浏览器，服务端数据仍存在。
4. 两个独立浏览器上下文登录同一账户，页面变更可以同步。
5. 离线编辑、重新打开、恢复网络后能够继续同步。
6. Eotion API 能解析 `mongodb` 与 `ali-oss-server` Docker DNS。
7. 文件接口启用后，上传/删除链路可到达 ali-oss-server。

Mongo replica set 可独立检查：

```bash
docker exec mongodb sh -lc '
  mongosh --quiet \
    --host 127.0.0.1 \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "printjson(db.getSiblingDB(\"admin\").runCommand({ replSetGetStatus: 1 }).members.map(m => ({ name: m.name, state: m.stateStr, self: m.self })))"
'
```

预期 `mongodb:27017` 为 `PRIMARY`。

## Routine Deploy

普通更新：

```bash
git pull --ff-only origin master
docker compose up -d --build
docker compose ps
```

更新后检查：

```bash
curl -fsS http://127.0.0.1:8001/api/health
docker logs --tail=100 eotion-api
```

不要使用 `docker compose down -v` 清理环境。Eotion 自身当前没有数据库 volume，但同机 MongoDB 等服务可能依赖 Docker volume；运维时不要进行无差别 volume prune。

## Rollback

记录部署前 commit：

```bash
git rev-parse HEAD
```

若新版本异常，切回上一已知稳定 commit 后重新构建：

```bash
git checkout <LAST_GOOD_COMMIT>
docker compose up -d --build
```

确认恢复后再决定是否回到 `master`：

```bash
git checkout master
```

数据库 schema / 数据迁移如未来出现不可逆变更，必须单独制定回滚策略，不能仅依赖代码版本回退。

## Production Safety

- 不向公网开放 MongoDB 27017、Eotion API 7137、Eotion Web 8001 或 ali-oss-server 9512。
- 不把 MongoDB 密码、OSS client secret 或其他生产凭据提交到 Eotion 仓库。
- 不执行 `docker compose down -v`、`docker volume prune` 或带 `--volumes` 的全局 prune，除非明确知道会删除哪些数据。
- 正式部署前确认外部 `mongo` 与 `ali-oss` network 存在。
- 对上传链路保持宿主机与容器内 Nginx 的 body-size 限制一致。
- 生产域名切换后同步更新 `WEB_ORIGIN` 与 `API_ORIGIN`。
