/**
 * Images are stored as base64 data URIs directly in the database (the
 * `images` text[] column already on lodges/units) rather than in object
 * storage. This is a deliberate MVP shortcut so uploads work identically in
 * local dev and on Vercel with zero extra infrastructure (no S3/R2 bucket,
 * no env vars) — but it does not scale well to many large images, since
 * every image round-trips through the database and every page load. Before
 * a real production launch with a meaningful photo library, this should
 * move to real object storage (S3/Cloudflare R2) per the brief's section 41.
 */
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // 1.5MB per image, keeps DB rows and page weight sane
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export class InvalidImageError extends Error {}

export async function filesToDataUris(files: File[]): Promise<string[]> {
  const uris: string[] = [];
  for (const file of files) {
    if (file.size === 0) continue; // an empty <input type="file"> still submits one empty File
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new InvalidImageError(`"${file.name}" isn't a supported image type. Use JPEG, PNG, WEBP or GIF.`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new InvalidImageError(`"${file.name}" is too large. Please use images under 1.5MB.`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    uris.push(`data:${file.type};base64,${buffer.toString("base64")}`);
  }
  return uris;
}
