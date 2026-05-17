const fs = require("fs");
let c = fs.readFileSync("src/views/BlackjackTable.tsx", "utf-8");

// 1. Extract and remove the history block
const histStart = c.indexOf("               {showHistory && (");
const histEndStr = "             )}\n           </AnimatePresence>\n";
const histEnd = c.indexOf(histEndStr, histStart) + histEndStr.length;
let historyBlock = c.substring(histStart, histEnd);
c = c.substring(0, histStart) + c.substring(histEnd);

// Rewrite historyBlock to be relative top-0
historyBlock = historyBlock.replace(
  "className=\"absolute bottom-4 sm:bottom-12 z-50 w-[400px]",
  "className=\"relative top-0 w-full max-w-[400px]"
);

// 2. Extract and remove isShuffling block
const shuffleStartStr = "<AnimatePresence>\n             {isShuffling && (";
const shuffleStart = c.indexOf(shuffleStartStr);
const shuffleEndStr = "             )}\n           </AnimatePresence>\n";
const shuffleEnd = c.indexOf(shuffleEndStr, shuffleStart) + shuffleEndStr.length;
let shuffleBlock = c.substring(shuffleStart, shuffleEnd);
c = c.substring(0, shuffleStart) + c.substring(shuffleEnd);

// 3. Find the correct insertion point
// Top Info Bar ending:
const totalBetEndStr = "               )}\n             </div>";
const totalBetEnd = c.indexOf(totalBetEndStr);
if(totalBetEnd === -1) throw new Error("Could not find totalBetEnd");

const insertPoint = totalBetEnd + totalBetEndStr.length;

const before = c.substring(0, insertPoint);
const after = c.substring(insertPoint);

// Construct exactly how it should be!
const fixedContent = before + "\n" + historyBlock + "\n        </div>\n\n" + shuffleBlock + after;

fs.writeFileSync("src/views/BlackjackTable.tsx", fixedContent);
console.log("Fixed!");
