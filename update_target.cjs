const fs = require('fs');
let content = fs.readFileSync('src/views/host/HostTableView.tsx', 'utf8');

content = content.replace(
  '<label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Target ({Math.max(1, settings.maxSeats - 1)})</label>',
  '<label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Target (Max {Math.max(1, Math.floor(settings.maxSeats * 0.5))})</label>'
);

content = content.replace(
  'className="h-6 w-10 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 text-white"',
  'className={`h-6 w-10 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 ${(settings.tournament?.targetSurvivors === \'\' as any || settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? \'text-red-500\' : \'text-white\'}`}'
);

content = content.replace(
  '                            </div>\n                          )}',
  '                            </div>\n                            {settings.tournament?.targetSurvivors === \'\' as any ? (\n                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>\n                            ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? (\n                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 1 to {Math.max(1, Math.floor(settings.maxSeats * 0.5))}</div>\n                            ) : null}\n                          </div>\n                          )}'
);

// We should be careful with the first replace of the div if there are multiple.
// Let's replace only the first occurrence after isSurvivorCap
let idx = content.indexOf('{settings.tournament?.isSurvivorCap && (');
if (idx > -1) {
  content = content.slice(0, idx) + content.slice(idx).replace(
    '<div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">',
    '<div className="flex flex-col gap-1">\n                              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">'
  );
}

fs.writeFileSync('src/views/host/HostTableView.tsx', content);
