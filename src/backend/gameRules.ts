import { gameRules } from '../config/gameRules';

export function calculateBaseRTP(winningRule: 'standard' | 'dealer_wins_ties'): string {
  // Baseline: 8 decks, H17, DOA, DAS, No RSA, Peek, Standard tie
  // Baseline House Edge = 0.65%
  let houseEdge = 0.65;
  
  // Deck adjustment
  if (gameRules.deckCount === 6) houseEdge -= 0.02;
  else if (gameRules.deckCount === 2) houseEdge -= 0.19;
  else if (gameRules.deckCount === 1) houseEdge -= 0.48;

  if (gameRules.dealerSoft17 === "stand") houseEdge -= 0.22;
  
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
