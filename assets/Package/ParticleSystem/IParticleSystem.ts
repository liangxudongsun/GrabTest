import { Vec3 } from "cc";
import { ParticleCollider } from "./ParticleCollider";
import { Particle } from "./ParticleData";

/** ParticleSystem 暴露给管理器的接口（避免循环依赖） */
export interface IParticleSystem {
    getAliveParticles(): Particle[];
    onParticleCollision?: (p1: Particle, p2: Particle, worldPos: Vec3) => void;
    onParticleHitCollider?: (p: Particle, collider: ParticleCollider, worldPos: Vec3) => void;
    enableParticleCollision: boolean;
    enableParticleBounce: boolean;
    particleBounce: number;
}
