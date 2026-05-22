const fs = require('fs');
let c = fs.readFileSync('src/views/host/HostTableView.tsx', 'utf8');
const lines = c.split('\n');
// We know line 600 is "                          )}"
if (lines[599].includes(')}')) {
  lines[599] = '                          </div>\n                          )}';
  
  // insert validation under line 598
  lines.splice(599, 0, `                            {settings.tournament?.targetSurvivors === '' as any ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                            ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 1 to {Math.max(1, Math.floor(settings.maxSeats * 0.5))}</div>
                            ) : null}`);
                            
  fs.writeFileSync('src/views/host/HostTableView.tsx', lines.join('\n'));
  console.log("Success");
} else {
  console.log("Line 600 mismatch: ", lines[599]);
}
