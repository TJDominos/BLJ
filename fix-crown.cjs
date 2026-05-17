const fs = require("fs");
let c = fs.readFileSync("src/views/BlackjackTable.tsx", "utf-8");

// Crown in Shoe
c = c.replace(
  /<Crown className="w-6 h-6 text-white\/30" \/>/,
  '<Crown className="w-4 h-4 sm:w-6 sm:h-6 text-white/30" />'
);

fs.writeFileSync("src/views/BlackjackTable.tsx", c);
console.log("Done");
