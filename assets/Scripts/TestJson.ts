import { _decorator, Component } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, executeInEditMode } = _decorator;

const JSON_URL = 'db://assets/Json/Test.json';

@ccclass('TestJson')
@executeInEditMode(true)
export class TestJson extends Component {
    start() {
        if (!EDITOR) return;
        this.writeJson();
    }

    async writeJson() {
        const Editor = (window as any).Editor;
        if (!Editor?.Message?.request) return;

        // 检查是否已存在（query-url 返回 null 或 uuid）
        //资源查询api有问题！！资源存在也是null
        const exists = await Editor.Message.request('asset-db', 'query-asset-info', JSON_URL);
        if (exists) {
            console.log('[TestJson] 已存在，跳过创建'); 
            return;
        }
       

        try {
            const data = { a: 'jsonTest' };
            await Editor.Message.request('asset-db', 'create-asset',
                JSON_URL, JSON.stringify(data, null, 2));
            console.log('[TestJson] 创建成功:', JSON_URL);
        } catch (e) {
            console.error('[TestJson] 创建失败:', e);
        }
    }
}
