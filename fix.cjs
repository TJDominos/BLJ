const fs = require('fs');
let code = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

// replace heights
code = code.replace(/h-\[260px\] sm:h-\[280px\] md:h-\[300px\]/g, 'h-[180px] sm:h-[220px] md:h-[260px] max-h-[35vh]');
// replace seat circles
code = code.replace(/w-14 h-14 sm:w-16 sm:h-16 md:w-\[60px\] md:h-\[60px\] bg-black\/40/g, 'w-[75px] h-[75px] sm:w-[85px] sm:h-[85px] md:w-[95px] md:h-[95px] bg-black/40');
// replace waiting overlay seat size
code = code.replace(/w-14 h-14 sm:w-16 sm:h-16 md:w-\[60px\] md:h-\[60px\] text-\[8px\] sm:text-\[9px\] z-50 shadow-xl bg-black\/60 rounded-full/g, 'w-[75px] h-[75px] sm:w-[85px] sm:h-[85px] md:w-[95px] md:h-[95px] text-[10px] sm:text-[12px] z-50 shadow-xl bg-black/60 rounded-full');

// update seat image size 
// you
code = code.replace(/className="w-8 h-8 sm:w-10 sm:h-10 rounded-full opacity-100 relative z-10"/g, 'className="w-12 h-12 sm:w-14 sm:h-14 rounded-full opacity-100 relative z-10"');
code = code.replace(/className=" absolute -bottom-2/g, 'className="absolute -bottom-2');
// others
code = code.replace(/className="w-8 h-8 sm:w-10 sm:h-10 rounded-full opacity-60 grayscale"/g, 'className="w-12 h-12 sm:w-14 sm:h-14 rounded-full opacity-60 grayscale"');

fs.writeFileSync('src/views/BlackjackTable.tsx', code);
