import { _decorator, Component } from 'cc';
import { DEBUG } from 'cc/env';
const { ccclass, executeInEditMode } = _decorator;

@ccclass('EnginePatches')
@executeInEditMode(true)
export class EnginePatches extends Component {
    onLoad() {
       let n=3;
       let chain=this.buildRenderChain(n);
       for(let i=0;i<n;i++){
          if(i==0){
            console.log(`写:${chain[i]}`)
          }else{
            console.log(`读:${chain[i]},写${chain[i+1]}`)
          }
        
       }
    }
    buildRenderChain(n) {
    // 长度为 n+1，交替 'a', 'b'，以 'a' 开头
    
    return Array.from({ length: n + 1 }, (_, i) => i % 2 === 0 ? 'a' : 'b');
}
   
}

