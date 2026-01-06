import express from 'express';
import { wsServer } from './server/wsServer';
import { browserManager } from './server/browserManager';

const HTTP_PORT = 8766;
const WS_PORT = 8765;

const app = express();
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// 获取会话信息
app.get('/api/session/:id', (req, res) => {
    const session = wsServer.getSession(req.params.id);
    if (session) {
        res.json(session);
    } else {
        res.status(404).json({ error: '会话不存在' });
    }
});

// 获取生成的代码
app.get('/api/session/:id/code', (req, res) => {
    const code = wsServer.getGeneratedCode(req.params.id);
    if (code) {
        res.json({ code });
    } else {
        res.status(404).json({ error: '未找到生成的代码' });
    }
});

// 保存脚本（预留接口，后续对接后端）
app.post('/api/scripts/save', async (req, res) => {
    const { sessionId, name, description, storageType } = req.body;

    const code = wsServer.getGeneratedCode(sessionId);
    if (!code) {
        return res.status(404).json({ error: '未找到生成的代码' });
    }

    // TODO: 对接后端 API 保存到数据库或 OSS
    console.log(`保存脚本: ${name}, 存储类型: ${storageType}`);

    res.json({
        success: true,
        scriptId: `script_${Date.now()}`,
        message: '脚本保存成功（待对接后端）'
    });
});

// 启动服务
async function main() {
    // 启动 WebSocket 服务器
    wsServer.start(WS_PORT);

    // 启动 HTTP 服务器
    app.listen(HTTP_PORT, () => {
        console.log(`HTTP 服务器已启动，端口: ${HTTP_PORT}`);
        console.log(`Agent 服务就绪`);
    });

    // 优雅退出
    process.on('SIGINT', async () => {
        console.log('正在关闭服务...');
        wsServer.stop();
        await browserManager.close();
        process.exit(0);
    });
}

main().catch(console.error);
