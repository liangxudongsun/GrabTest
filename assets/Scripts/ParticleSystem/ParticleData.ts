import { Color, Vec3, Vec4, Quat, Mat4 } from 'cc';

/** 单个粒子数据 */
export class Particle {
    /** 是否存活 */
    alive = false;
    /** 粒子系统坐标（世界） */
    rootWorldPos = new Vec3();
    /** 粒子系统世界旋转 */
    rootWorldRot = new Quat();
    /** 粒子系统世界矩阵 */
    rootWorldMat = new Mat4();  
    /** 粒子局部坐标 */
    position = new Vec3();
    /** 粒子世界坐标（= rootWorldPos + position） */
    _worldPos = new Vec3();
    /** 速度 */
    velocity = new Vec3();  
    /** 颜色 */
    color = new Color(255, 255, 255, 255); 
    /** 颜色（浮点）RGBA */
    color4 = new Vec4(1, 1, 1, 1);
    /** 大小 */
    size = new Vec3(1, 1, 1);
    /** 旋转（度），XYZ 分量 */
    rotation = new Vec3();
    /** 已存活时间 */
    age = 0;
    /** 总寿命 */
    lifetime = 1;
    /** 随机种子 [0,1]，用于 CurveRange.evaluate(t, rand) */
    randomSeed = Math.random();
    /** 碰撞分组 */
    group = 1;
    /** 归一化生命周期 [0,1] */
    get normalizedAge(): number {
        return Math.min(this.age / this.lifetime, 1);
    }


    getWorldPos(): Vec3 {
        this._worldPos.x = this.rootWorldPos.x + this.position.x;
        this._worldPos.y = this.rootWorldPos.y + this.position.y;
        this._worldPos.z = this.rootWorldPos.z + this.position.z;
        return this._worldPos;
    }
}
