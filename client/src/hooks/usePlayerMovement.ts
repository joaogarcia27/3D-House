import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EYE_HEIGHT } from '../scene/buildScene';

const SPEED = 3;
const CLEARANCE = 0.3;

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export function usePlayerMovement(
  wallMeshes: React.MutableRefObject<THREE.Object3D[]>,
  touchInput?: React.MutableRefObject<{ forward: number; right: number } | null>
) {
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, delta) => {
    const k = keys.current;
    let fwd = 0;
    let right = 0;

    if (touchInput?.current) {
      fwd = touchInput.current.forward;
      right = touchInput.current.right;
    } else {
      if (k['KeyW'] || k['ArrowUp']) fwd += 1;
      if (k['KeyS'] || k['ArrowDown']) fwd -= 1;
      if (k['KeyD'] || k['ArrowRight']) right += 1;
      if (k['KeyA'] || k['ArrowLeft']) right -= 1;
    }

    if (fwd === 0 && right === 0) return;

    camera.getWorldDirection(_dir);
    _dir.y = 0;
    _dir.normalize();
    _right.crossVectors(_dir, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3()
      .addScaledVector(_dir, fwd)
      .addScaledVector(_right, right)
      .normalize()
      .multiplyScalar(SPEED * delta);

    // Collision check in movement direction
    if (move.length() > 0 && wallMeshes.current.length > 0) {
      const movDir = move.clone().normalize();
      _raycaster.set(camera.position, movDir);
      _raycaster.far = CLEARANCE + 0.1;
      const hits = _raycaster.intersectObjects(wallMeshes.current, true);
      if (hits.length > 0 && hits[0].distance < CLEARANCE) {
        // Project movement onto wall surface (allow sliding)
        const wallNormal = hits[0].face?.normal.clone() ?? new THREE.Vector3();
        wallNormal.transformDirection(hits[0].object.matrixWorld);
        wallNormal.y = 0;
        wallNormal.normalize();
        const dot = movDir.dot(wallNormal);
        move.addScaledVector(wallNormal, -dot * move.length());
      }
    }

    camera.position.add(move);
    camera.position.y = EYE_HEIGHT; // lock to eye height (scaled to match splats)
  });
}
