# ASF 激活码验证服务器 Docker 镜像
# 基于 Alpine Linux，最小化体积

FROM node:18-alpine AS builder

# 安装编译依赖（如果需要原生模块）
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 生产镜像
FROM node:18-alpine

# 安装时区和证书
RUN apk add --no-cache \
    tzdata \
    ca-certificates \
    && update-ca-certificates

# 设置时区
ENV TZ=Asia/Shanghai

# 从 builder 阶段复制已安装的依赖和应用代码
COPY --from=builder /app /app

# 设置工作目录
WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S asf -u 1001 && \
    chown -R asf:nodejs /app

USER asf

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { if(r.statusCode !== 200) throw new Error('Health check failed') })" || exit 1

# 启动命令
CMD ["node", "server.js"]