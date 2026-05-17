const fs = require("fs");
let c = fs.readFileSync("src/views/BlackjackTable.tsx", "utf-8");

// Card Size
let beforeC = c;
c = c.replace(
  /"w-\[36px\] h-\[52px\] sm:w-\[48px\] sm:h-\[72px\] md:w-\[56px\] md:h-\[84px\]/g,
  '"w-[32px] h-[48px] sm:w-[48px] sm:h-[72px] md:w-[64px] md:h-[96px] lg:w-[84px] lg:h-[120px]'
);
if(beforeC !== c) console.log("Replaced Card Size");

// Dealer Card Empty space
beforeC = c;
c = c.replace(
  /className="w-\[48px\] h-\[68px\] sm:w-\[64px\] sm:h-\[96px\] md:w-\[72px\] md:h-\[104px\]/g,
  'className="w-[42px] h-[62px] sm:w-[56px] sm:h-[80px] md:w-[72px] md:h-[104px] lg:w-[92px] lg:h-[130px]'
);
if(beforeC !== c) console.log("Replaced empty card size");

// Discard pile & Shoe
beforeC = c;
c = c.replace(
  /w-\[48px\] h-\[68px\] sm:w-\[64px\] sm:h-\[96px\] md:w-\[72px\] md:h-\[104px\]/g,
  'w-[40px] h-[60px] sm:w-[56px] sm:h-[80px] md:w-[72px] md:h-[104px] lg:w-[92px] lg:h-[130px]'
);
if(beforeC !== c) console.log("Replaced discard/shoe size");


// Player Area gap
beforeC = c;
c = c.replace(
  /"flex w-full justify-center items-end gap-6 sm:gap-16/g,
  '"flex w-full justify-center items-end gap-1 sm:gap-6 md:gap-12 lg:gap-20'
);
if(beforeC !== c) console.log("Replaced player area gap");

// Seat Empty Wait
beforeC = c;
c = c.replace(
  /seat\.hand \? "absolute top-\[70%\] left-1\/2 -translate-x-1\/2 -translate-y-1\/2 z-30 w-16 h-16 text-\[10px\]" : "relative w-24 h-24 text-xs"/g,
  'seat.hand ? "absolute top-[70%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 text-[9px] sm:text-[10px]" : "relative w-14 h-14 sm:w-20 sm:h-20 lg:w-28 lg:h-28 text-[9px] sm:text-xs"'
);
if(beforeC !== c) console.log("Replaced seat sizes");

// Bet HUD (Bottom Control Overlay) Component size
beforeC = c;
c = c.replace(
  /z-10 w-\[400px\]/g,
  "z-10 w-[95%] sm:w-[400px]"
);
if(beforeC !== c) console.log("Replaced bet HUD size 1");
c = c.replace(
  /w-\[400px\] bg-\[#1e2025\]\/95/g,
  "w-[95%] sm:w-[400px] bg-[#1e2025]/95"
);
if(beforeC !== c) console.log("Replaced history table size");


// Bet input component
beforeC = c;
c = c.replace(
  /w-\[148px\]/g,
  "w-[124px] sm:w-[148px]"
);
if(beforeC !== c) console.log("Replaced bet input component");

c = c.replace(
  /className="flex px-4 py-2 border-y border-white\/5 items-center justify-between"/g,
  'className="flex px-2 sm:px-4 py-1 sm:py-2 border-y border-white/5 items-center justify-between text-sm"'
);

// Action buttons (Hit, Stand, etc.)
beforeC = c;
c = c.replace(
  /className="flex gap-4 pointer-events-auto"/g,
  'className="flex gap-2 sm:gap-4 pointer-events-auto flex-wrap justify-center"'
);
if(beforeC !== c) console.log("Replaced action buttons layout");


fs.writeFileSync("src/views/BlackjackTable.tsx", c);
console.log("Done");
