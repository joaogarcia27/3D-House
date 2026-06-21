import * as THREE from 'three';
import type { Room } from '../types';

const WALL_HEIGHT = 2.7;
const WORLD_LONG_AXIS = 20;
const DOOR_WIDTH = 2.5; // generous openings — walls are invisible, so wide doorways make moving between rooms easy

// Splats are scaled by SPLAT_SCALE (see WalkthroughViewer). A real 1.6m eye height
// appears at world Y = 1.6 × SPLAT_SCALE (the per-room metric factor cancels out),
// so the camera must sit at this height to give correct human proportions.
export const SPLAT_SCALE = 1.5;
export const EYE_HEIGHT = 1.6 * SPLAT_SCALE;

export interface SceneRoom {
  room: Room;
  worldX: number;
  worldZ: number;
  worldW: number;
  worldD: number;
  group: THREE.Group;
}

function computeScale(rooms: Room[], floorPlanAspect: number): number {
  if (floorPlanAspect >= 1) {
    return WORLD_LONG_AXIS;
  }
  return WORLD_LONG_AXIS * floorPlanAspect;
}

function toWorld(norm: number, scale: number): number {
  return norm * scale;
}

function buildWallSegment(
  length: number,
  height: number,
  thickness = 0.1
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(length, height, thickness);
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const mesh = new THREE.Mesh(geo, mat);
  // Invisible: removed from rendering entirely. Raycasting still works because
  // Three.js Raycaster.intersectObjects() does not check the visible flag.
  mesh.visible = false;
  return mesh;
}

function buildWallWithDoors(
  wallLength: number,
  doors: Array<{ wallPosition: number }>,
  height: number
): THREE.Group {
  const group = new THREE.Group();
  if (!doors?.length) {
    const seg = buildWallSegment(wallLength, height);
    group.add(seg);
    return group;
  }

  const sorted = [...(doors ?? [])].sort((a, b) => a.wallPosition - b.wallPosition);
  let cursor = 0;
  for (const door of sorted) {
    const gapStart = door.wallPosition * wallLength - DOOR_WIDTH / 2;
    const gapEnd = gapStart + DOOR_WIDTH;

    if (gapStart > cursor) {
      const seg = buildWallSegment(gapStart - cursor, height);
      seg.position.x = cursor + (gapStart - cursor) / 2 - wallLength / 2;
      group.add(seg);
    }
    cursor = gapEnd;
  }
  if (cursor < wallLength) {
    const seg = buildWallSegment(wallLength - cursor, height);
    seg.position.x = cursor + (wallLength - cursor) / 2 - wallLength / 2;
    group.add(seg);
  }
  return group;
}

function isWallCoveredByAdjacentRoom(
  room: Room,
  wallSide: 'north' | 'south' | 'east' | 'west',
  allRooms: Room[]
): boolean {
  if (!room.geometry) return false;
  const rx = room.geometry;
  const myIdx = allRooms.findIndex((r) => r.id === room.id);
  const TOL = 0.04;

  for (let i = 0; i < myIdx; i++) {
    const other = allRooms[i];
    if (!other.geometry) continue;
    const ox = other.geometry;
    let shared = false;
    if (wallSide === 'north' && Math.abs((ox.y + ox.height) - rx.y) < TOL)
      shared = Math.min(rx.x + rx.width, ox.x + ox.width) > Math.max(rx.x, ox.x);
    else if (wallSide === 'south' && Math.abs(ox.y - (rx.y + rx.height)) < TOL)
      shared = Math.min(rx.x + rx.width, ox.x + ox.width) > Math.max(rx.x, ox.x);
    else if (wallSide === 'west' && Math.abs((ox.x + ox.width) - rx.x) < TOL)
      shared = Math.min(rx.y + rx.height, ox.y + ox.height) > Math.max(rx.y, ox.y);
    else if (wallSide === 'east' && Math.abs(ox.x - (rx.x + rx.width)) < TOL)
      shared = Math.min(rx.y + rx.height, ox.y + ox.height) > Math.max(rx.y, ox.y);
    if (shared) return true;
  }
  return false;
}

function doorsOnWall(
  room: Room,
  wallSide: 'north' | 'south' | 'east' | 'west',
  allRooms: Room[]
): Array<{ wallPosition: number }> {
  if (!room.geometry) return [];
  const rx = room.geometry;

  const explicit = (room.doors ?? []).filter((d) => {
    const other = allRooms.find((r) => r.id === d.connectingRoomId || r.label === d.connectingRoomId);
    if (!other || !other.geometry) return false;
    const ox = other.geometry;
    if (wallSide === 'north') return ox.y + ox.height <= rx.y + 0.01;
    if (wallSide === 'south') return ox.y >= rx.y + rx.height - 0.01;
    if (wallSide === 'west') return ox.x + ox.width <= rx.x + 0.01;
    if (wallSide === 'east') return ox.x >= rx.x + rx.width - 0.01;
    return false;
  });
  if (explicit.length > 0) return explicit;

  // Fallback: place a door at the centre of EVERY shared boundary segment on this wall.
  // A single wall can border multiple rooms (e.g. Sala's east wall meets Quarto + I.S.),
  // so collect all of them rather than returning on the first match.
  const TOL = 0.04;
  const doors: Array<{ wallPosition: number }> = [];
  for (const other of allRooms) {
    if (other.id === room.id || !other.geometry) continue;
    const ox = other.geometry;
    let wallPos: number | null = null;

    if (wallSide === 'north' && Math.abs((ox.y + ox.height) - rx.y) < TOL) {
      const lo = Math.max(rx.x, ox.x), hi = Math.min(rx.x + rx.width, ox.x + ox.width);
      if (hi > lo) wallPos = ((lo + hi) / 2 - rx.x) / rx.width;
    } else if (wallSide === 'south' && Math.abs(ox.y - (rx.y + rx.height)) < TOL) {
      const lo = Math.max(rx.x, ox.x), hi = Math.min(rx.x + rx.width, ox.x + ox.width);
      if (hi > lo) wallPos = ((lo + hi) / 2 - rx.x) / rx.width;
    } else if (wallSide === 'west' && Math.abs((ox.x + ox.width) - rx.x) < TOL) {
      const lo = Math.max(rx.y, ox.y), hi = Math.min(rx.y + rx.height, ox.y + ox.height);
      if (hi > lo) wallPos = ((lo + hi) / 2 - rx.y) / rx.height;
    } else if (wallSide === 'east' && Math.abs(ox.x - (rx.x + rx.width)) < TOL) {
      const lo = Math.max(rx.y, ox.y), hi = Math.min(rx.y + rx.height, ox.y + ox.height);
      if (hi > lo) wallPos = ((lo + hi) / 2 - rx.y) / rx.height;
    }

    if (wallPos !== null) doors.push({ wallPosition: wallPos });
  }

  return doors;
}

export function buildScene(rooms: Room[], floorPlanAspect: number): THREE.Group & { sceneRooms: SceneRoom[] } {
  const scale = computeScale(rooms, floorPlanAspect);
  console.log(`[Scene] buildScene — rooms=${rooms.length} aspect=${floorPlanAspect.toFixed(3)} scale=${scale.toFixed(2)}`);
  const group = new THREE.Group() as THREE.Group & { sceneRooms: SceneRoom[] };
  group.sceneRooms = [];

  for (const room of rooms) {
    if (!room.geometry) continue;
    const { x, y, width, height } = room.geometry;

    const wx = toWorld(x + width / 2, scale) - WORLD_LONG_AXIS / 2;
    const wz = toWorld(y + height / 2, scale * (1 / floorPlanAspect)) - (WORLD_LONG_AXIS / floorPlanAspect) / 2;
    const ww = toWorld(width, scale);
    const wd = toWorld(height, scale * (1 / floorPlanAspect));

    const roomGroup = new THREE.Group();
    roomGroup.userData.roomId = room.id;
    roomGroup.position.set(wx, 0, wz);

    // Floor — invisible, removed from rendering pipeline entirely
    const floorGeo = new THREE.PlaneGeometry(ww, wd);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial());
    floor.visible = false;
    floor.rotation.x = -Math.PI / 2;
    floor.userData.roomId = room.id;
    floor.userData.isFloor = true;
    roomGroup.add(floor);

    // Ceiling — invisible
    const ceilGeo = new THREE.PlaneGeometry(ww, wd);
    const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshBasicMaterial());
    ceil.visible = false;
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_HEIGHT;
    ceil.userData.roomId = room.id;
    ceil.userData.isCeiling = true;
    roomGroup.add(ceil);

    // Walls
    const wallSides: Array<{ side: 'north' | 'south' | 'east' | 'west'; length: number; x: number; z: number; ry: number }> = [
      { side: 'north', length: ww, x: 0, z: -wd / 2, ry: 0 },
      { side: 'south', length: ww, x: 0, z: wd / 2, ry: Math.PI },
      { side: 'west', length: wd, x: -ww / 2, z: 0, ry: Math.PI / 2 },
      { side: 'east', length: wd, x: ww / 2, z: 0, ry: -Math.PI / 2 },
    ];

    for (const { side, length, x: wx2, z: wz2, ry } of wallSides) {
      if (isWallCoveredByAdjacentRoom(room, side, rooms)) {
        console.log(`[Scene] wall skipped (covered) — room="${room.label}" side=${side}`);
        continue;
      }
      const doors = doorsOnWall(room, side, rooms);
      if (doors.length) console.log(`[Scene] doors on wall — room="${room.label}" side=${side} positions=${doors.map((d) => d.wallPosition.toFixed(2)).join(',')}`);
      const wallGroup = buildWallWithDoors(length, doors, WALL_HEIGHT);
      wallGroup.position.set(wx2, WALL_HEIGHT / 2, wz2);
      wallGroup.rotation.y = ry;
      wallGroup.userData.isWall = true;
      wallGroup.userData.roomId = room.id;
      roomGroup.add(wallGroup);
    }

    group.add(roomGroup);
    group.sceneRooms.push({ room, worldX: wx, worldZ: wz, worldW: ww, worldD: wd, group: roomGroup });
  }

  return group;
}

export function computeSpawnPoint(sceneRooms: SceneRoom[]): THREE.Vector3 {
  if (sceneRooms.length === 0) return new THREE.Vector3(0, EYE_HEIGHT, 0);
  const largest = sceneRooms.reduce((a, b) => a.worldW * a.worldD > b.worldW * b.worldD ? a : b);
  return new THREE.Vector3(largest.worldX, EYE_HEIGHT, largest.worldZ);
}

function placePhotoCard(
  roomGroup: THREE.Group,
  colorTex: THREE.Texture,
  roomW: number,
  roomD: number,
): void {
  const imgW = (colorTex.image as HTMLImageElement).naturalWidth || 1;
  const imgH = (colorTex.image as HTMLImageElement).naturalHeight || 1;
  const aspect = imgW / imgH;
  const cardW = Math.min(roomW * 0.98, WALL_HEIGHT * aspect);
  const cardH = Math.min(cardW / aspect, WALL_HEIGHT * 0.98);

  const geo = new THREE.PlaneGeometry(cardW, cardH);
  const mat = new THREE.MeshBasicMaterial({ map: colorTex, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, cardH / 2 + 0.01, -roomD / 2 + 0.02);
  mesh.userData.isDepthCard = true;
  roomGroup.add(mesh);
}

export function applyDepthCard(
  roomGroup: THREE.Group,
  photoUrl: string,
  depthUrl: string | null,
  roomW: number,
  roomD: number,
): void {
  console.log(`[Scene] applyDepthCard — photo=${photoUrl} depth=${depthUrl ?? '(none)'} room=${roomW.toFixed(2)}x${roomD.toFixed(2)}`);
  const loader = new THREE.TextureLoader();
  loader.load(
    photoUrl,
    (colorTex) => {
      console.log(`[Scene] photo texture loaded — ${photoUrl}`);
      placePhotoCard(roomGroup, colorTex, roomW, roomD);
    },
    undefined,
    (err) => console.error(`[Scene] photo texture failed to load (${photoUrl}):`, err)
  );
}

export function applyRoomPanorama(
  roomGroup: THREE.Group,
  panoramaUrl: string,
  roomW: number,
  roomD: number,
): void {
  console.log(`[Scene] applyRoomPanorama — ${panoramaUrl}`);
  const loader = new THREE.TextureLoader();
  loader.load(
    panoramaUrl,
    (texture) => {
      console.log(`[Scene] panorama texture loaded — ${panoramaUrl}`);
      // Remove all room geometry (walls, floor, ceiling, photo card).
      // Keep furniture (userData.isFurniture) so it renders in front of panorama.
      const toRemove: THREE.Object3D[] = [];
      roomGroup.children.forEach((child) => {
        if (!child.userData.isFurniture && !child.userData.isPanorama) {
          toRemove.push(child);
        }
      });
      toRemove.forEach((c) => roomGroup.remove(c));

      // Large sphere viewed from inside — equirectangular panorama fills the view.
      // No depth tricks needed since walls/ceiling/floor are gone.
      const radius = Math.max(roomW, roomD) * 0.9;
      const geo = new THREE.SphereGeometry(radius, 64, 32);
      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.y = WALL_HEIGHT / 2;
      sphere.userData.isPanorama = true;
      roomGroup.add(sphere);
    },
    undefined,
    (err) => console.error(`[Scene] panorama texture failed to load (${panoramaUrl}):`, err)
  );
}

export function applyRoomTexture(roomGroup: THREE.Group, photoUrl: string): void {
  const loader = new THREE.TextureLoader();
  loader.load(photoUrl, (texture) => {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    // Apply photo only to walls (not floor or ceiling)
    const wallMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    roomGroup.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        !child.userData.isFloor &&
        !child.userData.isCeiling
      ) {
        child.material = wallMat;
      }
    });
  });
}

export function swapRoomAsset(
  sceneGroup: THREE.Group & { sceneRooms?: SceneRoom[] },
  roomId: string,
  assetObject: THREE.Object3D
): void {
  const sr = sceneGroup.sceneRooms?.find((r) => r.room.id === roomId);
  if (!sr) return;

  const toRemove: THREE.Object3D[] = [];
  sr.group.traverse((child) => {
    if (child !== sr.group) toRemove.push(child);
  });
  toRemove.forEach((c) => sr.group.remove(c));

  assetObject.userData.roomId = roomId;
  sr.group.add(assetObject);
}
