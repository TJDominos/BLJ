const fs = require("fs");
let c = fs.readFileSync("src/views/BlackjackTable.tsx", "utf-8");

c = c.replace(
  /absolute top-8 left-8 sm:top-16 sm:left-16/g,
  "absolute top-2 left-2 sm:top-8 sm:left-8 lg:top-16 lg:left-16"
);

c = c.replace(
  /absolute top-8 right-8 sm:top-16 sm:right-16/g,
  "absolute top-2 right-2 sm:top-8 sm:right-8 lg:top-16 lg:right-16"
);

// Scale down Game Rules Center Area
c = c.replace(
  /<div className="absolute top-1\/2 left-1\/2 -translate-x-1\/2 -translate-y-1\/2 z-10 px-4 whitespace-nowrap">/g,
  '<div className="absolute top-[45%] sm:top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 px-2 sm:px-4 whitespace-nowrap scale-75 sm:scale-100">'
);

// Scale Top Info
c = c.replace(
  /<div className="bg-\[#1e2025\]\/90 backdrop-blur-sm/g,
  '<div className="bg-[#1e2025]/90 backdrop-blur-sm scale-[0.85] sm:scale-100 origin-top'
);

// Mobile flex fix for Bottom Control Overlay
c = c.replace(
  /absolute bottom-2 sm:bottom-10 w-full flex flex-col items-center/g,
  "absolute bottom-2 sm:bottom-6 md:bottom-10 w-full flex flex-col items-center"
);

fs.writeFileSync("src/views/BlackjackTable.tsx", c);
console.log("Done");
