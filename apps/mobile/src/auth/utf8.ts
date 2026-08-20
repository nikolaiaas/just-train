const REPLACEMENT_CODE_POINT = 0xfffd;

export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    let codePoint = first;

    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);

      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
        index += 1;
      } else {
        codePoint = REPLACEMENT_CODE_POINT;
      }
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      codePoint = REPLACEMENT_CODE_POINT;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return Uint8Array.from(bytes);
}

function continuation(byte: number | undefined): number {
  if (byte === undefined || (byte & 0xc0) !== 0x80) {
    throw new Error("Den dekrypterede login-session er ugyldig.");
  }

  return byte & 0x3f;
}

export function decodeUtf8(bytes: Uint8Array): string {
  const codePoints: number[] = [];

  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];

    if (first === undefined) {
      break;
    }

    if (first <= 0x7f) {
      codePoints.push(first);
      continue;
    }

    if (first >= 0xc2 && first <= 0xdf) {
      codePoints.push(((first & 0x1f) << 6) | continuation(bytes[index + 1]));
      index += 1;
      continue;
    }

    if (first >= 0xe0 && first <= 0xef) {
      const second = bytes[index + 1];
      const secondValue = continuation(second);
      const thirdValue = continuation(bytes[index + 2]);

      if (
        (first === 0xe0 && (second ?? 0) < 0xa0) ||
        (first === 0xed && (second ?? 0) > 0x9f)
      ) {
        throw new Error("Den dekrypterede login-session er ugyldig.");
      }

      codePoints.push(((first & 0x0f) << 12) | (secondValue << 6) | thirdValue);
      index += 2;
      continue;
    }

    if (first >= 0xf0 && first <= 0xf4) {
      const second = bytes[index + 1];
      const secondValue = continuation(second);
      const thirdValue = continuation(bytes[index + 2]);
      const fourthValue = continuation(bytes[index + 3]);

      if (
        (first === 0xf0 && (second ?? 0) < 0x90) ||
        (first === 0xf4 && (second ?? 0) > 0x8f)
      ) {
        throw new Error("Den dekrypterede login-session er ugyldig.");
      }

      codePoints.push(
        ((first & 0x07) << 18) |
          (secondValue << 12) |
          (thirdValue << 6) |
          fourthValue,
      );
      index += 3;
      continue;
    }

    throw new Error("Den dekrypterede login-session er ugyldig.");
  }

  let decoded = "";

  for (let index = 0; index < codePoints.length; index += 2_048) {
    decoded += String.fromCodePoint(...codePoints.slice(index, index + 2_048));
  }

  return decoded;
}
