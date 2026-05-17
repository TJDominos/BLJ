const fs = require("fs");
let c = fs.readFileSync("src/views/BlackjackTable.tsx", "utf-8");

// Player Area gap
let beforeC = c;
c = c.replace(
  /"flex w-full justify-center items-end gap-1 sm:gap-6 md:gap-12 lg:gap-20/g,
  '"flex w-full justify-center items-end gap-1 sm:gap-4 md:gap-8 lg:gap-12'
);
if(beforeC !== c) console.log("Replaced player area gap");

// Dealer Avatar Size
beforeC = c;
c = c.replace(
  /<div className="w-12 h-12 rounded-full overflow-hidden border-2 border-\[#1e2025\] shadow-lg bg-\[#2a2d36\] flex items-center justify-center relative">/,
  '<div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden border-2 border-[#1e2025] shadow-lg bg-[#2a2d36] flex items-center justify-center relative">'
);
if(beforeC !== c) console.log("Replaced dealer avatar size");

// Dealer Crown Icon Size
beforeC = c;
c = c.replace(
  /<Crown className="w-6 h-6 text-\[#ffc53d\]" \/>/,
  '<Crown className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-[#ffc53d]" />'
);
if(beforeC !== c) console.log("Replaced dealer crown icon size");

// Dealer Name Size
beforeC = c;
c = c.replace(
  /<span className="text-white\/80 font-bold text-sm tracking-wide">/,
  '<span className="text-white/80 font-bold text-xs sm:text-sm tracking-wide">'
);
if(beforeC !== c) console.log("Replaced dealer name size");


// Let's also check if there's an avatar in the bottom control for the house avatar, or just reduce the margins a bit.
fs.writeFileSync("src/views/BlackjackTable.tsx", c);
console.log("Done");
