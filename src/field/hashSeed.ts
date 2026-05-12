export class SeededRandom {
  private state: number;

  public constructor(seed: string) {
    this.state = hashSeed(seed);
  }

  public next(): number {
    this.state += 0x6d2b79f5;
    let mixedState = this.state;
    mixedState = Math.imul(mixedState ^ (mixedState >>> 15), mixedState | 1);
    mixedState ^=
      mixedState + Math.imul(mixedState ^ (mixedState >>> 7), mixedState | 61);
    return ((mixedState ^ (mixedState >>> 14)) >>> 0) / 4294967296;
  }

  public between(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  public integer(minimum: number, maximum: number): number {
    return Math.floor(this.between(minimum, maximum + 1));
  }
}

export function hashSeed(seed: string): number {
  let hashValue = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hashValue ^= seed.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return hashValue >>> 0;
}
