const fs = require('fs');
let text = fs.readFileSync('src/views/host/HostTableView.tsx', 'utf8');

const regex = /                              \/>\n                            <\/div>\n                          \)}/g;

text = text.replace(regex, `                              />
                            </div>
                            {settings.tournament?.targetSurvivors === '' as any ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                            ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 1 to {Math.max(1, Math.floor(settings.maxSeats * 0.5))}</div>
                            ) : null}
                          </div>
                          )}`);

fs.writeFileSync('src/views/host/HostTableView.tsx', text);
