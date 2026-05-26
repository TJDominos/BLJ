import { systemConfig } from './systemConfig';

export const gameRules = {
  dealerSoft17: "stand", // standard is hit soft 17 or stand soft 17. The rule says "always 17"
  blackjackPayout: 1.5, // 3:2
  insurancePayout: 2, // 2:1
  dealerNoPeek: true,
  doubleOnAnyTwo: true, // DOA
  doubleAfterSplit: true,
  maxSplitHands: 1, // No re-splitting allowed
  hitSplitAces: true, // Player can draw multiple cards to split Aces
  deckCount: systemConfig.deckCount,
  shufflePenetration: systemConfig.shufflePenetration, // shuffle on penetration
  sideBets: {
    perfectPair: {
      perfect: 25,
      colored: 12,
      mixed: 5
    },
    twentyOnePlusThree: {
      suitedThreeOfAKind: 100,
      straightFlush: 40,
      threeOfAKind: 30,
      straight: 10,
      flush: 5
    }
  }
};
