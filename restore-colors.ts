import * as fs from 'fs';

let content = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

// The gcoin icons
content = content.replace(/bg-\[#5f40a1\] border-\[2px\] border-\[#4a327d\] shadow-\[0_0_4px_rgba\(95,64,161,0.4\)\]/g, 'bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)]');
content = content.replace(/bg-\[#5f40a1\] border-\[2px\] border-\[#4a327d\]/g, 'bg-[#ffc53d] border-[2px] border-[#eaaa08]');
content = content.replace(/bg-\[#5f40a1\] border border-\[#4a327d\]/g, 'bg-[#ffc53d] border border-[#eaaa08]');

// The texts
content = content.replace(/text-\[#5f40a1\]/g, 'text-[#ffc53d]');
content = content.replace(/border-\[#5f40a1\]\/20/g, 'border-[#ffc53d]/20');

// Restore Double button
content = content.replace(/bg-\[#5f40a1\] hover:bg-\[#4a327d\] text-white font-bold uppercase tracking-wider text-sm px-4 py-2 rounded-xl shadow-xl transition-transform active:scale-95 shadow-\[#5f40a1\]\/20/g, 'bg-yellow-600 hover:bg-yellow-500 text-white font-bold uppercase tracking-wider text-sm px-4 py-2 rounded-xl shadow-xl transition-transform active:scale-95 shadow-yellow-500/20');

// Fix Live Tables text (which was text-gold text-[#ffc53d] before, wait, text-[#ffc53d] is good enough)
content = content.replace(/text-white uppercase tracking-widest text-\[#ffc53d\]/g, 'text-white uppercase tracking-widest text-[#ffc53d]'); 
// Wait, the previous file had "text-gold". The script in fix-table-colors.ts replaced `text-gold` with `text-[#5f40a1]`.
// Let's replace remaining text-[#ffc53d] to text-gold just in case it breaks styles expecting text-gold, actually it's fine.
// Wait, the Host Tables button has "bg-[#5f40a1] hover:bg-[#4a327d]". Since I only replaced bg-[#5f40a1] in icons and double button above, the Host Tables button is still purple.

fs.writeFileSync('src/views/BlackjackTable.tsx', content);

