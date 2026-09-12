import type { PreviewAudioCodec } from "./types.ts";

/** Read MPEG-4 AudioSpecificConfig identity, not just the general 0x40 OTI.
 * Reference: https://mp4ra.org/registered-types/object-types (note 4).
 * Unrecognized configurations fail conservatively; this does not decode audio.
 */
export function mpeg4AudioCodec(bytes: Uint8Array): PreviewAudioCodec {
  let bit = 0;
  const read = (count: number): number => {
    if (bit + count > bytes.length * 8) throw new Error("truncated MPEG-4 AudioSpecificConfig");
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value = value * 2 + ((bytes[bit >>> 3]! >>> (7 - (bit & 7))) & 1);
    return value;
  };
  const objectType = (): number => { const type = read(5); return type === 31 ? 32 + read(6) : type; };
  const sampleRate = (): boolean => { const index = read(4); return index === 15 ? read(24) > 0 : index <= 12; };
  let type = objectType();
  if (!sampleRate()) return "unknown";
  const channels = read(4);
  // Program-config-element layouts require more parsing; do not guess them.
  if (channels === 0 || channels > 7) return "unknown";
  const wrapper = type === 5 || type === 29;
  if (wrapper) {
    if (!sampleRate()) return "unknown";
    type = objectType();
  }
  if (type === 34 && !wrapper) return "mp3";
  if (![1, 2, 3, 4].includes(type)) return "unknown";
  // Require the fixed GASpecificConfig flags, not just an AAC prefix.
  read(1); // frameLengthFlag
  if (read(1)) read(14); // dependsOnCoreCoder and coreCoderDelay
  read(1); // extensionFlag
  return "aac";
}
