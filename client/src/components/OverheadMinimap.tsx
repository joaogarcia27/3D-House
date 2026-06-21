import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { SceneRoom } from '../scene/buildScene';

interface Props {
  sceneRooms: SceneRoom[];
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  onTeleport: (pos: THREE.Vector3) => void;
}

export function OverheadMinimap({ sceneRooms, cameraRef, onTeleport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || sceneRooms.length === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
      ctx.fillRect(0, 0, W, H);

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const sr of sceneRooms) {
        minX = Math.min(minX, sr.worldX - sr.worldW / 2);
        maxX = Math.max(maxX, sr.worldX + sr.worldW / 2);
        minZ = Math.min(minZ, sr.worldZ - sr.worldD / 2);
        maxZ = Math.max(maxZ, sr.worldZ + sr.worldD / 2);
      }

      const pad = 8;
      const sc = Math.min(
        (W - pad * 2) / (maxX - minX || 1),
        (H - pad * 2) / (maxZ - minZ || 1)
      );

      const toCanvas = (wx: number, wz: number) => ({
        x: pad + (wx - minX) * sc,
        y: pad + (wz - minZ) * sc,
      });

      ctx.strokeStyle = 'rgba(139,92,246,0.6)';
      ctx.lineWidth = 1;
      for (const sr of sceneRooms) {
        const tl = toCanvas(sr.worldX - sr.worldW / 2, sr.worldZ - sr.worldD / 2);
        ctx.fillStyle = 'rgba(139,92,246,0.12)';
        ctx.fillRect(tl.x, tl.y, sr.worldW * sc, sr.worldD * sc);
        ctx.strokeRect(tl.x, tl.y, sr.worldW * sc, sr.worldD * sc);
        ctx.fillStyle = 'rgba(200,200,200,0.7)';
        ctx.font = '9px sans-serif';
        ctx.fillText(sr.room.label, tl.x + 3, tl.y + 11);
      }

      if (camera) {
        const pp = toCanvas(camera.position.x, camera.position.z);
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 4, 0, Math.PI * 2);
        ctx.fill();

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const angle = Math.atan2(dir.x, dir.z);
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pp.x, pp.y);
        ctx.lineTo(pp.x + Math.sin(angle) * 10, pp.y + Math.cos(angle) * 10);
        ctx.stroke();
      }
    };

    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sceneRooms, cameraRef]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || sceneRooms.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const sr of sceneRooms) {
      minX = Math.min(minX, sr.worldX - sr.worldW / 2);
      maxX = Math.max(maxX, sr.worldX + sr.worldW / 2);
      minZ = Math.min(minZ, sr.worldZ - sr.worldD / 2);
      maxZ = Math.max(maxZ, sr.worldZ + sr.worldD / 2);
    }
    const pad = 8;
    const sc = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxZ - minZ || 1));
    const wx = (cx - pad) / sc + minX;
    const wz = (cy - pad) / sc + minZ;

    const hit = sceneRooms.find(
      (sr) =>
        wx >= sr.worldX - sr.worldW / 2 &&
        wx <= sr.worldX + sr.worldW / 2 &&
        wz >= sr.worldZ - sr.worldD / 2 &&
        wz <= sr.worldZ + sr.worldD / 2
    );
    if (hit) onTeleport(new THREE.Vector3(hit.worldX, 1.7, hit.worldZ));
  };

  if (sceneRooms.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className="absolute top-4 right-4 rounded-lg border border-gray-700 cursor-pointer z-10"
      style={{ imageRendering: 'pixelated' }}
      onClick={handleClick}
    />
  );
}
