import * as THREE from 'three';
import type { FurnitureItem, FurniturePrecise } from '../types';

function std(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addBox(
  g: THREE.Group,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material,
): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.isFurniture = true;
  g.add(m);
}

function addCyl(
  g: THREE.Group,
  r: number, h: number,
  x: number, y: number, z: number,
  mat: THREE.Material,
): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.userData.isFurniture = true;
  g.add(m);
}

interface Built { group: THREE.Group; w: number; d: number }

// Origin at floor-center; sofa back hugs -Z, faces +Z
function buildSofa(): Built {
  const W = 2.0, D = 0.9;
  const g = new THREE.Group();
  const fabric = std(0x8c7a6a, 0.9);
  const wood = std(0x5a3e2b, 0.6);
  addBox(g, W,       0.4,  D,    0,            0.2,           0,              fabric);
  addBox(g, W,       0.55, 0.14, 0,            0.675,        -D / 2 + 0.07,  fabric);
  addBox(g, 0.14,    0.45, D,   -W / 2 + 0.07, 0.225,         0,             fabric);
  addBox(g, 0.14,    0.45, D,    W / 2 - 0.07, 0.225,         0,             fabric);
  for (const [lx, lz] of [
    [-W / 2 + 0.15,  D / 2 - 0.1],
    [ W / 2 - 0.15,  D / 2 - 0.1],
    [-W / 2 + 0.15, -D / 2 + 0.1],
    [ W / 2 - 0.15, -D / 2 + 0.1],
  ] as [number, number][]) {
    addCyl(g, 0.04, 0.1, lx, 0.05, lz, wood);
  }
  return { group: g, w: W, d: D };
}

// Headboard at -Z (head end against back wall)
function buildBed(): Built {
  const W = 1.5, D = 2.0;
  const g = new THREE.Group();
  const frame    = std(0x5a3e2b, 0.7);
  const mattress = std(0xf0ece0, 0.9);
  const pillow   = std(0xffffff, 0.95);
  addBox(g, W,       0.3,  D,      0,      0.15,         0,             frame);
  addBox(g, W - 0.1, 0.22, D - 0.1, 0,    0.41,         0.05,          mattress);
  addBox(g, W,       0.7,  0.08,   0,      0.65,        -D / 2 + 0.04,  frame);
  addBox(g, 0.5,     0.1,  0.35,  -0.38,  0.57,        -D / 2 + 0.2,   pillow);
  addBox(g, 0.5,     0.1,  0.35,   0.38,  0.57,        -D / 2 + 0.2,   pillow);
  return { group: g, w: W, d: D };
}

function buildDiningTable(): Built {
  const W = 1.4, D = 0.8;
  const g = new THREE.Group();
  const wood = std(0x9b7452, 0.6);
  addBox(g, W, 0.05, D, 0, 0.75, 0, wood);
  for (const [lx, lz] of [
    [-W / 2 + 0.07,  D / 2 - 0.07],
    [ W / 2 - 0.07,  D / 2 - 0.07],
    [-W / 2 + 0.07, -D / 2 + 0.07],
    [ W / 2 - 0.07, -D / 2 + 0.07],
  ] as [number, number][]) {
    addCyl(g, 0.04, 0.73, lx, 0.365, lz, wood);
  }
  return { group: g, w: W, d: D };
}

function buildChair(): Built {
  const W = 0.45, D = 0.45;
  const g = new THREE.Group();
  const wood = std(0x9b7452, 0.6);
  addBox(g, W, 0.04, D, 0, 0.45, 0, wood);
  addBox(g, W, 0.4, 0.04, 0, 0.65, -D / 2 + 0.02, wood);
  for (const [lx, lz] of [
    [-W / 2 + 0.05,  D / 2 - 0.05],
    [ W / 2 - 0.05,  D / 2 - 0.05],
    [-W / 2 + 0.05, -D / 2 + 0.05],
    [ W / 2 - 0.05, -D / 2 + 0.05],
  ] as [number, number][]) {
    addCyl(g, 0.025, 0.45, lx, 0.225, lz, wood);
  }
  return { group: g, w: W, d: D };
}

// Wardrobe body back faces -Z
function buildWardrobe(): Built {
  const W = 1.8, H = 2.0, D = 0.55;
  const g = new THREE.Group();
  const body   = std(0xd4c5a9, 0.7);
  const handle = std(0xc0a040, 0.3, 0.7);
  addBox(g, W, H, D, 0, H / 2, 0, body);
  addBox(g, 0.03, H * 0.9, 0.03, 0, H * 0.45 + 0.05, D / 2, body);
  addBox(g, 0.04, 0.12, 0.04, -0.15, H * 0.5, D / 2 + 0.02, handle);
  addBox(g, 0.04, 0.12, 0.04,  0.15, H * 0.5, D / 2 + 0.02, handle);
  return { group: g, w: W, d: D };
}

function buildTV(): Built {
  const W = 1.2, D = 0.06;
  const g = new THREE.Group();
  addBox(g, W, 0.7, D, 0, 0.47, 0, std(0x111111, 0.05, 0.5));
  addBox(g, 0.25, 0.12, 0.25, 0, 0.06, 0, std(0x333333, 0.4, 0.8));
  addBox(g, 0.04, 0.12, 0.04, 0, 0.12, 0, std(0x333333, 0.4, 0.8));
  return { group: g, w: W, d: D };
}

function buildNightstand(): Built {
  const W = 0.5, H = 0.55, D = 0.4;
  const g = new THREE.Group();
  const wood = std(0x9e8e7e, 0.7);
  addBox(g, W,        H,    D,      0, H / 2,    0, wood);
  addBox(g, W - 0.02, 0.02, D - 0.02, 0, H + 0.01, 0, wood);
  return { group: g, w: W, d: D };
}

function buildCoffeeTable(): Built {
  const W = 1.1, D = 0.55;
  const g = new THREE.Group();
  const wood = std(0x7a6040, 0.6);
  addBox(g, W, 0.04, D, 0, 0.4, 0, wood);
  for (const [lx, lz] of [
    [-W / 2 + 0.07,  D / 2 - 0.07],
    [ W / 2 - 0.07,  D / 2 - 0.07],
    [-W / 2 + 0.07, -D / 2 + 0.07],
    [ W / 2 - 0.07, -D / 2 + 0.07],
  ] as [number, number][]) {
    addCyl(g, 0.03, 0.4, lx, 0.2, lz, wood);
  }
  return { group: g, w: W, d: D };
}

function buildToilet(): Built {
  const g = new THREE.Group();
  const p = std(0xf0f0ea, 0.2);
  addBox(g, 0.4, 0.4, 0.6, 0, 0.2, 0, p);
  addBox(g, 0.35, 0.12, 0.5, 0, 0.46, -0.05, p);
  addBox(g, 0.35, 0.3, 0.18, 0, 0.52, -0.34, p);
  return { group: g, w: 0.4, d: 0.6 };
}

function buildSink(): Built {
  const g = new THREE.Group();
  const p      = std(0xf0f0ea, 0.2);
  const chrome = std(0xd0d8e0, 0.1, 0.9);
  addBox(g, 0.55, 0.18, 0.45, 0, 0.84, 0, p);
  addCyl(g, 0.05, 0.84, 0, 0.42, 0, p);
  addCyl(g, 0.015, 0.15, 0, 1.005, 0, chrome);
  addBox(g, 0.08, 0.015, 0.015, 0, 1.0, 0.04, chrome);
  return { group: g, w: 0.55, d: 0.45 };
}

function buildByLabel(label: string): Built {
  const k = label.toLowerCase();
  if (k.includes('sofa') || k.includes('couch'))             return buildSofa();
  if (k.includes('bed'))                                     return buildBed();
  if (k.includes('coffee table'))                            return buildCoffeeTable();
  if (k.includes('table') && !k.includes('night'))           return buildDiningTable();
  if (k.includes('chair'))                                   return buildChair();
  if (k.includes('wardrobe') || k.includes('closet') || k.includes('armoire')) return buildWardrobe();
  if (k.includes('tv') || k.includes('television'))         return buildTV();
  if (k.includes('nightstand') || k.includes('bedside'))    return buildNightstand();
  if (k.includes('toilet'))                                  return buildToilet();
  if (k.includes('sink'))                                    return buildSink();
  const g = new THREE.Group();
  addBox(g, 0.6, 0.7, 0.6, 0, 0.35, 0, std(0xaa9988, 0.8));
  return { group: g, w: 0.6, d: 0.6 };
}

function place(
  built: Built,
  position: FurnitureItem['position'],
  roomW: number,
  roomD: number,
  xJitter = 0,
): void {
  const colDir = position.includes('left') ? -1 : position.includes('right') ? 1 : 0;
  const rowDir = position.startsWith('back') ? -1 : position.startsWith('front') ? 1 : 0;

  let pz: number, ry: number;
  if (rowDir === -1)      { pz = -roomD / 2 + built.d / 2 + 0.05; ry = 0; }
  else if (rowDir === 1)  { pz =  roomD / 2 - built.d / 2 - 0.05; ry = Math.PI; }
  else                    { pz = 0; ry = 0; }

  const px =
    colDir === -1 ? -roomW / 2 + built.w / 2 + 0.05 :
    colDir ===  1 ?  roomW / 2 - built.w / 2 - 0.05 :
    xJitter;

  built.group.position.set(px, 0, pz);
  built.group.rotation.y = ry;
}

const ROOM_DEFAULTS: Array<{ keywords: string[]; items: FurnitureItem[] }> = [
  {
    keywords: ['sala', 'living', 'lounge', 'sitting', 'family'],
    items: [
      { label: 'sofa',         position: 'back-center',  size: 'large' },
      { label: 'coffee table', position: 'center',       size: 'medium' },
      { label: 'tv',           position: 'front-center', size: 'large' },
    ],
  },
  {
    keywords: ['quarto', 'bedroom', 'suite', 'dormitório', 'dormitorio', 'master', 'suíte'],
    items: [
      { label: 'bed',        position: 'back-center', size: 'large' },
      { label: 'wardrobe',   position: 'back-left',   size: 'large' },
      { label: 'nightstand', position: 'back-right',  size: 'small' },
    ],
  },
  {
    keywords: ['cozinha', 'kitchen', 'copa', 'jantar', 'dining'],
    items: [
      { label: 'dining table', position: 'center',       size: 'medium' },
      { label: 'chair',        position: 'front-center', size: 'small' },
    ],
  },
  {
    keywords: ['banheiro', 'bathroom', 'wc', 'i.s.', 'toilet', 'lavabo', 'banho'],
    items: [
      { label: 'toilet', position: 'back-right', size: 'medium' },
      { label: 'sink',   position: 'back-left',  size: 'medium' },
    ],
  },
];

export function getDefaultFurnitureForRoom(roomLabel: string): FurnitureItem[] {
  const lower = roomLabel.toLowerCase();
  for (const { keywords, items } of ROOM_DEFAULTS) {
    if (keywords.some((k) => lower.includes(k))) return items;
  }
  return [];
}

export function buildAndPlaceFurniture(
  item: FurnitureItem,
  roomW: number,
  roomD: number,
  index = 0,
): THREE.Group {
  const built = buildByLabel(item.label);
  const s = item.size === 'large' ? 1.15 : item.size === 'small' ? 0.75 : 1.0;
  built.group.scale.setScalar(s);
  built.w *= s;
  built.d *= s;

  // Shrink to fit if larger than room
  const fitS = Math.min(1, (roomW - 0.2) / built.w, (roomD - 0.2) / built.d);
  if (fitS < 1) {
    built.group.scale.multiplyScalar(fitS);
    built.w *= fitS;
    built.d *= fitS;
  }

  place(built, item.position, roomW, roomD, (index % 3) * 0.35);
  return built.group;
}

export function buildAndPlaceFurniturePrecise(
  item: FurniturePrecise,
  roomW: number,
  roomD: number,
): THREE.Group {
  const built = buildByLabel(item.label);
  const s = item.size === 'large' ? 1.15 : item.size === 'small' ? 0.75 : 1.0;
  built.group.scale.setScalar(s);
  built.w *= s;
  built.d *= s;

  const fitS = Math.min(1, (roomW - 0.2) / built.w, (roomD - 0.2) / built.d);
  if (fitS < 1) {
    built.group.scale.multiplyScalar(fitS);
    built.w *= fitS;
    built.d *= fitS;
  }

  // Map x,y (0-1 in room bounds) to world space
  // x: 0=left(-roomW/2) 1=right(+roomW/2), y: 0=north(-roomD/2) 1=south(+roomD/2)
  built.group.position.set(
    (item.x - 0.5) * roomW,
    0,
    (item.y - 0.5) * roomD,
  );
  built.group.rotation.y = -(item.rotation * Math.PI) / 180;
  return built.group;
}
