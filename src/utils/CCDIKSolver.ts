/**
 * CCD IK Solver，参考 open-pose-editor (CCD Algorithm)
 * 用于末端（手腕/脚踝）拖动时驱动整条骨骼链
 */
import * as THREE from 'three';

export interface IKS {
  /** IK 目标（可被 TransformControls 拖动的物体） */
  target: THREE.Object3D;
  /** 末端骨骼（effector） */
  effector: THREE.Object3D;
  /** 从 effector 到根的骨骼链（靠近 effector 的在前） */
  links: Array<{
    enabled: boolean;
    index: THREE.Object3D;
    limitation?: THREE.Vector3;
    rotationMin?: THREE.Vector3;
    rotationMax?: THREE.Vector3;
  }>;
  iteration: number;
  minAngle?: number;
  maxAngle?: number;
}

const _q = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _targetVec = new THREE.Vector3();
const _effectorPos = new THREE.Vector3();
const _effectorVec = new THREE.Vector3();
const _linkPos = new THREE.Vector3();
const _invLinkQ = new THREE.Quaternion();
const _linkScale = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _vector = new THREE.Vector3();

export class CCDIKSolver {
  iks: IKS[];

  constructor(iks: IKS[] = []) {
    this.iks = iks;
    this._valid();
  }

  update(): this {
    for (let i = 0, il = this.iks.length; i < il; i++) {
      this.updateOne(this.iks[i]);
    }
    return this;
  }

  updateOne(ik: IKS): this {
    const bones = ik.links.map((i) => i.index);
    const effector = ik.effector;
    const target = ik.target;
    _targetPos.setFromMatrixPosition(target.matrixWorld);

    const links = ik.links;
    const iteration = ik.iteration !== undefined ? ik.iteration : 1;

    for (let i = 0; i < iteration; i++) {
      let rotated = false;
      for (let j = 0, jl = links.length; j < jl; j++) {
        const link = bones[j];
        if (links[j].enabled === false) break;

        const limitation = links[j].limitation;
        const rotationMin = links[j].rotationMin;
        const rotationMax = links[j].rotationMax;

        link.matrixWorld.decompose(_linkPos, _invLinkQ, _linkScale);
        _invLinkQ.invert();
        _effectorPos.setFromMatrixPosition(effector.matrixWorld);

        _effectorVec.subVectors(_effectorPos, _linkPos).applyQuaternion(_invLinkQ).normalize();
        _targetVec.subVectors(_targetPos, _linkPos).applyQuaternion(_invLinkQ).normalize();

        let angle = _targetVec.dot(_effectorVec);
        if (angle > 1.0) angle = 1.0;
        else if (angle < -1.0) angle = -1.0;
        angle = Math.acos(angle);

        if (angle < 1e-5) continue;
        if (ik.minAngle !== undefined && angle < ik.minAngle) angle = ik.minAngle;
        if (ik.maxAngle !== undefined && angle > ik.maxAngle) angle = ik.maxAngle;

        _axis.crossVectors(_effectorVec, _targetVec).normalize();
        _q.setFromAxisAngle(_axis, angle);
        link.quaternion.multiply(_q);

        if (limitation !== undefined) {
          let c = link.quaternion.w;
          if (c > 1.0) c = 1.0;
          const c2 = Math.sqrt(1 - c * c);
          link.quaternion.set(limitation.x * c2, limitation.y * c2, limitation.z * c2, c);
        }
        if (rotationMin !== undefined) {
          link.rotation.x = Math.max(link.rotation.x, rotationMin.x);
          link.rotation.y = Math.max(link.rotation.y, rotationMin.y);
          link.rotation.z = Math.max(link.rotation.z, rotationMin.z);
        }
        if (rotationMax !== undefined) {
          link.rotation.x = Math.min(link.rotation.x, rotationMax.x);
          link.rotation.y = Math.min(link.rotation.y, rotationMax.y);
          link.rotation.z = Math.min(link.rotation.z, rotationMax.z);
        }

        link.updateMatrixWorld(true);
        rotated = true;
      }
      if (!rotated) break;
    }
    return this;
  }

  private _valid(): void {
    for (let i = 0, il = this.iks.length; i < il; i++) {
      const ik = this.iks[i];
      const links = ik.links;
      let link0: THREE.Object3D = ik.effector;
      for (let j = 0, jl = links.length; j < jl; j++) {
        const link1 = links[j].index;
        if (link0.parent !== link1) {
          console.warn(
            `CCDIKSolver: bone ${link0.name} is not the child of bone ${link1.name}`
          );
        }
        link0 = link1;
      }
    }
  }
}
