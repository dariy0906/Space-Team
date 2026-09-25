import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const directory = () => path.join(process.cwd(), 'data', 'uploads');
export async function savePhoto(data: FormData, name: string, required = false): Promise<string | undefined> {
  const file = data.get(name);
  if (!(file instanceof File) || file.size === 0) {
    if (required) throw new Error('Прикрепите фото');
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000)
    throw new Error('Фото: JPG, PNG, WebP до 5 МБ');
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid =
    file.type === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216
      : file.type === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('Некорректный формат изображения');
  await mkdir(directory(), { recursive: true });
  const filename =
    randomUUID() + '.' + (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
  await writeFile(path.join(directory(), filename), bytes, { flag: 'wx' });
  return '/api/media/' + filename;
}
/** Compensate a failed DB transaction without deleting arbitrary paths. */
export async function discardPhoto(url: string | undefined): Promise<void> {
  if (!url || !/^\/api\/media\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(url)) return;
  try {
    await unlink(path.join(directory(), path.basename(url)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Upload cleanup failed', error);
  }
}
