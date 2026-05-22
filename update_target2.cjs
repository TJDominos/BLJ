const fs = require('fs');
let text = fs.readFileSync('src/views/host/HostTableView.tsx', 'utf8');

// Find the line that says: "                              />\n                            </div>\n                          )}"
// and replace it with: "                              />\n                            </div>\n                            {settings.tournament?.targetSurvivors === '' as any ? (\n                              <div className=\"text-[10px] text-red-500 mt-0.5 leading-tight\">Required</div>\n                            ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? (\n                              <div className=\"text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap\">Must be 1 to {Math.max(1, Math.floor(settings.maxSeats * 0.5))}</div>\n                            ) : null}\n                          </div>\n                          )}"

const search = '                              />\n                            </div>\n                          )}';
const replacement = '                              />\n                            </div>\n                            {settings.tournament?.targetSurvivors === \'\' as any ? (\n                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>\n                            ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? (\n                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 1 to {Math.max(1, Math.floor(settings.maxSeats * 0.5))}</div>\n                            ) : null}\n                          </div>\n                          )}';

text = text.replace(search, replacement);

fs.writeFileSync('src/views/host/HostTableView.tsx', text);
