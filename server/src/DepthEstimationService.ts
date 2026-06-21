import fs from 'fs/promises';
import path from 'path';

interface FalDepthResponse {
  depth_map_url?: string;
  image?: { url: string };
}

export class DepthEstimationService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FAL_API_KEY ?? '';
  }

  async getDepthMap(photoPath: string, outputDir: string, jobId: string): Promise<string | null> {
    if (!this.apiKey) {
      console.warn('[Depth] FAL_API_KEY not set — skipping depth estimation');
      return null;
    }

    console.log(`[Depth] requesting depth map for job=${jobId} photo=${photoPath}`);
    const imageData = await fs.readFile(photoPath);
    const base64 = imageData.toString('base64');
    const ext = path.extname(photoPath).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

    let depthImageUrl: string | null = null;

    try {
      const res = await fetch('https://fal.run/fal-ai/imageutils/depth', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_url: `data:${mime};base64,${base64}` }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (body.includes('Exhausted balance')) {
          console.warn('Depth estimation skipped: fal.ai balance exhausted — top up at fal.ai/dashboard/billing');
        } else {
          console.warn(`Depth estimation failed (${res.status}):`, body.slice(0, 200));
        }
      } else {
        const data = await res.json() as FalDepthResponse;
        depthImageUrl = data.depth_map_url ?? data.image?.url ?? null;
        console.log(`[Depth] fal.ai returned depth URL: ${depthImageUrl ?? '(null)'}`);
      }
    } catch (err) {
      console.warn('Depth estimation request failed:', err);
    }

    if (!depthImageUrl) return null;

    try {
      const imgRes = await fetch(depthImageUrl);
      if (!imgRes.ok) {
        console.warn(`[Depth] failed to download depth image (${imgRes.status})`);
        return null;
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      await fs.mkdir(outputDir, { recursive: true });
      const filename = `${jobId}-depth.png`;
      await fs.writeFile(path.join(outputDir, filename), buffer);
      console.log(`[Depth] saved depth map: ${path.join(outputDir, filename)} (${(buffer.length / 1024).toFixed(1)}KB)`);
      return filename;
    } catch (err) {
      console.warn('[Depth] failed to save depth map:', err);
      return null;
    }
  }
}
