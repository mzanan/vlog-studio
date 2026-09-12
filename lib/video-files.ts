export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

const pathCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isVideoFile(file: File): boolean {
  if (VIDEO_MIME_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

export function filterVideoFiles(files: File[]): File[] {
  return files
    .filter(isVideoFile)
    .sort((a, b) => pathCollator.compare(relativePathOf(a), relativePathOf(b)));
}
