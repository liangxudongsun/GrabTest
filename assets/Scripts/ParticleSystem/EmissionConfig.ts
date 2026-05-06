import { Vec3, Color, CurveRange } from 'cc';

/** 发射形状 */
export enum EmitShape {
    BOX,
    SPHERE,
    CIRCLE,
    POINT,
}

/** 粒子发射配置 */
export class EmissionConfig {
    /** 每秒发射数 */
    rateOverTime = 10;
    /** 每单位距离发射数 */
    rateOverDistance = 0;
    /** 初始速度 */
    startSpeed: CurveRange = new CurveRange();
    /** 初始大小 */
    startSize: CurveRange = new CurveRange();
    /** 初始旋转（度） */
    startRotation: CurveRange = new CurveRange();
    /** 初始颜色 */
    startColor = new Color(255, 255, 255, 255);
    /** 寿命 */
    startLifetime: CurveRange = new CurveRange();
    /** 发射形状 */
    shape: EmitShape = EmitShape.POINT;
    /** Box 尺寸 / Sphere 半径 */
    shapeRadius = 1;
    /** 发射厚度 [0,1] */
    shapeThickness = 1;
}
 