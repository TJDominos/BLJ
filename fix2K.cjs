const fs = require('fs');
let code = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

code = code.replace(/sm:mb-0 md:min-h-0 md:flex-1 md:h-auto/g, 'flex-1 min-h-0');
code = code.replace(/max-h-\[35vh\]/g, ''); // Remove max height restriction from seats just in case, or make it max-h-min so it scales naturally via flex

fs.writeFileSync('src/views/BlackjackTable.tsx', code);
