import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import type { FurniturePrecise } from './types.js';

interface RawItem {
  roomLabel?: string;
  label?: string;
  x?: number;
  y?: number;
  rotation?: number;
  size?: string;
}

export interface FurniturePreciseWithRoom extends FurniturePrecise {
  roomLabel: string;
}

export class FloorPlanFurnitureService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async extractFurnitureLayout(floorPlanPath: string): Promise<FurniturePreciseWithRoom[]> {
    console.log(`[FloorFurniture] extracting layout from: ${floorPlanPath}`);
    const imageData = await fs.readFile(floorPlanPath);
    const base64 = imageData.toString('base64');
    const ext = path.extname(floorPlanPath).slice(1).toLowerCase();
    const mediaType: 'image/jpeg' | 'image/png' | 'image/webp' =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `This is an architectural floor plan. For each labeled room, identify up to 5 furniture or fixture items drawn in the plan.
For each item return:
- roomLabel: the room label exactly as written in the plan
- label: furniture type in English (e.g. "bed", "sofa", "dining table", "toilet", "sink", "wardrobe")
- x: horizontal center (0=left wall of room, 1=right wall of room)
- y: vertical center (0=top/north wall of room, 1=bottom/south wall of room)
- rotation: 0, 90, 180, or 270 (degrees clockwise)
- size: "small", "medium", or "large"

Reply ONLY with a JSON array, no prose:
[{"roomLabel":"Quarto","label":"bed","x":0.5,"y":0.6,"rotation":0,"size":"large"}]`,
          },
        ],
      }],
    });

    const text = message.content.find((b) => b.type === 'text')?.text ?? '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.warn('[FloorFurniture] no JSON array in response:', text.slice(0, 200));
      return [];
    }

    try {
      const raw = JSON.parse(match[0]) as RawItem[];
      const items = raw
        .filter((r) => r.roomLabel && r.label && typeof r.x === 'number' && typeof r.y === 'number')
        .map((r) => ({
          roomLabel: String(r.roomLabel),
          label: String(r.label),
          x: Math.max(0, Math.min(1, Number(r.x))),
          y: Math.max(0, Math.min(1, Number(r.y))),
          rotation: [0, 90, 180, 270].includes(Number(r.rotation)) ? Number(r.rotation) : 0,
          size: (['small', 'medium', 'large'] as const).includes(r.size as 'small') ? r.size as FurniturePrecise['size'] : 'medium',
        }));
      const byRoom = items.reduce<Record<string, number>>((acc, i) => {
        acc[i.roomLabel] = (acc[i.roomLabel] ?? 0) + 1;
        return acc;
      }, {});
      console.log(`[FloorFurniture] extracted ${items.length} item(s):`, byRoom);
      return items;
    } catch {
      console.error('[FloorFurniture] failed to parse JSON:', text);
      return [];
    }
  }
}
