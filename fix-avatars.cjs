const fs = require('fs');
let code = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

code = code.replace(/className=\{cn\("w-8 h-8 sm:w-10 sm:h-10 rounded-full opacity-100"/g, 'className={cn("w-12 h-12 sm:w-14 sm:h-14 rounded-full opacity-100"');
code = code.replace(/className="w-8 h-8 sm:w-10 sm:h-10 rounded-full opacity-100/g, 'className="w-12 h-12 sm:w-14 sm:h-14 rounded-full opacity-100');

fs.writeFileSync('src/views/BlackjackTable.tsx', code);
