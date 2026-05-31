export interface AxisData {
    val: number;
    max: number;
    min: number;
    name: string;
}

/** 粒子碰撞体面板数据 */
export interface ColliderData {
    mode: 'box' | 'sphere';
    name: string;
    size: { x: AxisData; y: AxisData; z: AxisData };
    radius: { x: AxisData };
    offset: { x: AxisData; y: AxisData; z: AxisData };
    rot: { x: AxisData; y: AxisData; z: AxisData };
    groupTag: { name: string; data: string };
}
