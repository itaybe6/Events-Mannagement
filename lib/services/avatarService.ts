import { Platform } from 'react-native';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export type UploadableImage = {
  uri: string;
  fileName?: string;
  mimeType?: string;
  /**
   * Web-only: expo-image-picker can provide a File/Blob directly.
   * Using this avoids unreliable fetch(blob:/file:) behavior.
   */
  file?: Blob;
  /**
   * Optional base64 data (useful when File/Blob is missing).
   */
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

async function base64ToBlob(base64: string, mimeType?: string) {
  const safeMime = mimeType || 'image/jpeg';
  const dataUrl = `data:${safeMime};base64,${base64}`;
  const res = await fetch(dataUrl);
  return await res.blob();
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

export const avatarService = {
  /**
   * Uploads an avatar to the `avatars` bucket and updates `users.avatar_url`.
   * Tries to use a public URL; if not accessible, falls back to a signed URL.
   */
  uploadUserAvatar: async (userId: string, image: UploadableImage): Promise<string> => {
    const ext = guessExtension(image);
    const filePath = `users/${userId}/${Date.now()}.${ext}`;

    let blob: Blob | null =
      image.file ??
      (await (async () => {
        const res = await fetch(image.uri);
        return await res.blob();
      })());

    // Prefer base64 when available (more reliable across platforms)
    let uploadBody: Blob | Uint8Array | null = null;
    if (image.base64) {
      uploadBody = base64ToUint8Array(image.base64);
    } else if (blob) {
      uploadBody = blob;
    }

    if (!uploadBody) {
      throw new Error('Avatar upload failed: missing file data');
    }

    const contentType = guessContentType(ext, image.mimeType || (blob as any)?.type);

    if (uploadBody instanceof Uint8Array) {
      if (uploadBody.byteLength <= 0) {
        throw new Error('Avatar upload failed: selected file is empty');
      }
    } else {
      // For Blob uploads (native)
      const nativeSize = (uploadBody as any)?.size;
      if (typeof nativeSize === 'number' && nativeSize <= 0) {
        // If blob is empty but base64 exists (shouldn't happen), fallback
        if (image.base64) {
          uploadBody = base64ToUint8Array(image.base64);
          if (uploadBody.byteLength <= 0) {
            throw new Error('Avatar upload failed: selected file is empty');
          }
        } else {
          throw new Error('Avatar upload failed: selected file is empty');
        }
      }
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, uploadBody, { upsert: true, contentType });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = publicData.publicUrl;

    // Prefer public URL, but if bucket isn't public / access is blocked, fallback to signed URL
    let finalUrl = publicUrl;
    try {
      const probe = await fetch(publicUrl, { method: 'GET' });
      if (!probe.ok) {
        throw new Error(`Public avatar URL not accessible (${probe.status})`);
      }
    } catch {
      const { data: signedData, error: signError } = await supabaseAdmin.storage
        .from('avatars')
        // 30 days is enough for apps; can be refreshed by re-uploading
        .createSignedUrl(filePath, 60 * 60 * 24 * 30);

      if (!signError && signedData?.signedUrl) {
        finalUrl = signedData.signedUrl;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: finalUrl })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    return finalUrl;
  },
};

