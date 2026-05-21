const fs = require('fs');
let code = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

const arcOriginal = `{/* Base curved lines decoration */}
             <div className="absolute top-0 bottom-0 w-full overflow-hidden pointer-events-none flex justify-center items-end z-0">
               {/* Outer golden line */}
               <div className="w-[320%] sm:w-[180%] aspect-[2/1] sm:aspect-square border-t-[8px] sm:border-t-[10px] border-[#c6a364] opacity-70 rounded-[100%] absolute top-[38%] sm:top-[42%] lg:top-[42%] shadow-[0_-2px_4px_rgba(0,0,0,0.8),inset_0_2px_2px_rgba(255,255,255,0.3)]"></div>
               {/* Inner thin golden line */}
               <div className="w-[300%] sm:w-[170%] aspect-[2/1] sm:aspect-square border-t-[2px] border-[#eac574] opacity-50 rounded-[100%] absolute top-[43%] sm:top-[47%] lg:top-[47%] shadow-[0_-1px_2px_rgba(0,0,0,0.8)]"></div>
               {/* Faint inset betting area base line */}
               <div className="w-[280%] sm:w-[160%] aspect-[2/1] sm:aspect-square border-t-[1px] border-[#ffc53d] opacity-20 rounded-[100%] absolute top-[50%] sm:top-[53%] lg:top-[53%]"></div>
             </div>`;

code = code.replace(arcOriginal, '');

const rulesAreaStr = `           {/* Game Rules Center Area */}`;

const newArc = `           {/* Base curved lines decoration */}
           <div className="absolute top-[35%] sm:top-[40%] left-0 right-0 bottom-0 w-full overflow-hidden pointer-events-none flex justify-center items-start z-0 mt-[40px] sm:mt-[60px] md:mt-[80px]">
             {/* Outer golden line */}
             <div className="w-[240%] sm:w-[140%] md:w-[110%] aspect-[2/1] border-t-[8px] sm:border-t-[10px] border-[#c6a364] opacity-70 rounded-[100%] absolute top-0 shadow-[0_-2px_4px_rgba(0,0,0,0.8),inset_0_2px_2px_rgba(255,255,255,0.3)]"></div>
             {/* Inner thin golden line */}
             <div className="w-[230%] sm:w-[130%] md:w-[105%] aspect-[2/1] border-t-[2px] border-[#eac574] opacity-50 rounded-[100%] absolute top-[12px] sm:top-[16px] shadow-[0_-1px_2px_rgba(0,0,0,0.8)]"></div>
             {/* Faint inset betting area base line */}
             <div className="w-[220%] sm:w-[120%] md:w-[100%] aspect-[2/1] border-t-[1px] border-[#ffc53d] opacity-20 rounded-[100%] absolute top-[30px] sm:top-[40px]"></div>
           </div>\n\n           {/* Game Rules Center Area */}`;

code = code.replace(rulesAreaStr, newArc);

fs.writeFileSync('src/views/BlackjackTable.tsx', code);
