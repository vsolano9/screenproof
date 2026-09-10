export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg"]);
export const PREVIEW_EXTENSIONS: ReadonlySet<string> = new Set([".mov", ".m4v", ".mp4"]);
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  ...PREVIEW_EXTENSIONS,
  ".3gp",
  ".avi",
  ".flv",
  ".mkv",
  ".m2ts",
  ".mpeg",
  ".mpg",
  ".mts",
  ".ogv",
  ".ts",
  ".webm",
  ".wmv",
]);

/** Lower-case filename extension including the dot, or an empty string. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return dot > slash ? name.slice(dot).toLowerCase() : "";
}
