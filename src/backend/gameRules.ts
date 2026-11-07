import { gameRules } from '../config/gameRules';
import type { CardSuit, CardValue, PlayingCard } from '../store/gameStore';

const SUITS: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function mulberry32Local(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeterministicShoe(
  seed: number,
  numDecks = gameRules.deckCount
): { deck: PlayingCard[]; prngCalls: number } {
  const rand = mulberry32Local(seed);
  let prngCalls = 0;
  const deck: PlayingCard[] = [];

  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value });
      }
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const r = rand();
    prngCalls++;
    const j = Math.floor(r * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return { deck, prngCalls };
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
