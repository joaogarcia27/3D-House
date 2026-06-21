import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import type { Session } from '../types';
import { buildScene, computeSpawnPoint, SPLAT_SCALE, EYE_HEIGHT } from '../scene/buildScene';
import type { SceneRoom } from '../scene/buildScene';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import { useRenderTier } from '../hooks/useRenderTier';
import { OverheadMinimap } from './OverheadMinimap';
import { GenerationStatusHUD } from './GenerationStatusHUD';
import { TouchControls } from './TouchControls';
import { useSession } from '../SessionContext';

// Only treat as touch device if it has no fine pointer (i.e. no mouse/trackpad).
// Macs with Apple Silicon report maxTouchPoints > 0 even without a touchscreen.
const TOUCH_SUPPORT =
  ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
  !window.matchMedia('(pointer: fine)').matches;

function SceneContent({
  session,
  wallMeshesRef,
  sceneGroupRef,
  sceneRoomsRef,
  spawnRef,
  touchInput,
  onSceneReady,
}: {
  session: Session;
  wallMeshesRef: React.MutableRefObject<THREE.Object3D[]>;
  sceneGroupRef: React.MutableRefObject<(THREE.Group & { sceneRooms?: SceneRoom[] }) | null>;
  sceneRoomsRef: React.MutableRefObject<SceneRoom[]>;
  spawnRef: React.MutableRefObject<THREE.Vector3>;
  touchInput: React.MutableRefObject<{ forward: number; right: number } | null>;
  onSceneReady: (rooms: SceneRoom[]) => void;
}) {
  const { camera, gl } = useThree();
  const tier = useRenderTier();
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<{ lock: () => void; unlock: () => void }>(null);

  const { sceneGroup, spawn } = useMemo(() => {
    const aspect = session.floorPlan ? 1 : 1;
    const sg = buildScene(session.rooms, aspect);
    const sp = computeSpawnPoint(sg.sceneRooms);
    return { sceneGroup: sg, spawn: sp };
  }, [session.rooms]);

  useEffect(() => {
    if (tier === 'low') gl.setPixelRatio(0.75);
  }, [gl, tier]);

  useEffect(() => {
    camera.position.copy(spawn);
    spawnRef.current = spawn;
    sceneGroupRef.current = sceneGroup;
    sceneRoomsRef.current = sceneGroup.sceneRooms;

    const walls: THREE.Object3D[] = [];
    sceneGroup.traverse((child) => {
      if (child.userData.isWall) walls.push(child);
    });
    wallMeshesRef.current = walls;

    console.log(
      `[Scene] scene ready — rooms=${sceneGroup.sceneRooms.length} walls=${walls.length}` +
      ` spawn=(${spawn.x.toFixed(2)},${spawn.y.toFixed(2)},${spawn.z.toFixed(2)})`
    );
    onSceneReady(sceneGroup.sceneRooms);
  }, [sceneGroup, spawn, camera, sceneGroupRef, sceneRoomsRef, wallMeshesRef, spawnRef, onSceneReady]);

  usePlayerMovement(wallMeshesRef, TOUCH_SUPPORT ? touchInput : undefined);

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight intensity={1.0} position={[10, 20, 10]} />
      {groupRef && <primitive ref={groupRef} object={sceneGroup} />}
      {!TOUCH_SUPPORT && (
        // @ts-ignore - PointerLockControls ref typing quirk
        <PointerLockControls ref={controlsRef} />
      )}
    </>
  );
}

// Lives inside <Canvas>. Loads one SplatMesh per room and shows only the splat
// for the room the camera is currently in, hiding that room's Three.js geometry.
// World Labs metadata (metric_scale_factor, ground_plane_offset) per job id:
//   splat.scale    = metric_scale_factor  (1 WL unit → metric_scale_factor metres)
//   splat.position.y = ground_plane_offset * metric_scale_factor  (aligns WL floor to Y=0)
const SPLAT_META: Record<string, { scale: number; groundY: number }> = {
  'a232d26c-3b1e-4bc3-b24a-c1249fc662a4': { scale: 1.3381, groundY: 1.3381 * 1.2170 },
  'de96d5ba-9b56-489f-8482-9f928f87fddd': { scale: 0.7041, groundY: 0.7041 * 1.0580 },
  '1e6c0bad-abaa-4a02-80ff-2b081001d1bf': { scale: 0.7135, groundY: 0.7135 * 1.2212 },
};

const WALL_HEIGHT_APPROX = 2.7;

// Fallback geometry per room — flat planes that fill areas where the splat has sparse
// coverage (edges, floor, ceiling). Rendered before everything else (renderOrder=-1,
// depthWrite=false) so the splat always wins where it has geometry.
interface RoomFallback { meshes: THREE.Mesh[] }

function makeFallbackPlanes(worldX: number, worldZ: number, w: number, d: number): RoomFallback {
  const meshes: THREE.Mesh[] = [];
  const bgMat = (color: number) =>
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false });

  const addPlane = (geo: THREE.BufferGeometry, mat: THREE.MeshBasicMaterial, rx: number, px: number, py: number, pz: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = rx; m.rotation.y = ry;
    m.position.set(px, py, pz);
    m.renderOrder = -1;
    m.visible = false;
    meshes.push(m);
  };

  const pad = 8;
  // Floor — warm beige; follows camera so always underfoot
  addPlane(new THREE.PlaneGeometry(w + pad, d + pad), bgMat(0xc8b89a), -Math.PI / 2, worldX, 0.005, worldZ);
  // Ceiling — off-white
  addPlane(new THREE.PlaneGeometry(w + pad, d + pad), bgMat(0xf0ede8), Math.PI / 2, worldX, WALL_HEIGHT_APPROX - 0.005, worldZ);
  // North wall
  addPlane(new THREE.PlaneGeometry(w + pad, WALL_HEIGHT_APPROX), bgMat(0xddd5c8), 0, worldX, WALL_HEIGHT_APPROX / 2, worldZ - d / 2 - 0.1);
  // South wall
  addPlane(new THREE.PlaneGeometry(w + pad, WALL_HEIGHT_APPROX), bgMat(0xddd5c8), 0, worldX, WALL_HEIGHT_APPROX / 2, worldZ + d / 2 + 0.1);
  // West wall
  addPlane(new THREE.PlaneGeometry(d + pad, WALL_HEIGHT_APPROX), bgMat(0xddd5c8), 0, worldX - w / 2 - 0.1, WALL_HEIGHT_APPROX / 2, worldZ, Math.PI / 2);
  // East wall
  addPlane(new THREE.PlaneGeometry(d + pad, WALL_HEIGHT_APPROX), bgMat(0xddd5c8), 0, worldX + w / 2 + 0.1, WALL_HEIGHT_APPROX / 2, worldZ, Math.PI / 2);

  return { meshes };
}

function SplatSceneRenderer({
  sceneGroupRef,
  sceneRooms,
  onRoomSwitch,
}: {
  sceneGroupRef: React.MutableRefObject<(THREE.Group & { sceneRooms?: SceneRoom[] }) | null>;
  sceneRooms: SceneRoom[];
  onRoomSwitch: (doSwitch: () => void) => void;
}) {
  const { gl, scene } = useThree();
  const { jobs } = useSession();
  const sparkRef = useRef<InstanceType<typeof SparkRenderer> | null>(null);
  const splatMap = useRef<Map<string, InstanceType<typeof SplatMesh>>>(new Map());
  const fallbackMap = useRef<Map<string, RoomFallback>>(new Map());
  const eyeHeightMap = useRef<Map<string, number>>(new Map()); // per-room eye height (world units)
  const entryYawMap = useRef<Map<string, number>>(new Map()); // yaw to face into the room on entry
  const pendingYawRef = useRef<number | null>(null); // applied once on the next frame after a switch
  const activeRoomIdRef = useRef<string | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    scene.add(spark);
    sparkRef.current = spark;
    console.log('[Splat] SparkRenderer initialised');
    return () => { scene.remove(spark); };
  }, [gl, scene]);

  useEffect(() => {
    if (!sparkRef.current || !sceneGroupRef.current) return;
    for (const job of jobs) {
      if (!job.splatUrl || loadedRef.current.has(job.id)) continue;
      const sr = sceneGroupRef.current.sceneRooms?.find((r) => r.room.id === job.roomId);
      if (!sr) continue;
      loadedRef.current.add(job.id);

      const meta = SPLAT_META[job.id] ?? { scale: 1, groundY: 1.1 };
      const groundOffset = meta.groundY / meta.scale; // = World Labs ground_plane_offset (WL units)
      console.log(`[Splat] loading "${sr.room.label}"`);

      const splat = new SplatMesh({
        url: job.splatUrl,
        onLoad: () => {
          // Collect opaque splat positions, then find the room's GEOMETRIC centre via per-axis
          // percentiles (robust to window/sky outliers AND to uneven splat density — a centroid
          // gets pulled toward the densest wall, leaving the camera jammed against it).
          const xs: number[] = [], ys: number[] = [], zs: number[] = [];
          splat.forEachSplat((_i, c, _s, _q, opacity) => {
            if (opacity < 0.4) return;
            xs.push(c.x); ys.push(c.y); zs.push(c.z);
          });
          if (xs.length === 0) { console.warn(`[Splat] "${sr.room.label}" empty`); return; }
          const pct = (arr: number[], p: number) => { arr.sort((a, b) => a - b); return arr[Math.floor(arr.length * p)]; };
          const xLo = pct(xs, 0.08), xHi = pct(xs, 0.92);
          const zLo = pct(zs, 0.08), zHi = pct(zs, 0.92);
          const yLo = pct(ys, 0.05), yHi = pct(ys, 0.95);

          const midX = (xLo + xHi) / 2, midZ = (zLo + zHi) / 2; // room geometric centre (local)
          const sizeX = (xHi - xLo) || 1, sizeZ = (zHi - zLo) || 1, sizeY = (yHi - yLo) || 1;

          // Fit the room footprint to the room box (use min ratio so it fits without huge overflow).
          const fit = Math.min(sr.worldW / sizeX, sr.worldD / sizeZ) * 1.05;
          splat.scale.setScalar(fit);

          // rotation.x = π flips WL Y-down → Three Y-up.
          //   world_x = pos.x + localX·fit   → centre midX at room centre
          //   world_z = pos.z − localZ·fit   → centre midZ at room centre
          //   world_y = pos.y − localY·fit   → floor (max local Y, Y-down) at world Y=0
          splat.position.set(
            sr.worldX - midX * fit,
            yHi * fit,
            sr.worldZ + midZ * fit,
          );

          // Eye height = 45% up the measured room height.
          const eye = sizeY * fit * 0.45;
          eyeHeightMap.current.set(sr.room.id, eye);

          // Entry yaw: face the direction of GREATEST room depth (longest interior sightline,
          // i.e. across the room toward the far wall) — NOT the nearest wall. Bin splats into
          // angular sectors around the centre; the sector whose wall is farthest is the most
          // open direction and shows the most room.
          const SECTORS = 24;
          const sectorDists: number[][] = Array.from({ length: SECTORS }, () => []);
          splat.forEachSplat((_i, c, _s, _q, opacity) => {
            if (opacity < 0.4) return;
            const lx = c.x - midX, lz = c.z - midZ;
            const dist = Math.hypot(lx, lz);
            if (dist < 0.2) return; // ignore splats at the very centre
            let a = Math.atan2(lz, lx); if (a < 0) a += Math.PI * 2;
            const s = Math.min(SECTORS - 1, Math.floor((a / (Math.PI * 2)) * SECTORS));
            sectorDists[s].push(dist);
          });
          // Per sector: median distance = where that direction's wall sits. Pick the max.
          let bestSector = 0, bestMedian = -1;
          for (let s = 0; s < SECTORS; s++) {
            const arr = sectorDists[s];
            if (arr.length < 30) continue; // too few samples → unreliable
            const med = pct(arr, 0.5);
            if (med > bestMedian) { bestMedian = med; bestSector = s; }
          }
          // Local angle at the centre of the best sector → world look direction.
          const localAngle = ((bestSector + 0.5) / SECTORS) * Math.PI * 2;
          const dx = Math.cos(localAngle) * fit;        // world X (rotation.x=π leaves X)
          const dz = -Math.sin(localAngle) * fit;        // world Z (rotation.x=π negates Z)
          const entryYaw = Math.atan2(-dx, -dz);         // camera faces -Z at yaw 0
          entryYawMap.current.set(sr.room.id, entryYaw);

          void groundOffset;
          console.log(`[Splat] loaded "${sr.room.label}" size=(${sizeX.toFixed(1)},${sizeY.toFixed(1)},${sizeZ.toFixed(1)}) fit=${fit.toFixed(2)} eye=${eye.toFixed(2)} yaw=${entryYaw.toFixed(2)}`);
        },
      });
      splat.rotation.x = Math.PI;
      // Provisional transform until onLoad measures the real bounds.
      splat.scale.setScalar(meta.scale * SPLAT_SCALE);
      splat.position.set(sr.worldX, meta.groundY * SPLAT_SCALE, sr.worldZ);
      splat.visible = false;
      scene.add(splat);
      splatMap.current.set(sr.room.id, splat);

      // Fallback planes fill splat gaps (floor, ceiling, walls).
      const fb = makeFallbackPlanes(sr.worldX, sr.worldZ, sr.worldW, sr.worldD);
      fb.meshes.forEach((m) => scene.add(m));
      fallbackMap.current.set(sr.room.id, fb);
    }
  }, [jobs, sceneRooms, sceneGroupRef, scene]);

  const pendingRoomRef = useRef<string | null>(null);
  const pendingFramesRef = useRef(0);

  useFrame(({ camera }) => {
    const srs = sceneGroupRef.current?.sceneRooms;
    if (!srs?.length || splatMap.current.size === 0) return;

    // Floor (index 0) and ceiling (index 1) follow the camera in XZ for full underfoot coverage.
    const activeFb = fallbackMap.current.get(activeRoomIdRef.current ?? '');
    if (activeFb && activeFb.meshes.length >= 2) {
      activeFb.meshes[0].position.x = camera.position.x;
      activeFb.meshes[0].position.z = camera.position.z;
      activeFb.meshes[1].position.x = camera.position.x;
      activeFb.meshes[1].position.z = camera.position.z;
    }

    // Override eye height for the active room (splats are fit-scaled per room, so the
    // correct standing height differs). Runs after usePlayerMovement's height lock.
    const eye = eyeHeightMap.current.get(activeRoomIdRef.current ?? '');
    if (eye) camera.position.y = eye;

    // Apply the entry orientation once, here on the live render camera (so it isn't
    // clobbered by the controls or the debounced switch callback).
    if (pendingYawRef.current !== null) {
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      e.y = pendingYawRef.current; e.x = 0;
      camera.quaternion.setFromEuler(e);
      pendingYawRef.current = null;
    }

    // Find which room boundary contains the camera; fall back to closest centre
    let targetRoom: typeof srs[0] | null = null;
    for (const sr of srs) {
      if (
        Math.abs(camera.position.x - sr.worldX) < sr.worldW / 2 + 0.5 &&
        Math.abs(camera.position.z - sr.worldZ) < sr.worldD / 2 + 0.5
      ) { targetRoom = sr; break; }
    }
    if (!targetRoom) {
      let minDist = Infinity;
      for (const sr of srs) {
        const d = (camera.position.x - sr.worldX) ** 2 + (camera.position.z - sr.worldZ) ** 2;
        if (d < minDist) { minDist = d; targetRoom = sr; }
      }
    }
    if (!targetRoom || targetRoom.room.id === activeRoomIdRef.current) return;

    if (targetRoom.room.id === pendingRoomRef.current) {
      pendingFramesRef.current++;
      if (pendingFramesRef.current < 4) return;
    } else {
      pendingRoomRef.current = targetRoom.room.id;
      pendingFramesRef.current = 1;
      return;
    }

    pendingRoomRef.current = null;
    pendingFramesRef.current = 0;
    const newRoomId = targetRoom.room.id;
    console.log(`[Splat] entering "${targetRoom.room.label}"`);

    onRoomSwitch(() => {
      activeRoomIdRef.current = newRoomId;
      for (const sr of srs) {
        const isActive = sr.room.id === newRoomId;
        const splat = splatMap.current.get(sr.room.id);
        const fb = fallbackMap.current.get(sr.room.id);
        if (splat) splat.visible = isActive;
        if (fb) fb.meshes.forEach((m) => { m.visible = isActive; });
      }
      // Queue the entry orientation — applied next frame on the live camera (see useFrame).
      const yaw = entryYawMap.current.get(newRoomId);
      if (yaw !== undefined) pendingYawRef.current = yaw;
    });
  });

  return null;
}

export function WalkthroughViewer({ session }: { session: Session }) {
  const { jobs } = useSession();
  const [locked, setLocked] = useState(false);
  const [sceneRooms, setSceneRooms] = useState<SceneRoom[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const wallMeshesRef = useRef<THREE.Object3D[]>([]);
  const sceneGroupRef = useRef<(THREE.Group & { sceneRooms?: SceneRoom[] }) | null>(null);
  const sceneRoomsRef = useRef<SceneRoom[]>([]);
  const spawnRef = useRef(new THREE.Vector3(0, EYE_HEIGHT, 0));
  const touchInput = useRef<{ forward: number; right: number } | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  useEffect(() => {
    const onLockChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  }, []);

  const handleTeleport = useCallback((pos: THREE.Vector3) => {
    if (cameraRef.current) cameraRef.current.position.copy(pos);
  }, []);

  // Fade to black, execute scene switch, fade back in.
  const handleRoomSwitch = useCallback((doSwitch: () => void) => {
    setTransitioning(true);
    setTimeout(() => {
      doSwitch();
      setTimeout(() => setTransitioning(false), 250);
    }, 250);
  }, []);

  const handleTouchMovement = useCallback((fwd: number, right: number) => {
    touchInput.current = { forward: fwd, right: right };
  }, []);

  const handleTouchLook = useCallback((dx: number, dy: number) => {
    if (!cameraRef.current) return;
    const euler = new THREE.Euler().setFromQuaternion(cameraRef.current.quaternion, 'YXZ');
    euler.y -= dx;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x - dy));
    cameraRef.current.quaternion.setFromEuler(euler);
  }, []);

  if (session.rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No rooms to display — please complete the floor plan setup.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#d4c9bc' }}
        onCreated={({ camera, gl }) => {
          cameraRef.current = camera;
          gl.setClearColor('#d4c9bc'); // warm neutral — matches typical interior wall tone
          // Dev hook for automated testing — lets a headless driver read/move the camera.
          (window as unknown as { __cam?: THREE.Camera }).__cam = camera;
        }}
      >
        <Suspense fallback={null}>
          <SceneContent
            session={session}
            wallMeshesRef={wallMeshesRef}
            sceneGroupRef={sceneGroupRef}
            sceneRoomsRef={sceneRoomsRef}
            spawnRef={spawnRef}
            touchInput={touchInput}
            onSceneReady={setSceneRooms}
          />
          <SplatSceneRenderer sceneGroupRef={sceneGroupRef} sceneRooms={sceneRooms} onRoomSwitch={handleRoomSwitch} />
        </Suspense>
      </Canvas>
      {/* Photo cards + procedural furniture removed — the Gaussian splats already
          provide photorealistic furniture and surfaces for every room. */}

      {/* Room transition fade overlay */}
      <div
        className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-300"
        style={{ opacity: transitioning ? 1 : 0 }}
      />

      <OverheadMinimap
        sceneRooms={sceneRooms}
        cameraRef={cameraRef}
        onTeleport={handleTeleport}
      />

      {!TOUCH_SUPPORT && !locked && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer"
          onClick={() => {
            const canvas = document.querySelector('canvas');
            canvas?.requestPointerLock();
          }}
        >
          <div className="text-center text-white">
            <p className="text-2xl font-semibold mb-2">Click to navigate</p>
            <p className="text-gray-300 text-sm">WASD to move · Mouse to look · ESC to exit</p>
          </div>
        </div>
      )}

      {TOUCH_SUPPORT && (
        <TouchControls onMovement={handleTouchMovement} onLook={handleTouchLook} />
      )}

      <GenerationStatusHUD jobs={jobs} rooms={session.rooms} />
    </div>
  );
}
