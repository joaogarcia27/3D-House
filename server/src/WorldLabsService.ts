import fs from 'fs/promises';
import path from 'path';

interface WorldLabsOperation {
  operation_id: string;
  done: boolean;
  response?: {
    imagery?: { pano_url?: string };
    mesh?: { collider_mesh_url?: string };
    splats?: { spz_urls?: Record<string, string> };
    thumbnail_url?: string;
  };
  error?: unknown;
}

export class WorldLabsService {
  private worldLabsKey: string;
  private falKey: string;

  constructor() {
    this.worldLabsKey = process.env.WORLD_LABS_API_KEY ?? '';
    this.falKey = process.env.FAL_API_KEY ?? '';
  }

  async generatePanorama(
    photoPath: string,
    label: string,
    outputDir: string,
    jobId: string
  ): Promise<{ panoramaFilename: string; splatFilename: string | null } | null> {
    if (!this.worldLabsKey) {
      console.warn('[WorldLabs] WORLD_LABS_API_KEY not set — skipping panorama');
      return null;
    }
    if (!this.falKey) {
      console.warn('[WorldLabs] FAL_API_KEY required for photo upload — skipping panorama');
      return null;
    }

    console.log(`[WorldLabs] uploading photo for job=${jobId}`);
    const photoUrl = await this.uploadToFal(photoPath);
    if (!photoUrl) return null;
    console.log(`[WorldLabs] uploaded to fal: ${photoUrl}`);

    console.log(`[WorldLabs] creating world — room="${label}" job=${jobId}`);
    const operationId = await this.createWorld(photoUrl, label);
    if (!operationId) return null;
    console.log(`[WorldLabs] operation started: ${operationId}`);

    const result = await this.pollOperation(operationId);
    if (!result) return null;

    const panoramaImageUrl = result.response?.imagery?.pano_url;
    if (!panoramaImageUrl) {
      console.warn('[WorldLabs] no panorama URL in response:', JSON.stringify(result.response));
      return null;
    }
    console.log(`[WorldLabs] downloading panorama: ${panoramaImageUrl}`);

    try {
      const imgRes = await fetch(panoramaImageUrl);
      if (!imgRes.ok) {
        console.warn(`[WorldLabs] download failed (${imgRes.status})`);
        return null;
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      await fs.mkdir(outputDir, { recursive: true });
      const panoramaFilename = `${jobId}-panorama.png`;
      await fs.writeFile(path.join(outputDir, panoramaFilename), buffer);
      console.log(`[WorldLabs] panorama saved: ${panoramaFilename} (${(buffer.length / 1024).toFixed(1)}KB)`);

      // Also save the 500k Gaussian splat
      const splatUrl = result.response?.splats?.spz_urls?.['500k'];
      let splatFilename: string | null = null;
      if (splatUrl) {
        try {
          const splatRes = await fetch(splatUrl);
          if (splatRes.ok) {
            const splatBuffer = Buffer.from(await splatRes.arrayBuffer());
            splatFilename = `${jobId}-splat.spz`;
            await fs.writeFile(path.join(outputDir, splatFilename), splatBuffer);
            console.log(`[WorldLabs] splat saved: ${splatFilename} (${(splatBuffer.length / 1024).toFixed(1)}KB)`);
          }
        } catch (err) {
          console.warn('[WorldLabs] failed to save splat:', err);
        }
      }

      return { panoramaFilename, splatFilename };
    } catch (err) {
      console.warn('[WorldLabs] failed to save panorama:', err);
      return null;
    }
  }

  private async uploadToFal(photoPath: string): Promise<string | null> {
    const imageData = await fs.readFile(photoPath);
    const ext = path.extname(photoPath).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

    try {
      // Step 1: get a short-lived upload token
      const tokenRes = await fetch(
        'https://rest.alpha.fal.ai/storage/auth/token?storage_type=fal-cdn-v3',
        {
          method: 'POST',
          headers: { 'Authorization': `Key ${this.falKey}`, 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.warn(`[WorldLabs] fal token request failed (${tokenRes.status}):`, body.slice(0, 200));
        return null;
      }
      const { token, base_url } = await tokenRes.json() as { token: string; base_url: string };

      // Step 2: upload file using the token
      const uploadRes = await fetch(`${base_url}/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': mime },
        body: imageData,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.text();
        console.warn(`[WorldLabs] fal upload failed (${uploadRes.status}):`, body.slice(0, 200));
        return null;
      }
      const data = await uploadRes.json() as { access_url: string };
      return data.access_url ?? null;
    } catch (err) {
      console.warn('[WorldLabs] fal upload error:', err);
      return null;
    }
  }

  private async createWorld(photoUrl: string, label: string): Promise<string | null> {
    try {
      const res = await fetch('https://api.worldlabs.ai/marble/v1/worlds:generate', {
        method: 'POST',
        headers: {
          'WLT-Api-Key': this.worldLabsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: label,
          model: 'marble-1.1',
          world_prompt: {
            type: 'image',
            image_prompt: { source: 'uri', uri: photoUrl },
            text_prompt: label,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.warn(`[WorldLabs] create world failed (${res.status}):`, body.slice(0, 300));
        return null;
      }
      const data = await res.json() as { operation_id: string };
      return data.operation_id ?? null;
    } catch (err) {
      console.warn('[WorldLabs] create world error:', err);
      return null;
    }
  }

  private async pollOperation(operationId: string): Promise<WorldLabsOperation | null> {
    const POLL_INTERVAL_MS = 15_000;
    const MAX_WAIT_MS = 15 * 60 * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      try {
        const res = await fetch(
          `https://api.worldlabs.ai/marble/v1/operations/${operationId}`,
          { headers: { 'WLT-Api-Key': this.worldLabsKey } }
        );
        if (!res.ok) {
          console.warn(`[WorldLabs] poll failed (${res.status})`);
          continue;
        }
        const data = await res.json() as WorldLabsOperation;
        console.log(`[WorldLabs] poll operation=${operationId} done=${data.done} elapsed=${elapsed}s`);

        if (data.done) {
          if (data.error) {
            console.warn('[WorldLabs] operation error:', data.error);
            return null;
          }
          return data;
        }
      } catch (err) {
        console.warn('[WorldLabs] poll error:', err);
      }
    }

    console.warn(`[WorldLabs] timed out after 15 minutes: ${operationId}`);
    return null;
  }
}
