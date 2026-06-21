import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Room, DoorInfo, WindowInfo } from './types.js';

export interface ParseResult {
  rooms: Room[];
  reviewRequired: boolean;
  dimensionsEstimated: boolean;
}

interface RawRoom {
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
  widthText?: string;
  heightText?: string;
  doors?: Array<{ connectingRoom: string; wallPosition: number }>;
  windows?: Array<{ wallSide: string; wallPosition: number }>;
}

function parseMeters(text: string): number | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  const num = parseFloat(t.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return null;
  if (t.includes('mm')) return num / 1000;
  if (t.includes('cm')) return num / 100;
  if (t.includes('ft') || t.includes("'")) return num * 0.3048;
  if (t.includes('in') || t.includes('"')) return num * 0.0254;
  return num;
}

const SYSTEM_PROMPT = `You are an architectural floor plan analyzer. Extract structured room data from the provided floor plan image. Return JSON only — no explanations.`;

const USER_PROMPT = `Analyze this architectural floor plan image and return a JSON object with this exact structure:

{
  "rooms": [
    {
      "label": "Room name as shown on plan",
      "bounds": {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0
      },
      "confidence": 0.9,
      "widthText": "3.5m",
      "heightText": "4m",
      "doors": [
        { "connectingRoom": "Hallway", "wallPosition": 0.5 }
      ],
      "windows": [
        { "wallSide": "north", "wallPosition": 0.3 }
      ]
    }
  ]
}

Rules:
- bounds: normalized 0-1 coordinates relative to image dimensions (origin = top-left)
- confidence: 0-1 score for how confident you are in this room's detection
- widthText / heightText: literal text found on plan near this room (e.g. "3500", "14 ft"); omit if absent
- doors: list connecting rooms and approximate position (0=start of wall, 1=end) where door appears
- windows: wallSide is "north"/"south"/"east"/"west" relative to image orientation; wallPosition is 0-1
- Include ALL labeled spaces: bedrooms, bathrooms, kitchen, hallways, closets, garage, etc.
- Return only valid JSON`;

export class FloorPlanParserService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async parse(imagePath: string): Promise<ParseResult> {
    console.log(`[FloorPlan] parsing image: ${imagePath}`);
    const imageData = await fs.readFile(imagePath);
    const base64 = imageData.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    console.log(`[FloorPlan] sending to Claude — mediaType=${mediaType} size=${(imageData.length / 1024).toFixed(1)}KB`);

    const message = await this.client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    });

    const text = message.content.find((b) => b.type === 'text')?.text ?? '';
    console.log(`[FloorPlan] Claude raw response length=${text.length}`);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[FloorPlan] no JSON found in response:', text.slice(0, 300));
      throw new Error('No JSON in Claude response');
    }

    const raw = JSON.parse(jsonMatch[0]) as { rooms: RawRoom[] };
    const rawRooms = raw.rooms ?? [];
    console.log(`[FloorPlan] parsed ${rawRooms.length} room(s): ${rawRooms.map((r) => r.label).join(', ')}`);

    let dimensionsEstimated = true;
    const rooms: Room[] = rawRooms.map((r): Room => {
      const widthM = r.widthText ? parseMeters(r.widthText) : null;
      const heightM = r.heightText ? parseMeters(r.heightText) : null;
      if (widthM !== null || heightM !== null) dimensionsEstimated = false;

      const doors: DoorInfo[] = (r.doors ?? []).map((d) => ({
        connectingRoomId: d.connectingRoom,
        wallPosition: d.wallPosition,
      }));

      const windows: WindowInfo[] = (r.windows ?? []).map((w) => ({
        wallSide: w.wallSide as WindowInfo['wallSide'],
        wallPosition: w.wallPosition,
      }));

      return {
        id: uuidv4(),
        label: r.label,
        geometry: r.bounds,
        confidence: r.confidence,
        widthM,
        heightM,
        doors,
        windows,
        photos: [],
        primaryPhotoId: null,
      };
    });

    const avgConfidence =
      rooms.length > 0
        ? rooms.reduce((s, r) => s + r.confidence, 0) / rooms.length
        : 0;

    const reviewRequired = avgConfidence < 0.5 || rooms.length === 0;
    console.log(
      `[FloorPlan] result — rooms=${rooms.length} avgConfidence=${avgConfidence.toFixed(2)}` +
      ` reviewRequired=${reviewRequired} dimensionsEstimated=${dimensionsEstimated}`
    );
    return { rooms, reviewRequired, dimensionsEstimated };
  }
}
