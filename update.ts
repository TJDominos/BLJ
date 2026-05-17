import * as fs from 'fs';
let content = fs.readFileSync('src/views/HostTableView.tsx', 'utf8');

// The w-3.5 h-3.5 and w-3 h-3
content = content.replace(/bg-\[#ffc53d\] border-\[2px\] border-\[#eaaa08\] shadow-\[0_0_4px_rgba\(255,197,61,0.4\)\]/g, 'bg-[#5f40a1] border-[2px] border-[#4a327d] shadow-[0_0_4px_rgba(95,64,161,0.4)]');
content = content.replace(/bg-\[#ffc53d\] border-\[1px\] border-\[#eaaa08\] shadow-\[0_0_2px_rgba\(255,197,61,0.4\)\]/g, 'bg-[#5f40a1] border-[1px] border-[#4a327d] shadow-[0_0_2px_rgba(95,64,161,0.4)]');

// The selects
content = content.replace(/focus:border-\[#ffc53d\]/g, 'focus:border-[#5f40a1]');
content = content.replace(/bg-\[#ffc53d\] hover:bg-\[#eaaa08\] text-black/g, 'bg-[#5f40a1] hover:bg-[#4a327d] text-white');
content = content.replace(/accent-\[#eaaa08\]/g, 'accent-[#5f40a1]');

fs.writeFileSync('src/views/HostTableView.tsx', content);
