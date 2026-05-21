import fs from 'fs';
let content = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf-8');
content = content.replace(
  ': (seat.hand ? "border-white/20 text-white/90 bg-black/40 shadow-sm hover:bg-black/60 hover:border-white/40 backdrop-blur-sm" : "border-white/10 text-white bg-black/60 shadow-lg hover:border-white/50 backdrop-blur-[2px]"),',
  ': (seat.hand ? "border-white/20 text-white/90 bg-black/10 shadow-sm hover:bg-black/30 hover:border-white/40 border-[1px]" : "border-white/10 text-white bg-black/60 shadow-lg hover:border-white/50 backdrop-blur-[2px]"),'
);
fs.writeFileSync('src/views/BlackjackTable.tsx', content);
