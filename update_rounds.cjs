const fs = require('fs');
let c = fs.readFileSync('src/views/host/HostTableView.tsx', 'utf8');

const tSearch = `<div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Rounds (20-1000)</label>
                            <Input 
                              type="number" 
                              value={settings.tournament?.maxRounds || ''}
                              onChange={e => setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: Math.min(1000, Math.max(20, parseInt(e.target.value) || 20)) } })}
                              min="20" max="1000" placeholder="Rnds"
                              className="h-6 w-12 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 text-white"
                            />
                          </div>`;
                          
const tRepl = `<div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1 relative">
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Rounds (20-1000)</label>
                              <Input 
                                type="text" 
                                value={settings.tournament?.maxRounds === '' as any ? '' : settings.tournament?.maxRounds ?? ''}
                                onChange={e => {
                                   let val = e.target.value.replace(/,/g, '');
                                   if (val === '') {
                                     setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: '' as any } })
                                   } else {
                                     setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: parseInt(val) || 0 } })
                                   }
                                }}
                                placeholder="Rnds"
                                className={\`h-6 w-12 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 \${(settings.tournament?.maxRounds === '' as any || settings.tournament!.maxRounds < 20 || settings.tournament!.maxRounds > 1000) ? 'text-red-500' : 'text-white'}\`}
                              />
                            </div>
                            {settings.tournament?.maxRounds === '' as any ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                            ) : (settings.tournament!.maxRounds < 20 || settings.tournament!.maxRounds > 1000) ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 20 to 1000.</div>
                            ) : null}
                          </div>`;

c = c.replace(tSearch, tRepl);
fs.writeFileSync('src/views/host/HostTableView.tsx', c);
