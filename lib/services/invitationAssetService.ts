import { supabase, supabaseAdmin } from '@/lib/supabase';

export type UploadableImage = {
  uri: string;
  fileName?: string;
  mimeType?: string;
  file?: Blob;
  base64?: string;
};

function guessExtension(input?: {
  fileName?: string;
  uri: string;
  mimeType?: string;
  file?: any;
}): string {
  const fileName = input?.fileName ?? input?.file?.name ?? '';
  const uri = input?.uri ?? '';
  const mimeType = input?.mimeType ?? '';

  const fromMime = mimeType.split('/')[1]?.toLowerCase();
  if (fromMime && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fromMime)) {
    return fromMime === 'jpeg' ? 'jpg' : fromMime;
  }

  const candidate = (fileName || uri).split('?')[0];
  const dot = candidate.lastIndexOf('.');
  if (dot !== -1 && dot < candidate.length - 1) {
    const ext = candidate.slice(dot + 1).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  }

  return 'jpg';
}

function guessContentType(ext: string, fallback?: string) {
  if (fallback) return fallback;
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

function base64ToUint8Array(base64: string) {
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const byteLength = (cleaned.length * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let byteIndex = 0;

  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = chars.indexOf(cleaned[i]);
    const c2 = chars.indexOf(cleaned[i + 1]);
    const c3 = chars.indexOf(cleaned[i + 2]);
    const c4 = chars.indexOf(cleaned[i + 3]);

    const triple = (c1 << 18) | (c2 << 12) | ((c3 & 63) << 6) | (c4 & 63);
    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = triple & 0xff;
  }

  return bytes;
}

export const invitationAssetService = {
  /**
   * Uploads an invitation image to the `event-images` bucket (public).
   * Returns the final URL (public, with signed fallback).
   */
  async uploadInvitationImage(eventId: string, image: UploadableImage): Promise<string> {
    const ext = guessExtension(image);
    const filePath = `invitations/${eventId}/${Date.now()}.${ext}`;

    let blob: Blob | null =
      image.file ??
      (await (async () => {
        const res = await fetch(image.uri);
        return await res.blob();
      })());

    let uploadBody: Blob | Uint8Array | null = null;
    if (image.base64) {
      uploadBody = base64ToUint8Array(image.base64);
    } else if (blob) {
      uploadBody = blob;
    }

    if (!uploadBody) {
      throw new Error('Invitation image upload failed: missing file data');
    }

    const contentType = guessContentType(ext, image.mimeType || (blob as any)?.type);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filePath, uploadBody, { upsert: true, contentType });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('event-images').getPublicUrl(filePath);
    const publicUrl = publicData.publicUrl;

    let finalUrl = publicUrl;
    try {
      const probe = await fetch(publicUrl, { method: 'GET' });
      if (!probe.ok) throw new Error('Public invitation image URL not accessible');
    } catch {
      const { data: signedData, error: signError } = await supabaseAdmin.storage
        .from('event-images')
        .createSignedUrl(filePath, 60 * 60 * 24 * 30);

      if (!signError && signedData?.signedUrl) {
        finalUrl = signedData.signedUrl;
      }
    }

    return finalUrl;
  },
};

