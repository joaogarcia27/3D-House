import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import type { FurnitureItem } from './types.js';

export class RoomEnvironmentService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async analyzeRoomObjects(photoPath: string): Promise<FurnitureItem[]> {
    console.log(`[RoomEnv] analyzing photo: ${photoPath}`);
    const imageData = await fs.readFile(photoPath);
    const base64 = imageData.toString('base64');
    const ext = path.extname(photoPath).slice(1).toLowerCase();
    const mediaType: 'image/jpeg' | 'image/png' | 'image/webp' =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: 'List up to 6 main furniture or fixture items visible in this room. For each item return: label (short noun like "sofa", "dining table", "bed"), its approximate horizontal position (front-left, front-center, front-right, back-left, back-center, back-right, or center), and size (small, medium, large). Reply ONLY with a JSON array, no prose:\n[{"label":"sofa","position":"back-center","size":"large"}]',
          },
        ],
      }],
    });

    const text = message.content.find((b) => b.type === 'text')?.text ?? '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.warn('[RoomEnv] no JSON array in response:', text.slice(0, 200));
      return [];
    }

    try {
      const items = JSON.parse(match[0]) as FurnitureItem[];
      console.log(`[RoomEnv] detected ${items.length} item(s): ${items.map((i) => i.label).join(', ')}`);
      return items;
    } catch {
      console.error('[RoomEnv] failed to parse furniture JSON:', text);
      return [];
    }
  }
}
