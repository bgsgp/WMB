import type { Message } from '../../core/provider.js';

/**
 * Extract images from OpenAI-format messages and prepare them for upload to
 * the DeepSeek web API (which references uploaded files via ref_file_ids).
 */

export interface UploadImage {
  /** base64 payload (without data: prefix) */
  base64: string;
  mime: string;
  filename: string;
  /** http(s) URL to download before upload, when base64 is empty */
  remoteUrl?: string;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

/** Walk messages and pull every image part (image_url / input_image / file). */
export function extractImages(messages: Message[]): UploadImage[] {
  const out: UploadImage[] = [];
  for (const m of messages) {
    const content: unknown = m.content;
    if (typeof content === 'string' || !Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as any;
      const url: unknown =
        p?.image_url?.url ??
        p?.input_image?.image_url?.url ??
        p?.file?.file_data ??
        p?.file_data;
      if (typeof url !== 'string' || !url) continue;

      if (url.startsWith('data:')) {
        const m2 = url.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
        if (!m2) continue;
        const mime = m2[1] || 'image/png';
        out.push({
          base64: m2[3],
          mime,
          filename: `upload-${out.length + 1}.${MIME_EXT[mime] || 'png'}`,
        });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        out.push({
          base64: '',
          mime: '',
          filename: `upload-${out.length + 1}.png`,
          remoteUrl: url,
        });
      }
    }
  }
  return out;
}

/** Download a remote image and return it as a base64 UploadImage. */
export async function downloadRemoteImage(img: UploadImage): Promise<UploadImage> {
  if (!img.remoteUrl) return img;
  try {
    const res = await fetch(img.remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    return {
      base64: buf.toString('base64'),
      mime,
      filename: `upload-remote.${MIME_EXT[mime] || 'png'}`,
    };
  } catch (e: any) {
    throw new Error(`下载图片失败 ${img.remoteUrl}: ${(e as Error).message}`);
  }
}
