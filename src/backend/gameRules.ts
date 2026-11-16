import { gameRules } from '../config/gameRules';
import type { CardSuit, CardValue, PlayingCard } from '../store/gameStore';
import {
  ChaCha20Rng,
  deriveSeedHex,
  isValidSeedHex,
  type ChaCha20State,
} from './serverSdk/prng';

const SUITS: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const DEFAULT_FALLBACK_ROOT_SEED_HEX = '0'.repeat(64);

export function buildOrderedShoe(numDecks = gameRules.deckCount): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value });
      }
    }
  }
  return deck;
}

/**
 * Uses @randseed/server-sdk VRF ChaCha20Rng unbiased Fisher-Yates shuffle
 * (`rng.shuffle` -> `nextBounded(i + 1)`) to generate an authoritative shoe.
 */
export function shuffleShoeWithVrfRng(
  rng: ChaCha20Rng,
  numDecks = gameRules.deckCount
): PlayingCard[] {
  const deck = buildOrderedShoe(numDecks);
  return rng.shuffle(deck);
}

export function createVrfShoe(
  seedOrRng: string | Uint8Array | ChaCha20Rng,
  numDecks = gameRules.deckCount,
  ...domains: string[]
): { deck: PlayingCard[]; rngState: ChaCha20State } {
  let rng: ChaCha20Rng;
  if (seedOrRng instanceof ChaCha20Rng) {
    rng = seedOrRng;
  } else if (typeof seedOrRng === 'string') {
    const normalizedSeedHex = isValidSeedHex(seedOrRng)
      ? seedOrRng
      : deriveSeedHex(DEFAULT_FALLBACK_ROOT_SEED_HEX, 'shoe-seed', seedOrRng);
    rng =
      domains.length > 0
        ? ChaCha20Rng.fromDerived(normalizedSeedHex, ...domains)
        : new ChaCha20Rng(normalizedSeedHex);
  } else {
    rng =
      domains.length > 0
        ? ChaCha20Rng.fromDerived(seedOrRng, ...domains)
        : new ChaCha20Rng(seedOrRng);
  }

  const deck = shuffleShoeWithVrfRng(rng, numDecks);
  return {
    deck,
    rngState: rng.getState(),
  };
}

export function calculateHandScore(cards: PlayingCard[], includeHidden = false): number {
  let score = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.isHidden && !includeHidden) continue;
    if (card.value === 'A') {
      aces += 1;
      score += 11;
    } else if (['K', 'Q', 'J'].includes(card.value)) {
      score += 10;
    } else {
      score += parseInt(card.value, 10);
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  return score;
}

export function calculateBaseRTP(winningRule: 'standard' | 'dealer_wins_ties'): string {
  // Baseline: 8 decks, H17, DOA, DAS, No RSA, Peek, Standard tie
  // Baseline House Edge = 0.65%
  let houseEdge = 0.65;

  // Deck adjustment
  if (gameRules.deckCount === 6) houseEdge -= 0.02;
  else if (gameRules.deckCount === 2) houseEdge -= 0.19;
  else if (gameRules.deckCount === 1) houseEdge -= 0.48;

  if (gameRules.dealerSoft17 === 'stand') houseEdge -= 0.22;

  if (gameRules.doubleOnAnyTwo === false) houseEdge += 0.25;
  if (gameRules.doubleAfterSplit === false) houseEdge += 0.14;

  if (gameRules.maxSplitHands > 1) houseEdge -= 0.07; // Represents RSA
  else if (gameRules.maxSplitHands === 1) houseEdge += 0.0; // No RSA allowed
  if (gameRules.hitSplitAces) houseEdge -= 0.19;

  if (gameRules.dealerNoPeek) houseEdge += 0.11;

  if (winningRule === 'dealer_wins_ties') {
    houseEdge += 8.48;
  }

  const rtp = 100 - houseEdge;
  return rtp.toFixed(2) + '%';
}
