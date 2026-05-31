import { _decorator, Component } from 'cc';
import { EDITOR } from 'cc/env';
import { CCEManager } from '../Plans/index';
const { ccclass, executeInEditMode } = _decorator;

const JSON_URL = 'db://assets/Json/Test.json';

@ccclass('TestJson')
@executeInEditMode(true)
export class TestJson extends Component {
    start() {
        if (!EDITOR) return;
         CCEManager.writeJson(JSON_URL,{a:'lzh'});
    }
}
   
