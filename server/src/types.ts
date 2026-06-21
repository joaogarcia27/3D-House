export interface RoomGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoorInfo {
  connectingRoomId: string;
  wallPosition: number;
}

export interface WindowInfo {
  wallSide: 'north' | 'south' | 'east' | 'west';
  wallPosition: number;
}

export interface Photo {
  id: string;
  roomId: string;
  filename: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface Room {
  id: string;
  label: string;
  geometry: RoomGeometry | null;
  confidence: number;
  widthM: number | null;
  heightM: number | null;
  doors: DoorInfo[];
  windows: WindowInfo[];
  photos: Photo[];
  primaryPhotoId: string | null;
}

export type ParseStatus = 'pending' | 'processing' | 'done' | 'parse_failed';

export interface FloorPlanData {
  imageFilename: string;
  imageUrl: string;
  parseStatus: ParseStatus;
  reviewRequired: boolean;
  dimensionsEstimated: boolean;
  error?: string;
}

export type JobStatus =
  | 'queued'
  | 'analysing'
  | 'done'
  | 'failed';

export interface FurnitureItem {
  label: string;
  position: 'front-left' | 'front-center' | 'front-right' | 'back-left' | 'back-center' | 'back-right' | 'center';
  size: 'small' | 'medium' | 'large';
}

export interface FurniturePrecise {
  label: string;
  x: number;        // 0=left wall of room, 1=right wall
  y: number;        // 0=top/north wall, 1=bottom/south wall
  rotation: number; // degrees (0, 90, 180, 270)
  size: 'small' | 'medium' | 'large';
}

export interface GenerationJob {
  id: string;
  sessionId: string;
  roomId: string;
  primaryPhotoUrl: string;
  status: JobStatus;
  furniture?: FurnitureItem[];
  floorPlanFurniture?: FurniturePrecise[];
  depthMapUrl?: string;
  panoramaUrl?: string;
  splatUrl?: string;
  mock?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  createdAt: string;
  floorPlan: FloorPlanData | null;
  rooms: Room[];
  jobs: GenerationJob[];
}
