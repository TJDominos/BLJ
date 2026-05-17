import crypto from 'crypto';

interface VrfResponse {
  seed: string;
  hash: string;
}

// Mocking an internet computer VRF call
export async function requestSeedFromIC(): Promise<VrfResponse> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  // Generate random bytes as a mock seed
  const rawSeed = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(rawSeed).digest('hex');
  
  return {
    seed: rawSeed,
    hash: hash
  };
}

export function shuffleCards(deck: any[], seed: string): any[] {
  // Use a simple seeded PRNG logic or just standard shuffle for now
  // In a real VRF context, you would derive PRNG stream from the seed
  let m = deck.length, t, i;
  let seedNum = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // While there remain elements to shuffle...
  while (m) {
    // Basic seeded pseudo random selection
    const random = Math.sin(seedNum++) * 10000;
    i = Math.floor((random - Math.floor(random)) * m--);

    // And swap it with the current element.
    t = deck[m];
    deck[m] = deck[i];
    deck[i] = t;
  }
  return deck;
}
